'use strict';

// Milestone 7 — базовые проверки аномалий. Контракт — solution/plan/milestone-07-anomalies.md.
// Только детерминированные правила, никакой статистики/ML (см. solution/PLAN.md#контекст).

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js.
let normalizeLib;
let utilLib;
if (typeof require === 'function') {
  // eslint-disable-next-line global-require
  normalizeLib = require('./normalize');
  // eslint-disable-next-line global-require
  utilLib = require('./util');
} else {
  normalizeLib = globalThis.CopilotLib.normalize;
  utilLib = globalThis.CopilotLib.util;
}
const { normalizeDuration } = normalizeLib;
const { valuesEqual } = utilLib;

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

// Общеупотребимые русские/английские варианты статуса заявки — общее доменное знание, не список
// строк, подсмотренных в конкретном CSV (см. solution/PLAN.md#данные про принцип "не переобучаться").
const KNOWN_STATUS_KEYS = new Set(['draft', 'черновик', 'review', 'напроверке', 'new', 'новая']);
function normalizeStatusKey(raw) {
  return String(raw).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '');
}

const RULES = [
  {
    code: 'REQUIRED_FIELD_MISSING',
    severity: 'blocking',
    check(r) {
      const missing = [];
      if (isBlank(r.normalized_company_email) && isBlank(r.company_email_raw)) missing.push('email компании');
      if (isBlank(r.company_inn_raw)) missing.push('ИНН');
      if (isBlank(r.normalized_company_name) && isBlank(r.company_name_raw)) missing.push('название компании');
      return missing.length ? `Не заполнено: ${missing.join(', ')}` : null;
    },
  },
  {
    code: 'EMAIL_INVALID',
    severity: 'info',
    check(r) {
      const v = r.normalized_company_email;
      if (isBlank(v)) return null;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : `Email "${v}" не проходит базовую проверку формата`;
    },
  },
  {
    code: 'PHONE_INVALID',
    severity: 'info',
    check(r) {
      const v = r.normalized_company_phone;
      if (isBlank(v)) return null;
      return /^\+7\d{10}$/.test(v) ? null : `Телефон "${v}" не в формате +7XXXXXXXXXX`;
    },
  },
  {
    code: 'TIMELINE_INVALID',
    severity: 'blocking',
    check(r) {
      if (isBlank(r.normalized_planned_start) || isBlank(r.normalized_planned_end)) return null;
      return r.normalized_planned_end <= r.normalized_planned_start
        ? `Срок окончания (${r.normalized_planned_end}) не позже начала (${r.normalized_planned_start})`
        : null;
    },
  },
  {
    code: 'DURATION_MISMATCH',
    severity: 'info',
    check(r) {
      if (isBlank(r.normalized_planned_start) || isBlank(r.normalized_planned_end) || isBlank(r.duration_raw)) return null;
      const parsedDays = normalizeDuration(r.duration_raw).value;
      if (!parsedDays) return null;
      const start = new Date(r.normalized_planned_start);
      const end = new Date(r.normalized_planned_end);
      const actualDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (actualDays <= 0) return null;
      const diffRatio = Math.abs(actualDays - parsedDays) / actualDays;
      return diffRatio > 0.2
        ? `duration_raw подразумевает ${parsedDays} дн., а по датам получается ${actualDays} дн.`
        : null;
    },
  },
  {
    code: 'BUDGET_INVALID',
    severity: 'info',
    check(r) {
      if (r.normalized_budget_amount === null || r.normalized_budget_amount === undefined) {
        return isBlank(r.budget_raw) ? null : `Бюджет не распознан из значения "${r.budget_raw}"`;
      }
      return r.normalized_budget_amount <= 0 ? `Бюджет ${r.normalized_budget_amount} <= 0` : null;
    },
  },
  {
    code: 'CURRENCY_UNKNOWN',
    severity: 'info',
    check(r) {
      if (isBlank(r.currency_raw)) return null;
      return isBlank(r.normalized_currency_code) ? `Валюта "${r.currency_raw}" не распознана` : null;
    },
  },
  {
    code: 'STATUS_UNRECOGNIZED',
    severity: 'info',
    check(r) {
      if (isBlank(r.project_status_raw)) return null;
      return KNOWN_STATUS_KEYS.has(normalizeStatusKey(r.project_status_raw))
        ? null
        : `Статус "${r.project_status_raw}" не распознан`;
    },
  },
  {
    code: 'NO_COMPANY_MATCH',
    severity: 'blocking',
    check(r) {
      return isBlank(r.company_link) ? 'Компания не найдена/не подтверждена' : null;
    },
  },
  {
    code: 'NO_CLASSIFICATION',
    severity: 'blocking',
    check(r) {
      return isBlank(r.suggested_project_type) ? 'Тип проекта не определён' : null;
    },
  },
];

