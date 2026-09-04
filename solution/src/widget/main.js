'use strict';

// Оркестрация Widget Script. Принимает {space, input, output} параметром (не берёт из глобальных
// переменных) — см. solution/PLAN.md#локальная-разработка-и-тестирование-без-доступа-к-mws.
// Один и тот же run() работает и под mock-SDK (devtools/run-local.js), и под реальным MWS —
// последняя строка файла решает, что вызывать в реальном рантайме.
//
// Реализованы Milestones 1-7: настройка -> выбор scope -> нормализация -> дедуп/сопоставление
// со справочниками -> классификация -> базовые аномалии. Задачи/назначение/запуск/отчёт
// (Milestones 8-10) подключаются сюда по мере готовности.

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js.
let schemaLib;
let configLib;
let normalizeLib;
let previewLib;
let matchLib;
let classifyLib;
let anomaliesLib;
if (typeof require === 'function' && !globalThis.__COPILOT_BUNDLED__) {
  // eslint-disable-next-line global-require
  schemaLib = require('../lib/schema');
  // eslint-disable-next-line global-require
  configLib = require('../lib/config');
  // eslint-disable-next-line global-require
  normalizeLib = require('../lib/normalize');
  // eslint-disable-next-line global-require
  previewLib = require('../lib/preview');
  // eslint-disable-next-line global-require
  matchLib = require('../lib/match');
  // eslint-disable-next-line global-require
  classifyLib = require('../lib/classify');
  // eslint-disable-next-line global-require
  anomaliesLib = require('../lib/anomalies');
} else {
  schemaLib = globalThis.CopilotLib.schema;
  configLib = globalThis.CopilotLib.config;
  normalizeLib = globalThis.CopilotLib.normalize;
  previewLib = globalThis.CopilotLib.preview;
  matchLib = globalThis.CopilotLib.match;
  classifyLib = globalThis.CopilotLib.classify;
  anomaliesLib = globalThis.CopilotLib.anomalies;
}

/**
 * Строит plain-object записи, проиндексированный по ЛОГИЧЕСКИМ РОЛЯМ (см. schema.js#WIZARD_ROLES),
 * а не по сырым именам полей реальной таблицы. `fieldsMap` — результат мастера настройки
 * (config.tables.<table>.fields: {role: realFieldId}), собранный через input.fieldAsync — так вся
 * остальная логика (normalize/match/classify/anomalies) работает с ролями, ничего не зная о том,
 * как реальные поля называются у конкретного заказчика (US1/US2, "без жёсткой привязки к ID").
 */
function recordToRoleObject(record, fieldsMap) {
  const obj = { id: record.id };
  for (const [role, fieldId] of Object.entries(fieldsMap)) {
    obj[role] = record.getCellValue(fieldId);
  }
  return obj;
}

/**
 * Заявки — особый случай: помимо "сырых" полей источника (fieldsMap, см. recordToRoleObject —
 * реальные имена могут быть любыми, поэтому обязательно через мастер настройки), у записи есть ещё
 * системные поля, которыми владеет САМ виджет (normalized_.../suggested_.../company_link/... — см.
 * schema.js#SYSTEM_APPLICATION_FIELDS): их создаёт человек при разворачивании структуры (Milestone C)
 * строго с именами по нашей схеме, поэтому для НИХ (и только для них) чтение по имени поля —
 * не хардкод чужих данных, а наша же зафиксированная конвенция (симметрично write-пути в
 * preview.js#resolveFieldId, который так же считает их "системными", если их нет в fieldsMap).
 */
function recordToApplicationObject(record, datasheet, fieldsMap) {
  const obj = recordToRoleObject(record, fieldsMap);
  const byName = new Map(datasheet.fields.map((f) => [f.name, f]));
  for (const sysField of schemaLib.SYSTEM_APPLICATION_FIELDS) {
    const field = byName.get(sysField);
    if (field) obj[sysField] = record.getCellValue(field.id);
  }
  return obj;
}

/** После applied-действий одной фазы — обновляет ЛОКАЛЬНЫЕ объекты заявок, чтобы следующая фаза
 * (например match после normalize) видела свежие normalized_*-значения без лишнего перечитывания
 * датасета. */
function mergeApplied(applications, appliedActions) {
  const byId = new Map(applications.map((a) => [a.id, a]));
  for (const action of appliedActions) {
    if (action.table !== 'applications') continue;
    const app = byId.get(action.recordId);
    if (app) app[action.field] = action.to;
  }
}

