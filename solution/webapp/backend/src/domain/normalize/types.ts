export type IssueSeverity = 'error' | 'warning' | 'info';

export interface NormalizationIssue {
  readonly code: string;
  readonly severity: IssueSeverity;
  readonly message: string;
}

export interface NormalizationResult {
  /** null — исходное значение пустое, правило неприменимо. */
  readonly value: string | null;
  readonly changed: boolean;
  readonly issues: readonly NormalizationIssue[];
}

export type Normalizer = (raw: unknown) => NormalizationResult;

export const EMPTY: NormalizationResult = { value: null, changed: false, issues: [] };

/**
 * Приводит значение поля к строке. Нормализуются только скалярные значения:
 * объект или массив в ячейке — не то, что правило умеет чинить.
 * Пустая строка и пробельный мусор считаются отсутствующим значением.
 */
export function readRaw(raw: unknown): string | null {
  let text: string;
  if (typeof raw === 'string') text = raw;
  else if (typeof raw === 'number' || typeof raw === 'bigint' || typeof raw === 'boolean') {
    text = String(raw);
  } else return null;

  return text.trim() === '' ? null : text;
}

export function issue(
  severity: IssueSeverity,
  code: string,
  message: string,
): NormalizationIssue {
  return { severity, code, message };
}
