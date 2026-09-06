import { RULES } from './rules.js';
import { runRecordChecks } from './checks.js';
import { fingerprint } from './fingerprint.js';
import type { IssueSeverity } from './normalize/index.js';
import {
  EMPTY_INDEX,
  matchCompany,
  toQuery,
  type CompanyIndex,
  type Confidence,
} from './matching/index.js';

/** Поле, в которое записывается ссылка на запись справочника компаний. */
export const COMPANY_REF_FIELD = 'company_ref_id';

export interface SourceRecord {
  readonly id: string;
  readonly values: Readonly<Record<string, string | null>>;
}

/** Нормализация чинит формат значения, сопоставление связывает со справочником. */
export type ActionKind = 'normalize' | 'match';

/** Одно предлагаемое изменение одного поля одной записи. */
export interface ChangeAction {
  readonly kind: ActionKind;
  /** Детерминированный id: пересчёт того же набора данных даёт тот же id. */
  readonly id: string;
  readonly recordId: string;
  readonly field: string;
  readonly ruleCode: string;
  readonly ruleName: string;
  readonly reason: string;
  readonly group: string;
  readonly before: string | null;
  readonly after: string | null;
  /** Уровень уверенности сопоставления; у нормализации отсутствует. */
  readonly confidence?: Confidence;
  /** Признаки, по которым найдено совпадение: делают рекомендацию объяснимой. */
  readonly evidence?: readonly string[];
}

export interface RecordIssue {
  readonly recordId: string;
  readonly field: string;
  readonly code: string;
  readonly severity: IssueSeverity;
  readonly message: string;
}

export interface ChangeSetSummary {
  readonly records: number;
  readonly actions: number;
  readonly normalizations: number;
  readonly matches: number;
  /** Замечания и предупреждения: требуют внимания человека. */
  readonly attention: number;
  /** Ошибки: изменение предложить нельзя. */
  readonly blocking: number;
}

export interface ChangeSet {
  readonly id: string;
  readonly sourceFingerprint: string;
  readonly createdAt: string;
  readonly actions: readonly ChangeAction[];
  readonly issues: readonly RecordIssue[];
  readonly summary: ChangeSetSummary;
}

export function actionId(recordId: string, ruleCode: string): string {
  return `${recordId}::${ruleCode}`;
}

const COMPANY_RULE = {
  code: 'company_reference',
  name: 'Компания из справочника',
  reason: 'Связывание заявки с записью справочника компаний',
  group: 'Справочники',
} as const;

function matchAction(record: SourceRecord, index: CompanyIndex): {
  action?: ChangeAction;
  issue?: RecordIssue;
} {
  const outcome = matchCompany(
    toQuery({
      name: record.values.company_name,
      inn: record.values.company_inn,
      email: record.values.company_email,
      phone: record.values.company_phone,
      city: record.values.company_city,
    }),
    index,
  );

  if (outcome.kind === 'none') return {};

  if (outcome.kind === 'ambiguous') {
    return {
      issue: {
        recordId: record.id,
        field: COMPANY_REF_FIELD,
        code: 'AMBIGUOUS_COMPANY_MATCH',
        severity: 'warning',
        message:
          `Справочнику соответствуют несколько компаний: ` +
          outcome.candidates.map((candidate) => candidate.reference.id).join(', '),
      },
    };
  }

  if (outcome.kind === 'inactive') {
    return {
      issue: {
        recordId: record.id,
        field: COMPANY_REF_FIELD,
        code: 'INACTIVE_COMPANY_MATCH',
        severity: 'warning',
        message: `Найдена неактивная запись справочника ${outcome.match.reference.id}`,
      },
    };
  }

  const current = record.values[COMPANY_REF_FIELD] ?? null;
  if (current === outcome.match.reference.id) return {};

  return {
    action: {
      kind: 'match',
      id: actionId(record.id, COMPANY_RULE.code),
      recordId: record.id,
      field: COMPANY_REF_FIELD,
      ruleCode: COMPANY_RULE.code,
      ruleName: COMPANY_RULE.name,
      reason: COMPANY_RULE.reason,
      group: COMPANY_RULE.group,
      before: current,
      after: outcome.match.reference.id,
      confidence: outcome.match.confidence,
      evidence: outcome.match.factors.map((factor) => factor.label),
    },
  };
}

export function buildChangeSet(
  records: readonly SourceRecord[],
  companyIndex: CompanyIndex = EMPTY_INDEX,
  now: Date = new Date(),
): ChangeSet {
  const actions: ChangeAction[] = [];
  const issues: RecordIssue[] = [];
  // Нормализованные значения нужны межполевым проверкам: сравнивать
  // «06.02.27» и «2027-02-19» напрямую нельзя.
  const normalized = new Map<string, Record<string, string | null>>();

  // Внешний цикл по правилам: действия приходят уже сгруппированными по
  // правилу в порядке RULES, поэтому отчёт не зависит от того, какие правила
  // сработали на первой записи.
  for (const rule of RULES) {
    for (const record of records) {
      const raw = record.values[rule.field];
      const result = rule.normalize(raw);
      if (result.value === null) continue;

      const bucket = normalized.get(record.id) ?? {};
      // Значение, которое встанет в поле, если предложение принять.
      bucket[rule.field] = result.issues.some((found) => found.severity === 'error')
        ? null
        : result.value;
      normalized.set(record.id, bucket);

      for (const found of result.issues) {
        issues.push({
          recordId: record.id,
          field: rule.field,
          code: found.code,
          severity: found.severity,
          message: found.message,
        });
      }

      if (!result.changed) continue;

      actions.push({
        kind: 'normalize',
        id: actionId(record.id, rule.code),
        recordId: record.id,
        field: rule.field,
        ruleCode: rule.code,
        ruleName: rule.name,
        reason: rule.reason,
        group: rule.group,
        before: raw ?? null,
        after: result.value,
      });
    }
  }

  for (const record of records) {
    for (const found of runRecordChecks(normalized.get(record.id) ?? {})) {
      issues.push({ recordId: record.id, ...found });
    }
  }

  const normalizations = actions.length;

  // Сопоставление идёт после нормализации: у него отдельный смысл и отдельная
  // строка в сводке — это рекомендация связи, а не исправление формата.
  if (companyIndex.size > 0) {
    for (const record of records) {
      const { action, issue: found } = matchAction(record, companyIndex);
      if (action) actions.push(action);
      if (found) issues.push(found);
    }
  }

  const sourceFingerprint = fingerprint(records);

  return {
    id: `cs_${sourceFingerprint.slice(0, 16)}`,
    sourceFingerprint,
    createdAt: now.toISOString(),
    actions,
    issues,
    summary: {
      records: records.length,
      actions: actions.length,
      normalizations,
      matches: actions.length - normalizations,
      attention: issues.filter((found) => found.severity !== 'error').length,
      blocking: issues.filter((found) => found.severity === 'error').length,
    },
  };
}
