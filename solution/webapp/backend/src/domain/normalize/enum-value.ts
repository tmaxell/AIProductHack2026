import { EMPTY, issue, readRaw, type NormalizationResult } from './types.js';

/**
 * Приведение значения к словарю допустимых. Словари не выдуманы: целевые
 * значения взяты из самого набора данных — из полей task_priority,
 * template_default_priority и из написаний, которые уже встречаются.
 */
export function createEnumNormalizer(
  aliases: ReadonlyMap<string, string>,
  code: string,
  message: string,
): (raw: unknown) => NormalizationResult {
  return (raw) => {
    const source = readRaw(raw);
    if (source === null) return EMPTY;

    const canonical = aliases.get(source.trim().toLowerCase());
    if (canonical === undefined) {
      return { value: source.trim(), changed: false, issues: [issue('warning', code, message)] };
    }

    return { value: canonical, changed: source.trim() !== canonical, issues: [] };
  };
}

function mapping(groups: Record<string, readonly string[]>): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const [canonical, variants] of Object.entries(groups)) {
    aliases.set(canonical.toLowerCase(), canonical);
    for (const variant of variants) aliases.set(variant.toLowerCase(), canonical);
  }
  return aliases;
}

/** Код валюты по ISO 4217; RUB уже встречается в данных наравне с остальными. */
export const normalizeCurrency = createEnumNormalizer(
  mapping({ RUB: ['rur', 'руб.', 'руб', 'рубли', 'рублей', '₽'] }),
  'CURRENCY_UNKNOWN',
  'Валюта не распознана',
);

/** Шкала совпадает с task_priority и template_default_priority в том же наборе. */
export const normalizePriority = createEnumNormalizer(
  mapping({
    Критический: ['1', 'p1', 'critical', 'asap', 'горит'],
    Высокий: ['2', 'p2', 'high', 'срочно'],
    Средний: ['3', 'p3', 'medium', 'нормальный'],
    Низкий: ['4', 'p4', 'low', 'обычный'],
  }),
  'PRIORITY_UNRECOGNIZED',
  'Приоритет не распознан',
);

export const normalizeStatus = createEnumNormalizer(
  mapping({
    Новая: ['new'],
    'На проверке': ['review'],
    Черновик: ['draft'],
  }),
  'STATUS_UNRECOGNIZED',
  'Статус не распознан',
);
