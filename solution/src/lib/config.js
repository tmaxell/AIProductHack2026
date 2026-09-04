'use strict';

// Milestone 2 — мастер конфигурации + выбор scope запуска.
// Контракт и обоснование каждого решения — solution/plan/milestone-02-config-wizard.md.
//
// Локальная эмуляция localStorage: т.к. Script Widget не документирует постоянное хранилище
// (solution/plan/milestone-A-platform-verification.md, вопрос №6), здесь и в реальном браузере
// кэшируется только ID таблицы Config — сам конфиг живёт в самой MWS-таблице, доступной всем.
// В mock-режиме localStorage эмулируется файлом data/derived/local-config-cache.json.

const fs = require('node:fs');
const path = require('node:path');

const CACHE_PATH = path.join(__dirname, '..', '..', '..', 'data', 'derived', 'local-config-cache.json');
const CONFIG_PAYLOAD_FIELD = 'payload';

const DEFAULT_THRESHOLDS = {
  matchAuto: 0.85,
  matchManualLow: 0.6,
  matchTopK: 3, // сколько вариантов показывать в неоднозначных случаях — US11
  classifyAuto: 0.6,
};

const TABLE_LABELS = {
  applications: 'Заявки (текущая таблица)',
  companies: 'Компании',
  employees: 'Сотрудники',
  templates: 'Шаблоны задач',
  projects: 'Проекты',
  tasks: 'Задачи',
};

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeCache(data) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2));
}

function clearCache() {
  try { fs.unlinkSync(CACHE_PATH); } catch (e) { /* нечего чистить */ }
}

let WIZARD_ROLES;
try {
  // eslint-disable-next-line global-require
  WIZARD_ROLES = require('./schema').WIZARD_ROLES;
} catch (e) {
  WIZARD_ROLES = null; // после конкатенации в бандл schema.js уже выполнился раньше — см. Milestone 11
}

/**
 * Одноразовый мастер настройки (US1 часть 1 + US2). Спрашивает ID каждой связанной таблицы и
 * маппинг логических ролей полей на реальные Field через input.fieldAsync — без единого
 * хардкода ID. Результат сохраняется в записи датасета "⚙️ Copilot Config".
 */
async function runWizard(sdk) {
  const { space, input, output } = sdk;
  output.markdown('## Мастер настройки Project Launch Copilot');
  output.text('Отвечайте ID таблиц так, как они называются в вашем пространстве MWS Tables.');

  const configDatasheetId = (await input.textAsync('ID таблицы «⚙️ Copilot Config»:')).trim();
  const tables = {};

  for (const key of Object.keys(TABLE_LABELS)) {
    const id = (await input.textAsync(`ID таблицы «${TABLE_LABELS[key]}»:`)).trim();
    const datasheet = await space.getDatasheetAsync(id);
    const fields = {};
    for (const role of WIZARD_ROLES[key]) {
      const field = await input.fieldAsync(`«${TABLE_LABELS[key]}»: какое поле соответствует роли «${role}»?`, datasheet);
      fields[role] = field.id;
    }
    tables[key] = { datasheetId: id, fields };
  }

  tables.config = { datasheetId: configDatasheetId };

  const runsId = (await input.textAsync('ID таблицы «Copilot Runs»:')).trim();
  tables.runs = { datasheetId: runsId };

  const config = {
    version: 1,
    tables,
    thresholds: { ...DEFAULT_THRESHOLDS },
    assignPointers: {},
  };

  await saveConfig(sdk, config);
  output.text('Настройка сохранена — при следующем запуске мастер не понадобится.');
  return config;
}

async function saveConfig(sdk, config) {
  const { space } = sdk;
  const configDatasheet = await space.getDatasheetAsync(config.tables.config.datasheetId);
  const existing = await configDatasheet.getRecordsAsync();
  const payload = JSON.stringify(config);
  if (existing.length > 0) {
    await configDatasheet.updateRecordAsync(existing[0].id, { [CONFIG_PAYLOAD_FIELD]: payload });
  } else {
    await configDatasheet.createRecordAsync({ [CONFIG_PAYLOAD_FIELD]: payload });
  }
  writeCache({ configDatasheetId: config.tables.config.datasheetId });
}

/**
 * @param {object} sdk
 * @param {object} [opts]
 * @param {boolean} [opts.forceReconfigure] - принудительно запустить мастер заново
 *   (в реальном сценарии эквивалент команды "reconfigure", см. план; здесь — явный флаг,
 *   т.к. перехват произвольного текстового ответа на любом из диалогов усложнил бы
 *   код без выигрыша для локальной разработки).
 */
async function loadOrCreateConfig(sdk, opts = {}) {
  const { space, output } = sdk;
  if (opts.forceReconfigure) clearCache();

  const cache = readCache();
  if (cache && cache.configDatasheetId) {
    try {
      const configDatasheet = await space.getDatasheetAsync(cache.configDatasheetId);
      const records = await configDatasheet.getRecordsAsync();
      if (records.length > 0) {
        const raw = records[0].getCellValue(CONFIG_PAYLOAD_FIELD);
        if (raw) {
          output.text('Конфигурация загружена из кэша — мастер настройки не запускается.');
          return JSON.parse(raw);
        }
      }
    } catch (e) {
      output.text(`Кэш конфигурации устарел (${e.message}) — запускаю мастер заново.`);
    }
  }
  return runWizard(sdk);
}

/**
 * Выбор scope запуска (US1 часть 2) — спрашивается на КАЖДОМ запуске, не кэшируется.
 */
async function selectScope(sdk, config) {
  const { space, input } = sdk;
  const appsDatasheet = await space.getDatasheetAsync(config.tables.applications.datasheetId);
  const view = await input.viewAsync('Какое представление «Заявок» обрабатываем?', appsDatasheet);
  return { view, recordIds: null };
}

const configModule = {
  DEFAULT_THRESHOLDS,
  loadOrCreateConfig,
  saveConfig,
  runWizard,
  selectScope,
  clearCache,
};

if (typeof module !== 'undefined') module.exports = configModule;
