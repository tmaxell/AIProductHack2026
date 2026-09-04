'use strict';

// Milestone 6 — классификация типа и приоритета (базовая, не "углублённая", см.
// solution/PLAN.md#контекст). Контракт — solution/plan/milestone-06-classify.md.

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js.
let utilLib;
if (typeof require === 'function') {
  // eslint-disable-next-line global-require
  utilLib = require('./util');
} else {
  utilLib = globalThis.CopilotLib.util;
}
const { stringSimilarity, tokenize } = utilLib;

/**
 * Строит канонический индекс типов проекта из справочника Шаблонов ЭТОГО прогона — не хардкод,
 * см. критерий готовности в плане: если в тестовых Шаблонах 2 типа, классификатор не должен
 * "знать" про остальные из dev-sample.csv.
 * @returns {Map<string, {roles: Set<string>, skills: Set<string>}>}
 */
function buildCanonicalTypeIndex(templateRows, fieldsMap) {
  const index = new Map();
  for (const row of templateRows) {
    const type = row[fieldsMap.projectType];
    if (!type) continue;
    if (!index.has(type)) index.set(type, { roles: new Set(), skills: new Set() });
    const entry = index.get(type);
    tokenize(row[fieldsMap.requiredRole]).forEach((t) => entry.roles.add(t));
    tokenize(row[fieldsMap.requiredSkills]).forEach((t) => entry.skills.add(t));
  }
  return index;
}

/**
 * Доля токенов ЗАЯВКИ (appTokens), покрытых шаблоном (templateTokens) — не симметричный Jaccard.
 * Шаблон описывает весь тип проекта (~30 задач с разными ролями), поэтому его набор ролей/навыков
 * почти всегда ШИРЕ, чем то, что перечислено в одной конкретной заявке — Jaccard за это наказывал
 * даже идеальные совпадения (полное покрытие заявки при большем объединении множеств давало низкий
 * score). "Покрывает ли шаблон то, что просит заявка" — то, что нам реально нужно для классификации.
 */
function coverage(appTokens, templateTokens) {
  if (appTokens.size === 0) return 0;
  let covered = 0;
  for (const t of appTokens) if (templateTokens.has(t)) covered += 1;
  return covered / appTokens.size;
}

function scoreType(app, type, entry) {
  const nameSim = stringSimilarity(
    String(app.project_type_raw || '').toLowerCase(),
    String(type || '').toLowerCase(),
  );
  const appRoles = new Set(tokenize(app.required_roles_raw));
  const appSkills = new Set(tokenize(app.required_skills_raw));
  const roleOverlap = coverage(appRoles, entry.roles);
  const skillOverlap = coverage(appSkills, entry.skills);
  const score = nameSim * 0.5 + roleOverlap * 0.25 + skillOverlap * 0.25;
  return { type, score, nameSim, roleOverlap, skillOverlap };
}

function describeTypeMatch(c) {
  return `совпадение с шаблоном "${c.type}" по названию (${c.nameSim.toFixed(2)}), ролям (${c.roleOverlap.toFixed(2)}) и навыкам (${c.skillOverlap.toFixed(2)})`;
}

const PRIORITY_DICTIONARY = {
  p1: 'Критический', p2: 'Высокий', p3: 'Средний', p4: 'Низкий',
  1: 'Критический', 2: 'Высокий', 3: 'Средний', 4: 'Низкий',
  критический: 'Критический', высокий: 'Высокий', средний: 'Средний', низкий: 'Низкий',
  critical: 'Критический', high: 'Высокий', medium: 'Средний', normal: 'Средний', low: 'Низкий',
};

/** Общеупотребимые обозначения приоритета (P1..P4, рус/eng слова, 1..4) — не список из CSV, см. план. */
function normalizePriority(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { value: null, confidence: 0, reason: 'empty' };
  }
  const key = String(raw).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '');
  const mapped = PRIORITY_DICTIONARY[key];
  if (mapped) return { value: mapped, confidence: 1, reason: `priority_raw="${raw}" -> словарь приоритетов` };
  return { value: null, confidence: 0, reason: `priority_raw="${raw}" не найдено в словаре приоритетов` };
}

function makeClassifyAction(app, field, to, confidence, reason, bucket, optionIndex) {
  const currentValue = app[field] ?? null;
  return {
    recordId: app.id,
    table: 'applications',
    field,
    from: currentValue,
    to,
    changed: to !== currentValue,
    confidence,
    reason,
    kind: 'classify',
    bucket,
    optionIndex,
  };
}

/**
 * @returns {{actions: Array, results: Array}} actions — Action[] для preview-движка (Milestone 4);
 * results — ClassificationResult[] (см. план), пригодится Milestone 7/8/9/10.
 */
function classifyApplications(applications, canonicalTypeIndex, config) {
  const types = [...canonicalTypeIndex.keys()];
  const actions = [];
  const results = [];

  for (const app of applications) {
    const scored = types
      .map((type) => scoreType(app, type, canonicalTypeIndex.get(type)))
      .sort((a, b) => b.score - a.score);
    const best = scored[0] || null;

    let suggestedType = null;
    const typeConfidence = best ? Math.round(best.score * 100) / 100 : 0;
    let typeReason = best ? describeTypeMatch(best) : 'нет доступных шаблонов для классификации';

    if (best) {
      if (best.score >= config.thresholds.classifyAuto) {
        suggestedType = best.type;
        actions.push(makeClassifyAction(app, 'suggested_project_type', best.type, typeConfidence, typeReason, 'auto', 1));
      } else if (best.score >= config.thresholds.classifyManualLow) {
        typeReason = `нет уверенного совпадения (лучший кандидат "${best.type}", ${typeConfidence.toFixed(2)}) — нужен ручной выбор`;
        scored.slice(0, 2).forEach((c, i) => actions.push(
          makeClassifyAction(app, 'suggested_project_type', c.type, Math.round(c.score * 100) / 100, describeTypeMatch(c), 'manual', i + 1),
        ));
      }
    }

    const priorityResult = normalizePriority(app.priority_raw);
    if (priorityResult.value) {
      actions.push(makeClassifyAction(
        app, 'suggested_priority', priorityResult.value, priorityResult.confidence, priorityResult.reason, 'auto', 1,
      ));
    }

    results.push({
      recordId: app.id,
      suggestedType,
      typeConfidence,
      typeReason,
      suggestedPriority: priorityResult.value,
      priorityConfidence: priorityResult.confidence,
      priorityReason: priorityResult.reason,
    });
  }

  return { actions, results };
}

const classifyModule = {
  buildCanonicalTypeIndex,
  classifyApplications,
  normalizePriority,
};

if (typeof module !== 'undefined') {
  module.exports = classifyModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.classify = classifyModule;
}
