import { EMPTY, issue, readRaw, type NormalizationIssue, type NormalizationResult } from './types.js';

const LOCAL_PART = /^[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+$/u;
const DOMAIN_LABEL = /^[\p{L}\p{N}-]+$/u;

function isValidEmail(value: string): boolean {
  if (value.length > 254) return false;

  const parts = value.split('@');
  if (parts.length !== 2) return false;

  const localPart = parts[0];
  const domain = parts[1];
  if (localPart === undefined || domain === undefined) return false;
  if (
    localPart.length === 0 ||
    localPart.length > 64 ||
    localPart.startsWith('.') ||
    localPart.endsWith('.') ||
    localPart.includes('..') ||
    !LOCAL_PART.test(localPart)
  ) {
    return false;
  }

  const labels = domain.split('.');
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        !label.startsWith('-') &&
        !label.endsWith('-') &&
        DOMAIN_LABEL.test(label),
    )
  );
}

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
  if (!isValidEmail(value)) {
    issues.push(issue('error', 'INVALID_EMAIL', 'Некорректный email'));
  }

  return { value, changed: source.trim() !== value, issues };
}
