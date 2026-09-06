import { EMPTY, issue, readRaw, type NormalizationIssue, type NormalizationResult } from './types.js';

const CURRENCY = /(RUB|RUR|₽|руб(?:ли|лей|\.)?)/giu;

export function normalizeBudget(raw: unknown): NormalizationResult {
  const source = readRaw(raw);
  if (source === null) return EMPTY;

  const cleaned = source.replace(/\s/g, '').replace(CURRENCY, '').trim();

  const issues: NormalizationIssue[] = [];
  const million = /^([\d.,]+)млн\.?$/iu.exec(cleaned);
  const thousand = /^([\d.,]+)тыс\.?$/iu.exec(cleaned);
  const plain = /^[\d.,]+$/.exec(cleaned);

  let amount: number | null = null;
  if (million?.[1] !== undefined) amount = parseFloat(million[1].replace(',', '.')) * 1e6;
  else if (thousand?.[1] !== undefined) amount = parseFloat(thousand[1].replace(',', '.')) * 1e3;
  else if (plain?.[0] !== undefined) amount = parseFloat(plain[0].replace(',', '.'));

  if (amount === null || Number.isNaN(amount)) {
    issues.push(issue('error', 'BAD_BUDGET', 'Формат бюджета не распознан'));
    return { value: source.trim(), changed: false, issues };
  }

  if (amount <= 0) issues.push(issue('error', 'ZERO_BUDGET', 'Бюджет не больше нуля'));
  if (amount > 1e8) issues.push(issue('warning', 'HUGE_BUDGET', 'Бюджет больше 100 млн'));
  if (amount > 0 && amount < 1e4) {
    issues.push(issue('warning', 'TINY_BUDGET', 'Бюджет меньше 10 тыс'));
  }

  const value = String(Math.round(amount));
  return { value, changed: source.trim() !== value, issues };
}