/** @returns {Array} AnomalyFlag[] для ОДНОЙ заявки — правила из RULES, каждое независимо. */
function detectAnomalies(record) {
  const flags = [];
  for (const rule of RULES) {
    const message = rule.check(record);
    if (message) flags.push({ recordId: record.id, code: rule.code, severity: rule.severity, message });
  }
  return flags;
}

/**
 * DUPLICATE_ID_CONFLICT — единственное правило, которому нужен контекст ВСЕГО батча (та же
 * application_id_raw у другой заявки с другой компанией/бюджетом), поэтому оно не влезает
 * в сигнатуру detectAnomalies(record) и считается отдельно.
 * @returns {Map<string, Array>} recordId -> AnomalyFlag[]
 */
function findDuplicateIdConflicts(applications) {
  const byAppId = new Map();
  for (const app of applications) {
    if (isBlank(app.application_id_raw)) continue;
    if (!byAppId.has(app.application_id_raw)) byAppId.set(app.application_id_raw, []);
    byAppId.get(app.application_id_raw).push(app);
  }

  const flagsByRecord = new Map();
  for (const group of byAppId.values()) {
    if (group.length < 2) continue;
    const distinctCompanies = new Set(group.map((a) => a.normalized_company_name || a.company_name_raw));
    const distinctBudgets = new Set(group.map((a) => a.normalized_budget_amount ?? a.budget_raw));
    if (distinctCompanies.size <= 1 && distinctBudgets.size <= 1) continue;
    for (const app of group) {
      if (!flagsByRecord.has(app.id)) flagsByRecord.set(app.id, []);
      flagsByRecord.get(app.id).push({
        recordId: app.id,
        code: 'DUPLICATE_ID_CONFLICT',
        severity: 'info',
        message: `application_id_raw="${app.application_id_raw}" встречается ${group.length} раз(а) с разными компанией/бюджетом`,
      });
    }
  }
  return flagsByRecord;
}

/** @returns {Map<string, Array>} recordId -> AnomalyFlag[] — все правила разом, на весь батч. */
function detectAnomaliesForBatch(applications) {
  const conflicts = findDuplicateIdConflicts(applications);
  const byRecord = new Map();
  for (const app of applications) {
    const flags = detectAnomalies(app).concat(conflicts.get(app.id) || []);
    byRecord.set(app.id, flags);
  }
  return byRecord;
}

function isBlocking(flags) {
  return flags.some((f) => f.severity === 'blocking');
}

/** Никогда не возвращает "Ready to Launch", если среди флагов есть хоть один blocking. */
function resolveReadinessStatus(flags) {
  return isBlocking(flags) ? 'Needs Review' : 'Ready to Launch';
}

function makeAnomalyAction(app, field, to) {
  const currentValue = app[field] ?? null;
  return {
    recordId: app.id,
    table: 'applications',
    field,
    from: currentValue,
    to,
    changed: !valuesEqual(currentValue, to),
    confidence: 1, // информационная запись, не решение пользователя — всегда в авто-группе (bulk "ack")
    reason: 'итог проверок аномалий (Milestone 7)',
    kind: 'anomaly-ack',
  };
}

/** Строит Action[] на запись флагов/заметок/готовности — идёт в тот же preview-движок Milestone 4. */
function buildAnomalyActions(applications, flagsByRecord) {
  const actions = [];
  for (const app of applications) {
    const flags = flagsByRecord.get(app.id) || [];
    const codes = flags.length ? flags.map((f) => f.code) : null;
    const notes = flags.length ? flags.map((f) => f.message).join('; ') : null;
    const readiness = resolveReadinessStatus(flags);

    actions.push(makeAnomalyAction(app, 'anomaly_flags', codes));
    actions.push(makeAnomalyAction(app, 'anomaly_notes', notes));
    actions.push(makeAnomalyAction(app, 'readiness_status', readiness));
  }
  return actions;
}

const anomaliesModule = {
  detectAnomalies,
  detectAnomaliesForBatch,
  findDuplicateIdConflicts,
  isBlocking,
  resolveReadinessStatus,
  buildAnomalyActions,
};

if (typeof module !== 'undefined') {
  module.exports = anomaliesModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.anomalies = anomaliesModule;
}
