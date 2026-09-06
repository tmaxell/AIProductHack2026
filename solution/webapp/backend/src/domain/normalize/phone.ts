import { EMPTY, issue, readRaw, type NormalizationIssue, type NormalizationResult } from './types.js';

export function normalizePhone(raw: unknown): NormalizationResult {
  const source = readRaw(raw);
  if (source === null) return EMPTY;

  const issues: NormalizationIssue[] = [];
  let digits = source.replace(/\D/g, '');

  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;

  if (source.includes('*')) {
    issues.push(issue('warning', 'MASKED_PHONE', 'Номер маскирован символом *'));
  }
  if (digits.length < 10 || digits.length > 12) {
    issues.push(issue('error', 'BAD_PHONE', 'Некорректная длина телефона'));
  }

  const value = digits.length === 11 ? `+${digits}` : digits;
  return { value, changed: source.trim() !== value, issues };
}
