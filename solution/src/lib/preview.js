'use strict';

// Milestone 4 — движок preview/apply. Контракт — solution/plan/milestone-04-preview-engine.md.
// Единственный механизм подтверждения изменений во всём решении: normalize/match/classify
// формируют массивы `Action`, а этот модуль их показывает и применяет — своей логики
// подтверждения у остальных модулей нет.

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js.
let utilLib;
if (typeof require === 'function') {
  // eslint-disable-next-line global-require
  utilLib = require('./util');
} else {
  utilLib = globalThis.CopilotLib.util;
}
const { valuesEqual } = utilLib;

// Дефолтный порог для всего, что не "link"/"classify" — сейчас это normalize (детерминированные
// правила, свой порог 0.5 зашит в самих функциях normalize.js) и anomaly-ack (аномалии всегда
// confidence:1, информационная запись — всегда попадает в авто-группу через этот же дефолт).
const DEFAULT_AUTO_THRESHOLD = 0.5;
const DEFAULT_SHOW_FLOOR = 0.2;
const CLASSIFY_SHOW_FLOOR = 0.2;

function fmt(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function getAutoThreshold(action, config) {
  if (action.kind === 'link') return config.thresholds.matchAuto;
  if (action.kind === 'classify') return config.thresholds.classifyAuto;
  return DEFAULT_AUTO_THRESHOLD;
}

function getShowFloor(action, config) {
  if (action.kind === 'link') return config.thresholds.matchManualLow;
  if (action.kind === 'classify') return CLASSIFY_SHOW_FLOOR;
  return DEFAULT_SHOW_FLOOR;
}

/** Делит pending-действия на авто/ручные (сгруппированные по record+field) и отбрасывает то, что ниже "порога показа". */
function splitActions(actions, config) {
  const auto = [];
  const manualGroupsMap = new Map();

  for (const action of actions) {
    const autoThreshold = getAutoThreshold(action, config);
    if (action.confidence >= autoThreshold) {
      auto.push(action);
      continue;
    }
    const showFloor = getShowFloor(action, config);
    if (action.confidence >= showFloor) {
      const key = `${action.table}::${action.recordId}::${action.field}`;
      if (!manualGroupsMap.has(key)) manualGroupsMap.set(key, []);
      manualGroupsMap.get(key).push(action);
    }
    // ниже showFloor — не показываем вовсе
  }

  const manualGroups = [...manualGroupsMap.values()];
  for (const group of manualGroups) group.sort((a, b) => b.confidence - a.confidence);

  return { auto, manualGroups };
}

// Для normalize-действий "Было" в таблице показывает сырое значение-источник (displayFrom),
// а не текущее значение поля-назначения (from) — оно используется только для идемпотентности
// (см. solution/src/lib/normalize.js) и на первом прогоне обычно пусто.
function displayFrom(a) {
  return a.displayFrom !== undefined ? a.displayFrom : a.from;
}

function printAutoTable(output, auto) {
  const rows = auto.map((a, i) => ({
    '#': i + 1,
    Таблица: a.table,
    Поле: a.field,
    Было: fmt(displayFrom(a)),
    Станет: fmt(a.to),
    Причина: a.reason,
    Уверенность: a.confidence.toFixed(2),
  }));
  output.table(rows);
}

function printManualTable(output, manualGroups) {
  const rows = [];
  manualGroups.forEach((group, gi) => {
    group.forEach((a, oi) => {
      const letter = String.fromCharCode(97 + oi); // a, b, c...
      rows.push({
        '№': `${gi + 1}${letter}`,
        Запись: a.recordId,
        Поле: a.field,
        Вариант: fmt(a.to),
        Причина: a.reason,
        Уверенность: a.confidence.toFixed(2),
      });
    });
  });
  output.table(rows);
}

/** "all" / "none" / "1,3,5-8" -> Set индексов (1-based). Пустая строка трактуется как "all". */
function parseIndexList(answer, max) {
  const trimmed = (answer || '').trim().toLowerCase();
  if (trimmed === '' || trimmed === 'all') return new Set(Array.from({ length: max }, (_, i) => i + 1));
  if (trimmed === 'none') return new Set();
  const out = new Set();
  for (const part of trimmed.split(',').map((s) => s.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const [, a, b] = range;
      for (let i = Number(a); i <= Number(b); i += 1) out.add(i);
    } else if (/^\d+$/.test(part)) {
      out.add(Number(part));
    } else {
      throw new Error(`Не могу разобрать "${part}" в списке номеров ('all' / 'none' / '1,3,5-8')`);
    }
  }
  return out;
}

/** "12b,15a" -> Map(номер группы -> индекс буквы). Пустая строка -> пустой Map (ничего не выбрано, US11). */
function parseGroupSelections(answer, groupCount) {
  const trimmed = (answer || '').trim().toLowerCase();
  const selections = new Map();
  if (!trimmed) return selections;
  for (const part of trimmed.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)([a-z]?)$/);
    if (!m) throw new Error(`Не могу разобрать "${part}" — ожидался номер группы с буквой варианта, например "12b"`);
    const groupIndex = Number(m[1]);
    const letter = m[2];
    if (groupIndex < 1 || groupIndex > groupCount) throw new Error(`Группы ${groupIndex} не существует (всего групп: ${groupCount})`);
    if (selections.has(groupIndex)) throw new Error(`Группа ${groupIndex} упомянута дважды с разными вариантами`);
    selections.set(groupIndex, letter ? letter.charCodeAt(0) - 97 : '__single__');
  }
  return selections;
}