async function run(sdk) {
  const { space, output } = sdk;
  output.markdown('# Project Launch Copilot — локальный прогон');

  // "Прогрев" — эмпирически обнаружено на реальном MWS: input.textAsync (первый вызов — в мастере
  // настройки внутри loadOrCreateConfig ниже) не реагирует на ввод пользователя, если до него ни
  // разу не было вызвано ни одного space.*Async. Само возвращаемое значение не используется —
  // важен только факт await. См. solution/docs/PLATFORM-NOTES.md.
  if (typeof space.getActiveDatasheetAsync === 'function') {
    await space.getActiveDatasheetAsync().catch(() => null);
  }

  const config = await configLib.loadOrCreateConfig(sdk);
  const scope = await configLib.selectScope(sdk, config);

  const appsDatasheet = await space.getDatasheetAsync(config.tables.applications.datasheetId);
  const applicationFields = config.tables.applications.fields;
  const records = await scope.view.getRecordsAsync(scope.recordIds ? { recordIds: scope.recordIds } : undefined);
  output.text(`Заявок в выбранном представлении: ${records.length}`);
  const applications = records.map((r) => recordToApplicationObject(r, appsDatasheet, applicationFields));

  const companiesDatasheet = await space.getDatasheetAsync(config.tables.companies.datasheetId);
  const companyFields = config.tables.companies.fields;
  const companies = (await companiesDatasheet.getRecordsAsync()).map((r) => recordToRoleObject(r, companyFields));
  const knownCities = [...new Set(companies.map((c) => c.city).filter(Boolean))];

  // --- Milestone 3: нормализация ---
  const normalizeSuggestions = normalizeLib.buildNormalizationSuggestions(applications, config, { knownCities });
  output.text(`Нормализация: сформировано предложений ${normalizeSuggestions.length}`);
  const normResult = await previewLib.runPreviewCycle(sdk, normalizeSuggestions, config, { groupLabel: 'нормализация' });
  mergeApplied(applications, normResult.applied);

  // --- Milestone 5: дедуп и сопоставление со справочниками ---
  const employeesDatasheet = await space.getDatasheetAsync(config.tables.employees.datasheetId);
  const employeeFields = config.tables.employees.fields;
  const employees = (await employeesDatasheet.getRecordsAsync()).map((r) => recordToRoleObject(r, employeeFields));

  const companyActions = matchLib.findCompanyMatches(applications, companies, config);
  const employeeActions = matchLib.findEmployeeMatches(applications, employees, config);
  const { candidates: duplicateActions } = matchLib.findApplicationDuplicates(applications, config);
  const matchActions = [...companyActions, ...employeeActions, ...duplicateActions];
  output.text(`Сопоставление: компании ${companyActions.length}, сотрудники ${employeeActions.length}, дубли заявок ${duplicateActions.length}`);
  const matchResult = await previewLib.runPreviewCycle(sdk, matchActions, config, { groupLabel: 'сопоставление со справочниками' });
  mergeApplied(applications, matchResult.applied);

  // --- Milestone 6: классификация типа и приоритета ---
  const templatesDatasheet = await space.getDatasheetAsync(config.tables.templates.datasheetId);
  const templateFields = config.tables.templates.fields;
  const templates = (await templatesDatasheet.getRecordsAsync()).map((r) => recordToRoleObject(r, templateFields));
  const typeIndex = classifyLib.buildCanonicalTypeIndex(templates);
  const { actions: classifyActions } = classifyLib.classifyApplications(applications, typeIndex, config);
  output.text(`Классификация: предложений ${classifyActions.length} (канонических типов в справочнике: ${typeIndex.size})`);
  const classifyResult = await previewLib.runPreviewCycle(sdk, classifyActions, config, { groupLabel: 'классификация' });
  mergeApplied(applications, classifyResult.applied);

  // --- Milestone 7: базовые проверки аномалий ---
  const flagsByRecord = anomaliesLib.detectAnomaliesForBatch(applications);
  const flaggedCount = [...flagsByRecord.values()].filter((flags) => flags.length > 0).length;
  output.text(`Аномалии: заявок с хотя бы одним флагом ${flaggedCount} из ${applications.length}`);
  const anomalyActions = anomaliesLib.buildAnomalyActions(applications, flagsByRecord);
  const anomalyResult = await previewLib.runPreviewCycle(sdk, anomalyActions, config, { groupLabel: 'аномалии' });
  mergeApplied(applications, anomalyResult.applied);

  const summaryCounts = {
    checked: applications.length,
    normalizeFixed: normResult.applied.length,
    matchLinked: matchResult.applied.length,
    classified: classifyResult.applied.length,
    anomaliesAcked: anomalyResult.applied.length,
  };
  output.markdown(`## Итог\n${Object.entries(summaryCounts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`);

  return {
    ...summaryCounts,
    appliedActions: [
      ...normResult.applied, ...matchResult.applied, ...classifyResult.applied, ...anomalyResult.applied,
    ],
    skippedActions: [
      ...normResult.skipped, ...matchResult.skipped, ...classifyResult.skipped, ...anomalyResult.skipped,
    ],
  };
}

const widgetModule = { run };

if (typeof module !== 'undefined') module.exports = widgetModule;
// eslint-disable-next-line no-undef
if (typeof space !== 'undefined' && typeof input !== 'undefined' && typeof output !== 'undefined') {
  // eslint-disable-next-line no-undef
  run({ space, input, output });
}
