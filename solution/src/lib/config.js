'use strict';

// Milestone 2 — мастер конфигурации + выбор scope запуска.
// Контракт и обоснование каждого решения — solution/plan/milestone-02-config-wizard.md.
//
// Локальная эмуляция localStorage: т.к. Script Widget не документирует постоянное хранилище
// (solution/plan/milestone-A-platform-verification.md, вопрос №6), здесь и в реальном браузере
// кэшируется только ID таблицы Config — сам конфиг живёт в самой MWS-таблице, доступной всем.
// В mock-режиме localStorage эмулируется файлом data/derived/local-config-cache.json.

// fs/path — только под Node (локальная разработка); в реальном MWS (браузер) их нет вообще. Но
// важно даже не это: сам текст обращения к встроенным Node-модулям fs/path где-либо в скрипте —
// даже недостижимый за `if (IS_NODE)` — вешает реальный MWS Script Widget на ~минуту без единой
// ошибки (эмпирически проверено, см. solution/docs/PLATFORM-NOTES.md); похоже на статическую
// реакцию платформы на эти конкретные спецификаторы ещё до выполнения кода. Поэтому вся работа с
// fs/path вынесена в solution/src/lib/node-cache.js, который build.js НИКОГДА не включает в
// widget.bundle.js (не в LIB_ORDER) — обращение к node-cache.js ниже недостижимо в браузере/бандле
// точно так же, как раньше был недостижим прямой доступ к fs, но сам этот текст безопасен: это
// обычный относительный require на наш же модуль, как и в остальных lib-файлах.
//
// `&& !globalThis.__COPILOT_BUNDLED__` — потому что в реальном MWS Script Widget `require` тоже
// может существовать как глобальная функция (для разрешённых npm-пакетов); без этой оговорки
// голый `typeof require === 'function'` уходил бы по Node-ветке. Метку выставляет
// solution/build/build.js в самом начале собранного файла.
const IS_NODE = typeof require === 'function' && !globalThis.__COPILOT_BUNDLED__;
const CACHE_KEY = 'copilotConfigCacheV1'; // ключ в localStorage в браузере
let nodeCache = null;
if (IS_NODE) {
  // eslint-disable-next-line global-require
  nodeCache = require('./node-cache');
}

const CONFIG_PAYLOAD_FIELD = 'payload';

const DEFAULT_THRESHOLDS = {
  matchAuto: 0.85,
  matchManualLow: 0.6,
  matchTopK: 3, // сколько вариантов показывать в неоднозначных случаях — US11
  classifyAuto: 0.6,
  classifyManualLow: 0.3, // ниже — классификатор не предлагает вообще (слишком мало сигналов)
};

// Только таблицы, которые реально читает уже реализованная логика (Milestones 1-7). "Проекты",
// "Задачи" и "Copilot Runs" в схеме предусмотрены (см. PLAN.md#целевая-структура-данных-в-mws-tables),
// но ни одно место в коде их пока не читает (Milestones 8-10 не реализованы) — спрашивать про них
// сейчас бессмысленно и утомительно; появятся в мастере, когда те milestone'ы будут готовы (тогда
// же добавится поддержка команды "reconfigure" для их первого заполнения без потери уже введённого).
const TABLE_LABELS = {
  applications: 'Заявки (текущая таблица)',
  companies: 'Компании',
  employees: 'Сотрудники',
  templates: 'Шаблоны задач',
};

