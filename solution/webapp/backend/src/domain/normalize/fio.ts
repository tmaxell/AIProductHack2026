import { EMPTY, issue, readRaw, type NormalizationIssue, type NormalizationResult } from './types.js';

/** Цепочка инициалов: «А.», «А.О.», «а.о.» — в любом регистре. */
const INITIALS = /^(?:\p{L}\.){1,3}$/u;

function capitalize(part: string): string {
  // Инициалы целиком в верхнем регистре: «А.о.» → «А.О.».
  if (INITIALS.test(part)) return part.toUpperCase();
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

export function normalizeFio(raw: unknown): NormalizationResult {
  const source = readRaw(raw);
  if (source === null) return EMPTY;

  const parts = source.replace(/\s+/g, ' ').trim().split(' ');
  const value = parts.map(capitalize).join(' ');

  const issues: NormalizationIssue[] = [];
  if (parts.length < 2) {
    issues.push(issue('warning', 'SHORT_FIO', 'ФИО состоит из одного слова'));
  }

  return { value, changed: source.trim() !== value, issues };
}
