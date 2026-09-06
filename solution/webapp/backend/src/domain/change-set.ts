import { RULES } from './rules.js';
import { fingerprint } from './fingerprint.js';
import type { IssueSeverity } from './normalize/index.js';

export interface SourceRecord {
  readonly id: string;
  readonly values: Readonly<Record<string, string | null>>;
}

/** Одно предлагаемое изменение одного поля одной записи. */
export interface ChangeAction {
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

export function buildChangeSet(
  records: readonly SourceRecord[],
  now: Date = new Date(),
): ChangeSet {
  const actions: ChangeAction[] = [];
  const issues: RecordIssue[] = [];

  // Внешний цикл по правилам: действия приходят уже сгруппированными по
  // правилу в порядке RULES, поэтому отчёт не зависит от того, какие правила
  // сработали на первой записи.
  for (const rule of RULES) {
    for (const record of records) {
      const raw = record.values[rule.field];
      const result = rule.normalize(raw);
      if (result.value === null) continue;

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
      attention: issues.filter((found) => found.severity !== 'error').length,
      blocking: issues.filter((found) => found.severity === 'error').length,
    },
  };
}