/**
 * Не даём одной опечатке уронить весь прогон: переспрашиваем тот же вопрос, пока `parseFn`
 * не примет ответ. Ошибки самого input.textAsync (например, в скриптованном режиме кончилась
 * очередь заготовленных ответов) сюда не попадают и падают наружу как есть — это не "плохой
 * ввод", а "больше нечем отвечать".
 */
async function askUntilValid(input, output, question, parseFn) {
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const answer = await input.textAsync(question);
    try {
      return parseFn(answer);
    } catch (err) {
      output.text(`⚠️  ${err.message} Попробуйте ещё раз.`);
    }
  }
}

/**
 * Проверяет и разрешает "сырые" выборы из parseGroupSelections в реальный индекс варианта
 * (0-based) внутри каждой группы — включая случаи, которые раньше падали ПОСЛЕ успешного
 * parseGroupSelections (нужна буква при >1 варианте) или вообще молча игнорировались
 * (несуществующая буква варианта, например "12z" при вариантах только a/b).
 */
function resolveGroupSelections(rawSelections, manualGroups) {
  const resolved = new Map();
  for (const [groupIndex, letterIndex] of rawSelections) {
    const group = manualGroups[groupIndex - 1];
    if (letterIndex === '__single__') {
      if (group.length !== 1) {
        throw new Error(`Группа ${groupIndex}: нужно указать букву варианта (в группе ${group.length} вариантов)`);
      }
      resolved.set(groupIndex, 0);
    } else if (letterIndex < 0 || letterIndex >= group.length) {
      const letter = String.fromCharCode(97 + letterIndex);
      throw new Error(`Группа ${groupIndex}: варианта "${letter}" не существует (всего вариантов: ${group.length})`);
    } else {
      resolved.set(groupIndex, letterIndex);
    }
  }
  return resolved;
}

function parseAndResolveGroupSelections(answer, manualGroups) {
  const raw = parseGroupSelections(answer, manualGroups.length);
  return resolveGroupSelections(raw, manualGroups);
}

function resolveFieldId(config, table, fieldRole) {
  const tableConfig = config.tables[table];
  if (tableConfig && tableConfig.fields && tableConfig.fields[fieldRole]) {
    return tableConfig.fields[fieldRole];
  }
  return fieldRole; // системное поле, которым владеет сам виджет (см. schema.js#SYSTEM_APPLICATION_FIELDS)
}

