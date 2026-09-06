import type { IssueSeverity } from './normalize/index.js';

export interface CheckIssue {
  readonly field: string;
  readonly code: string;
  readonly severity: IssueSeverity;
  readonly message: string;
}

/**
 * Проверки, которым нужно больше одного поля. Правила из rules.ts работают с
 * одним значением и такое выразить не могут.
 *
 * На вход подаются уже нормализованные значения: сравнивать «06.02.27» и
 * «2027-02-19» напрямую нельзя.
 */
export type RecordCheck = (normalized: Readonly<Record<string, string | null>>) => CheckIssue[];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Дата окончания раньше даты начала. */
const reversedDates: RecordCheck = (values) => {
  const start = values.planned_start;
  const end = values.planned_end;
  if (start === null || end === null || start === undefined || end === undefined) return [];
  if (!ISO.test(start) || !ISO.test(end)) return [];
  if (start <= end) return [];

  return [
    {
      field: 'planned_end',
      code: 'REVERSED_DATES',
      severity: 'error',
      message: `Дата окончания ${end} раньше даты начала ${start}`,
    },
  ];
};

export const RECORD_CHECKS: readonly RecordCheck[] = [reversedDates];

export function runRecordChecks(
  normalized: Readonly<Record<string, string | null>>,
): CheckIssue[] {
  return RECORD_CHECKS.flatMap((check) => check(normalized));
}
