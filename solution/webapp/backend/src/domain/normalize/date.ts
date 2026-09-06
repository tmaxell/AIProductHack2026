import { EMPTY, issue, readRaw, type NormalizationIssue, type NormalizationResult } from './types.js';

const MONTHS = new Map<string, number>([
  ['января', 1], ['февраля', 2], ['марта', 3], ['апреля', 4],
  ['мая', 5], ['июня', 6], ['июля', 7], ['августа', 8],
  ['сентября', 9], ['октября', 10], ['ноября', 11], ['декабря', 12],
]);

interface Parts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function parse(source: string): Parts | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(source);
  if (iso) return { year: +iso[1]!, month: +iso[2]!, day: +iso[3]! };

  const dotted = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(source);
  if (dotted) return { year: +dotted[3]!, month: +dotted[2]!, day: +dotted[1]! };

  const shortYear = /^(\d{2})[./](\d{2})[./](\d{2})$/.exec(source);
  if (shortYear) return { year: 2000 + +shortYear[3]!, month: +shortYear[2]!, day: +shortYear[1]! };

  const verbose = /^(\d{1,2})\s+([а-яё]+)\s+(\d{4})$/iu.exec(source);
  if (verbose) {
    const month = MONTHS.get(verbose[2]!.toLowerCase());
    if (month !== undefined) return { year: +verbose[3]!, month, day: +verbose[1]! };
  }

  return null;
}

/**
 * Проверка календарной существования даты. Прежняя реализация полагалась на
 * объект Date и молча превращала 31.02.2027 в 2027-03-03.
 */
function exists({ year, month, day }: Parts): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function format({ year, month, day }: Parts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeDate(raw: unknown): NormalizationResult {
  const source = readRaw(raw);
  if (source === null) return EMPTY;

  const trimmed = source.trim();
  const issues: NormalizationIssue[] = [];
  const parts = parse(trimmed);

  if (parts === null) {
    issues.push(issue('error', 'BAD_DATE', 'Формат даты не распознан'));
    return { value: trimmed, changed: false, issues };
  }

  if (!exists(parts)) {
    issues.push(
      issue('error', 'IMPOSSIBLE_DATE', `Такой календарной даты не существует: ${trimmed}`),
    );
    return { value: trimmed, changed: false, issues };
  }

  if (parts.year < 2020 || parts.year > 2035) {
    issues.push(issue('warning', 'ODD_DATE', 'Год вне разумного диапазона 2020–2035'));
  }

  const value = format(parts);
  // Сравнение с полным исходным значением, а не с первыми 10 символами:
  // иначе «2027-01-01T00:00:00Z» считалось уже нормализованным.
  return { value, changed: trimmed !== value, issues };
}
