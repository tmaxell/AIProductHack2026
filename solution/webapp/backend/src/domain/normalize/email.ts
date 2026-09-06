import { EMPTY, issue, readRaw, type NormalizationIssue, type NormalizationResult } from './types.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: unknown): NormalizationResult {
  const source = readRaw(raw);
  if (source === null) return EMPTY;

  const value = source
    .trim()
    .toLowerCase()
    .replace(/^mailto:/i, '')
    .replace(/\s+/g, '')
    .replace(/;$/, '');

  const issues: NormalizationIssue[] = [];
  if (!EMAIL.test(value)) {
    issues.push(issue('error', 'INVALID_EMAIL', 'Некорректный email'));
  }

  return { value, changed: source.trim() !== value, issues };
}
