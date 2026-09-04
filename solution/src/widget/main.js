'use strict';

// Оркестрация Widget Script. Принимает {space, input, output} параметром (не берёт из глобальных
// переменных) — см. solution/PLAN.md#локальная-разработка-и-тестирование-без-доступа-к-mws.
// Один и тот же run() работает и под mock-SDK (devtools/run-local.js), и под реальным MWS —
// последняя строка файла решает, что вызывать в реальном рантайме.
//
// Сейчас (Milestones 1-4) реализована только первая часть сквозного сценария: настройка ->
// выбор scope -> нормализация -> preview/apply. Дедуп/классификация/аномалии/задачи/назначение/
// запуск (Milestones 5-10) подключаются сюда по мере готовности.

let configLib;
let normalizeLib;
let previewLib;
if (typeof require === 'function') {
  // eslint-disable-next-line global-require
  configLib = require('../lib/config');
  // eslint-disable-next-line global-require
  normalizeLib = require('../lib/normalize');
  // eslint-disable-next-line global-require
  previewLib = require('../lib/preview');
} else {
  // после конкатенации в браузерный бандл (Milestone 11) модули уже объявлены в общей области видимости
  configLib = { loadOrCreateConfig, saveConfig, runWizard, selectScope }; // eslint-disable-line no-undef
  normalizeLib = { buildNormalizationSuggestions }; // eslint-disable-line no-undef
  previewLib = { runPreviewCycle }; // eslint-disable-line no-undef
}

function recordToPlainObject(record, datasheet) {
  const obj = { id: record.id };
  for (const field of datasheet.fields) {
    obj[field.name] = record.getCellValue(field.id);
  }
  return obj;
}

async function run(sdk) {
  const { space, output } = sdk;
  output.markdown('# Project Launch Copilot — локальный прогон');

  const config = await configLib.loadOrCreateConfig(sdk);
  const scope = await configLib.selectScope(sdk, config);

  const appsDatasheet = await space.getDatasheetAsync(config.tables.applications.datasheetId);
  const records = await scope.view.getRecordsAsync(scope.recordIds ? { recordIds: scope.recordIds } : undefined);
  output.text(`Заявок в выбранном представлении: ${records.length}`);

  const applications = records.map((r) => recordToPlainObject(r, appsDatasheet));

  const companiesDatasheet = await space.getDatasheetAsync(config.tables.companies.datasheetId);
  const companyFields = config.tables.companies.fields;
  const companyRecords = await companiesDatasheet.getRecordsAsync();
  const knownCities = [...new Set(
    companyRecords.map((r) => r.getCellValueString(companyFields.city)).filter(Boolean),
  )];

  const suggestions = normalizeLib.buildNormalizationSuggestions(applications, config, { knownCities });
  output.text(`Сформировано предложений по нормализации: ${suggestions.length}`);

  const { applied, skipped } = await previewLib.runPreviewCycle(sdk, suggestions, config, { groupLabel: 'нормализация' });

  output.markdown(`## Итог\n- заявок проверено: ${applications.length}\n- применено исправлений: ${applied.length}\n- пропущено: ${skipped.length}`);

  return {
    checked: applications.length,
    fixed: applied.length,
    skippedCount: skipped.length,
    // Полные списки — не только счётчики: нужны devtools/run-local.js, чтобы построить
    // детальный отчёт (по каждому полю, с примерами "было -> стало" и причиной пропуска).
    appliedActions: applied,
    skippedActions: skipped,
  };
}

const widgetModule = { run };

if (typeof module !== 'undefined') module.exports = widgetModule;
// eslint-disable-next-line no-undef
if (typeof space !== 'undefined' && typeof input !== 'undefined' && typeof output !== 'undefined') {
  // eslint-disable-next-line no-undef
  run({ space, input, output });
}
