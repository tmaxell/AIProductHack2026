import { EMPTY, issue, readRaw, type NormalizationIssue, type NormalizationResult } from './types.js';

/**
 * Известные сокращения и латинские варианты из dev-выборки.
 * Словарь перенесён из прежней реализации без изменений. Расширение списка —
 * продуктовое решение, а не часть переноса: новые сокращения добавляются
 * отдельной задачей.
 */
const ALIASES = new Map<string, string>([
  ['vladivostok', 'Владивосток'],
  ['krasnoyarsk', 'Красноярск'],
  ['nsk', 'Новосибирск'],
  ['екб', 'Екатеринбург'],
  ['нск', 'Новосибирск'],
  ['спб', 'Санкт-Петербург'],
  ['мск', 'Москва'],
  ['члб', 'Челябинск'],
  ['оренб', 'Оренбург'],
  ['томс', 'Томск'],
]);

/**
 * Префикс «г» снимается только когда за ним идёт точка или пробел.
 * Прежняя реализация снимала одну букву «г» с необязательными пробелами и
 * портила названия: «Г. Сочи» → «. Сочи», «Гагарин» → «агарин».
 */
const CITY_PREFIX = /^[гГ](?:\.\s*|\s+)/u;

export function normalizeCity(raw: unknown): NormalizationResult {
  const source = readRaw(raw);
  if (source === null) return EMPTY;

  let value = source.replace(/\s+/g, ' ').trim().replace(CITY_PREFIX, '').trim();

  const alias = ALIASES.get(value.toLowerCase());
  if (alias !== undefined) value = alias;

  // Название населённого пункта — отображаемое собственное имя. Меняем только
  // первый буквенный символ и не применяем title case ко всей строке, чтобы не
  // испортить корректный регистр в значениях вроде «Ростов-на-Дону».
  value = value.replace(/^\p{L}/u, (first) => first.toLocaleUpperCase('ru-RU'));

  const issues: NormalizationIssue[] = [];
  if (/[A-Za-z]/.test(value)) {
    issues.push(
      issue('info', 'LATIN_CITY', 'Название города латиницей: кириллический вариант неизвестен'),
    );
  }

  return { value, changed: source.trim() !== value, issues };
}
