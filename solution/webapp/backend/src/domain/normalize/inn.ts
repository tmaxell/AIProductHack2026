import { EMPTY, issue, readRaw, type NormalizationIssue, type NormalizationResult } from './types.js';

export function normalizeInn(raw: unknown): NormalizationResult {
  const source = readRaw(raw);
  if (source === null) return EMPTY;

  const value = source
    .toUpperCase()
    .replace(/^ИНН\s*/iu, '')
    .replace(/\s+/g, '')
    .replace(/\.0$/, '');

  const issues: NormalizationIssue[] = [];
  if (!/^\d{10}$|^\d{12}$/.test(value)) {
    issues.push(
      /^\d+$/.test(value)
        ? issue('error', 'BAD_INN_LEN', 'ИНН: ожидается 10 или 12 цифр')
        : issue('error', 'BAD_INN', 'ИНН содержит не только цифры'),
    );
  }

  return { value, changed: source.trim() !== value, issues };
}
