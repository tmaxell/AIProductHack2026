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
let configLib;
let normalizeLib;
let previewLib;
let matchLib;
let classifyLib;
let anomaliesLib;
if (typeof require === 'function' && !globalThis.__COPILOT_BUNDLED__) {
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
  configLib = globalThis.CopilotLib.config;
  normalizeLib = globalThis.CopilotLib.normalize;
  previewLib = globalThis.CopilotLib.preview;
  matchLib = globalThis.CopilotLib.match;
  classifyLib = globalThis.CopilotLib.classify;
  anomaliesLib = globalThis.CopilotLib.anomalies;
}

function recordToPlainObject(record, datasheet) {
  const obj = { id: record.id };
  for (const field of datasheet.fields) {
    obj[field.name] = record.getCellValue(field.id);
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
  const records = await scope.view.getRecordsAsync(scope.recordIds ? { recordIds: scope.recordIds } : undefined);
  output.text(`Заявок в выбранном представлении: ${records.length}`);
  const applications = records.map((r) => recordToPlainObject(r, appsDatasheet));

  const companiesDatasheet = await space.getDatasheetAsync(config.tables.companies.datasheetId);
  const companyFields = config.tables.companies.fields;
  const companies = (await companiesDatasheet.getRecordsAsync()).map((r) => recordToPlainObject(r, companiesDatasheet));
  const knownCities = [...new Set(companies.map((c) => c[companyFields.city]).filter(Boolean))];

  // --- Milestone 3: нормализация ---
  const normalizeSuggestions = normalizeLib.buildNormalizationSuggestions(applications, config, { knownCities });
  output.text(`Нормализация: сформировано предложений ${normalizeSuggestions.length}`);
  const normResult = await previewLib.runPreviewCycle(sdk, normalizeSuggestions, config, { groupLabel: 'нормализация' });
  mergeApplied(applications, normResult.applied);

  // --- Milestone 5: дедуп и сопоставление со справочниками ---
  const employeesDatasheet = await space.getDatasheetAsync(config.tables.employees.datasheetId);
  const employeeFields = config.tables.employees.fields;
  const employees = (await employeesDatasheet.getRecordsAsync()).map((r) => recordToPlainObject(r, employeesDatasheet));

  const companyActions = matchLib.findCompanyMatches(applications, companies, config, companyFields);
  const employeeActions = matchLib.findEmployeeMatches(applications, employees, config, employeeFields);
  const { candidates: duplicateActions } = matchLib.findApplicationDuplicates(applications, config);
  const matchActions = [...companyActions, ...employeeActions, ...duplicateActions];
  output.text(`Сопоставление: компании ${companyActions.length}, сотрудники ${employeeActions.length}, дубли заявок ${duplicateActions.length}`);
  const matchResult = await previewLib.runPreviewCycle(sdk, matchActions, config, { groupLabel: 'сопоставление со справочниками' });
  mergeApplied(applications, matchResult.applied);

  // --- Milestone 6: классификация типа и приоритета ---
  const templatesDatasheet = await space.getDatasheetAsync(config.tables.templates.datasheetId);
  const templates = (await templatesDatasheet.getRecordsAsync()).map((r) => recordToPlainObject(r, templatesDatasheet));
  const typeIndex = classifyLib.buildCanonicalTypeIndex(templates, config.tables.templates.fields);
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