async function applyActions(sdk, config, applied) {
  const { space } = sdk;
  const byTable = new Map();
  for (const a of applied) {
    if (!byTable.has(a.table)) byTable.set(a.table, new Map());
    const perRecord = byTable.get(a.table);
    if (!perRecord.has(a.recordId)) perRecord.set(a.recordId, {});
    perRecord.get(a.recordId)[resolveFieldId(config, a.table, a.field)] = a.to;
  }

  for (const [table, perRecord] of byTable) {
    const tableConfig = config.tables[table];
    if (!tableConfig) throw new Error(`Таблица "${table}" не настроена в конфигурации`);
    const datasheet = await space.getDatasheetAsync(tableConfig.datasheetId);
    const records = [...perRecord.entries()].map(([id, valuesMap]) => ({ id, valuesMap }));
    if (records.length > 0) await datasheet.updateRecordsAsync(records);
  }
}

/**
 * @param {object} sdk - {space, input, output}
 * @param {Array<object>} actions - массив Action (см. solution/plan/milestone-04-preview-engine.md)
 * @param {object} config - CopilotConfig
 * @param {{groupLabel?: string}} [opts]
 * @returns {Promise<{applied: object[], skipped: object[]}>}
 */
async function runPreviewCycle(sdk, actions, config, opts = {}) {
  const { input, output } = sdk;
  const label = opts.groupLabel ? ` (${opts.groupLabel})` : '';
  const applied = [];
  const skipped = [];

  // Идемпотентность: то, что уже применено (from === to), даже не показываем.
  // skipReason на каждом пропущенном действии — чтобы в отчёте (devtools/run-local.js) было видно
  // ПОЧЕМУ оно пропущено, а не просто голую цифру "пропущено: N".
  const pending = [];
  for (const a of actions) {
    if (valuesEqual(a.from, a.to)) skipped.push({ ...a, skipReason: 'already-applied' });
    else pending.push(a);
  }

  const { auto, manualGroups } = splitActions(pending, config);

  if (auto.length > 0) {
    output.markdown(`### Автоматически применяемые изменения${label} (${auto.length})`);
    printAutoTable(output, auto);
    const chosen = await askUntilValid(
      input,
      output,
      "Какие строки применить? 'all' / 'none' / номера через запятую, например 1,3,5-8",
      (answer) => parseIndexList(answer, auto.length),
    );
    auto.forEach((a, i) => { if (chosen.has(i + 1)) applied.push(a); else skipped.push({ ...a, skipReason: 'rejected-by-user' }); });
  }

  if (manualGroups.length > 0) {
    output.markdown(`### Неоднозначные случаи${label} (${manualGroups.length})`);
    printManualTable(output, manualGroups);
    const selections = await askUntilValid(
      input,
      output,
      'Для каждой неоднозначной строки укажите вариант (например 12b,15a) или не упоминайте номер, чтобы пропустить',
      (answer) => parseAndResolveGroupSelections(answer, manualGroups),
    );
    manualGroups.forEach((group, gi) => {
      const groupIndex = gi + 1;
      if (!selections.has(groupIndex)) {
        group.forEach((a) => skipped.push({ ...a, skipReason: 'unresolved-ambiguous' }));
        return;
      }
      const letterIndex = selections.get(groupIndex);
      group.forEach((a, oi) => {
        if (oi === letterIndex) applied.push(a);
        else skipped.push({ ...a, skipReason: 'other-option-chosen' });
      });
    });
  }

  await applyActions(sdk, config, applied);

  return { applied, skipped };
}

const previewModule = {
  runPreviewCycle,
  parseIndexList,
  parseGroupSelections,
  resolveGroupSelections,
  parseAndResolveGroupSelections,
  splitActions,
  valuesEqual,
};

if (typeof module !== 'undefined') {
  module.exports = previewModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.preview = previewModule;
}
