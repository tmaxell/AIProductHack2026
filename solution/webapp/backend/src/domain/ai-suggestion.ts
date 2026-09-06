import { CANONICAL_CITIES, cityComparable } from './normalize/cities.js';
import type { VersionedChangeSet } from './version.js';

/** Код замечания, по которому значение считается спорным и уходит на разбор. */
export const AMBIGUOUS_CODES = ['UNRECOGNIZED_CITY'] as const;

export interface AmbiguousItem {
  /** Псевдоним записи: настоящий row_id наружу не уходит. */
  readonly ref: string;
  readonly recordId: string;
  readonly field: string;
  readonly value: string;
}

export interface AmbiguousRequest {
  readonly items: readonly AmbiguousItem[];
  /** Допустимые значения: модель выбирает из них, а не сочиняет. */
  readonly allowedValues: readonly string[];
}

export interface AiSuggestion {
  readonly ref: string;
  readonly value: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly reason: string;
}

/**
 * Собирает спорные значения текущей версии. Города не персональные данные,
 * но наружу всё равно уходит только само значение и псевдоним записи.
 */
export function collectAmbiguous(changeSet: VersionedChangeSet): AmbiguousRequest {
  const codes = new Set<string>(AMBIGUOUS_CODES);
  const byId = new Map(changeSet.sourceRecords.map((record) => [record.id, record]));
  const seen = new Map<string, string>();
  const items: AmbiguousItem[] = [];

  for (const issue of changeSet.issues) {
    if (!codes.has(issue.code)) continue;
    const value = byId.get(issue.recordId)?.values[issue.field];
    if (value === null || value === undefined || value.trim() === '') continue;

    let ref = seen.get(issue.recordId);
    if (ref === undefined) {
      ref = `record-${seen.size + 1}`;
      seen.set(issue.recordId, ref);
    }
    items.push({ ref, recordId: issue.recordId, field: issue.field, value: value.trim() });
  }

  return { items, allowedValues: [...CANONICAL_CITIES] };
}

const ALLOWED = new Map(CANONICAL_CITIES.map((city) => [cityComparable(city), city]));
const LEVELS = new Set(['high', 'medium', 'low']);

export function isAiSuggestionList(value: unknown): value is { suggestions: AiSuggestion[] } {
  if (typeof value !== 'object' || value === null) return false;
  const list = (value as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(list)) return false;
  return list.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const s = entry as Record<string, unknown>;
    return typeof s.ref === 'string' && typeof s.value === 'string' &&
      typeof s.reason === 'string' && typeof s.confidence === 'string' &&
      LEVELS.has(s.confidence);
  });
}

/**
 * Модель может ответить чем угодно, поэтому предложение принимается только
 * если оно указывает на известную запись и на значение из разрешённого
 * словаря. Всё остальное отбрасывается, а не превращается в действие.
 */
export function acceptSuggestions(
  request: AmbiguousRequest,
  suggestions: readonly AiSuggestion[],
): { accepted: (AiSuggestion & { recordId: string; field: string; before: string })[]; rejected: number } {
  const byRef = new Map(request.items.map((item) => [item.ref, item]));
  const accepted: (AiSuggestion & { recordId: string; field: string; before: string })[] = [];
  let rejected = 0;

  for (const suggestion of suggestions) {
    const item = byRef.get(suggestion.ref);
    const canonical = ALLOWED.get(cityComparable(suggestion.value));
    if (item === undefined || canonical === undefined || canonical === item.value) {
      rejected += 1;
      continue;
    }
    accepted.push({
      ...suggestion,
      value: canonical,
      recordId: item.recordId,
      field: item.field,
      before: item.value,
    });
  }

  return { accepted, rejected };
}