function readCache() {
  try {
    if (IS_NODE) {
      return JSON.parse(nodeCache.readFileSync(nodeCache.cachePath));
    }
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeCache(data) {
  if (IS_NODE) {
    nodeCache.writeFileSync(nodeCache.cachePath, JSON.stringify(data, null, 2));
    return;
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

function clearCache() {
  try {
    if (IS_NODE) {
      nodeCache.unlinkSync(nodeCache.cachePath);
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch (e) { /* нечего чистить */ }
}

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js. Раньше здесь было
// импорт WIZARD_ROLES напрямую, что после сборки в один файл конфликтовало бы с
// собственным `const WIZARD_ROLES` внутри schema.js в общей области видимости — назвал локальную
// переменную иначе (wizardRoles) специально, чтобы не плодить одноимённые объявления.
let schemaLib;
let normalizeLib;
if (typeof require === 'function' && !globalThis.__COPILOT_BUNDLED__) {
  // eslint-disable-next-line global-require
  schemaLib = require('./schema');
  // eslint-disable-next-line global-require
  normalizeLib = require('./normalize');
} else {
  schemaLib = globalThis.CopilotLib.schema;
  normalizeLib = globalThis.CopilotLib.normalize;
}
const wizardRoles = schemaLib.WIZARD_ROLES;

// Авто-определение поля мастером настройки ПО СОДЕРЖИМОМУ значений (не по названию поля — реальное
// название может быть каким угодно, см. обсуждение в PLAN.md#авто-детект-по-содержимому). Только для
// ролей с узнаваемым, ОДНОЗНАЧНЫМ форматом, который не путается с другими полями заявки: валюта
// (по словарю кодов/слов) и приоритет (по словарю). Email/телефон/даты НЕ сюда — у заявки их по паре
// (компания vs заявитель, начало vs конец), формат одинаковый у обоих, содержимое не скажет какое из
// двух какое. budget_raw ТОЖЕ не сюда — эмпирически: normalizeBudget слишком охотно "распознаёт"
// любое число после зачистки нецифровых символов, коллизирует с датами/длительностью/ID (проверено
// на dev-sample.csv — 30/30 совпадений budget-детектора нашлось сразу в 4 других полях), margin-проверка
// ниже это отсекла — не ошиблась, но и не помогла: пришлось бы держать порог настолько строгим, что
// он бы никогда не сработал. Спрашивается явно, как раньше.
const CONTENT_DETECTORS = {
  currency_raw: (v) => normalizeLib.normalizeCurrency(v).confidence > 0,
  priority_raw: (v) => Boolean(schemaLib.PRIORITY_DICTIONARY[
    String(v).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '')
  ]),
};
const CONTENT_DETECT_SAMPLE_SIZE = 30;
const CONTENT_DETECT_MIN_SCORE = 0.6; // доля образцов, распознанных детектором — ниже не уверены
const CONTENT_DETECT_MIN_MARGIN = 0.2; // отрыв от второго кандидата — иначе два поля неотличимы

/**
 * Пытается для каждой роли из `roles`, у которой есть детектор в CONTENT_DETECTORS, найти РОВНО
 * ОДНО явно лучшее поле по значениям первых записей датасета. Возвращает {role: Field} только для
 * уверенных однозначных совпадений — если кандидатов несколько с похожим счётом или уверенность
 * ниже порога, роль в результат не попадает и будет спрошена явно через input.fieldAsync, как обычно.
 * Ничего не решает по имени поля — только по факту, что бОльшая часть его значений распознаётся
 * как ожидаемый формат (см. solution/src/lib/normalize.js).
 */
async function detectFieldsByContent(datasheet, roles) {
  const detectableRoles = roles.filter((r) => CONTENT_DETECTORS[r]);
  if (detectableRoles.length === 0) return {};

  const allRecords = await datasheet.getRecordsAsync();
  const sample = allRecords.slice(0, CONTENT_DETECT_SAMPLE_SIZE);
  if (sample.length === 0) return {};

  const valuesByFieldId = new Map(
    datasheet.fields.map((f) => [f.id, sample.map((r) => r.getCellValue(f.id))]),
  );

  const detected = {};
  for (const role of detectableRoles) {
    const scored = datasheet.fields
      .map((field) => {
        const values = valuesByFieldId.get(field.id).filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
        const score = values.length === 0 ? 0 : values.filter(CONTENT_DETECTORS[role]).length / values.length;
        return { field, score };
      })
      .filter((x) => x.score >= CONTENT_DETECT_MIN_SCORE)
      .sort((a, b) => b.score - a.score);
    if (scored.length === 1 || (scored.length > 1 && scored[0].score - scored[1].score >= CONTENT_DETECT_MIN_MARGIN)) {
      detected[role] = scored[0].field;
    }
  }
  return detected;
}

/**
 * Одноразовый мастер настройки (US1 часть 1 + US2). Спрашивает ID каждой связанной таблицы и
 * маппинг логических ролей полей на реальные Field через input.fieldAsync — без единого
 * хардкода ID. Результат сохраняется в записи датасета "Copilot Config".
 */
async function runWizard(sdk) {
  const { space, input, output } = sdk;
  output.markdown('## Мастер настройки Project Launch Copilot');
  output.text('Отвечайте ID таблиц так, как они называются в вашем пространстве MWS Tables.');

  const configDatasheetId = (await input.textAsync('ID таблицы «Copilot Config»:')).trim();
  const tables = {};

  for (const key of Object.keys(TABLE_LABELS)) {
    let id;
    let datasheet;
    if (key === 'applications') {
      // Авто-детект (см. PLAN.md#авто-детект-текущей-таблицы): виджет предполагается установленным
      // прямо в датасете "Заявки" — space.getActiveDatasheetAsync() возвращает именно его, без
      // необходимости просить пользователя вручную вводить ID таблицы, в которой он и так сейчас
      // находится (TABLE_LABELS уже называл её "текущая таблица" — теперь код это подтверждает).
      datasheet = await space.getActiveDatasheetAsync();
      if (!datasheet) {
        // Фолбэк на случай нестандартной установки (например, локальный mock без активного датасета
        // или платформа временно не отдаёт активный датасет) — не блокируем мастер целиком.
        id = (await input.textAsync(`Не удалось определить текущую таблицу автоматически. ID таблицы «${TABLE_LABELS[key]}»:`)).trim();
        datasheet = await space.getDatasheetAsync(id);
      } else {
        id = datasheet.id;
        output.text(`«${TABLE_LABELS[key]}»: определена автоматически как текущая таблица (${id}).`);
      }
    } else {
      id = (await input.textAsync(`ID таблицы «${TABLE_LABELS[key]}»:`)).trim();
      datasheet = await space.getDatasheetAsync(id);
    }
    const autoDetected = await detectFieldsByContent(datasheet, wizardRoles[key]);
    const fields = {};
    for (const role of wizardRoles[key]) {
      if (autoDetected[role]) {
        fields[role] = autoDetected[role].id;
        output.text(`«${TABLE_LABELS[key]}»: поле для роли «${role}» определено автоматически по содержимому значений — «${autoDetected[role].name}».`);
        continue;
      }
      const field = await input.fieldAsync(`«${TABLE_LABELS[key]}»: какое поле соответствует роли «${role}»?`, datasheet);
      fields[role] = field.id;
    }
    tables[key] = { datasheetId: id, fields };
  }

  tables.config = { datasheetId: configDatasheetId };

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

if (typeof module !== 'undefined') {
  module.exports = configModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.config = configModule;
}
