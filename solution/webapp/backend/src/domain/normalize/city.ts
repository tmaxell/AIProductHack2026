import { EMPTY, issue, readRaw, type NormalizationIssue, type NormalizationResult } from './types.js';
import { CITY_BY_COMPARABLE, cityComparable, LATIN_TO_CITY, titleCaseCity } from './cities.js';

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

  const key = cityComparable(value);

  // Латинское написание разворачивается в каноническое кириллическое:
  // сравнение идёт с транслитерацией известных городов, а не наугад.
  const fromLatin = LATIN_TO_CITY.get(key);
  if (fromLatin !== undefined) value = fromLatin;
  else {
    // «ИЖЕВСК» и «ижевск» — тот же город, что «Ижевск»: берём каноническое
    // написание из словаря, а незнакомое название просто приводим к виду
    // «с заглавной», не выдумывая для него канон.
    const known = CITY_BY_COMPARABLE.get(key);
    value = known ?? titleCaseCity(value);
  }

  const issues: NormalizationIssue[] = [];
  // Опечатки («Челябинкс»), смешанный алфавит («Пеuмь»), сокращения («С-Пб») и
  // обрезанные названия («Ростов-на-Д.») детерминированно не восстановить.
  // Такое значение не выдумывается, а помечается для разбора человеком — при
  // необходимости с помощью AI-панели, которая вызывается явным действием.
  if (!CITY_BY_COMPARABLE.has(cityComparable(value))) {
    issues.push(
      issue(
        'info',
        'UNRECOGNIZED_CITY',
        `Город «${value}» не найден в справочнике: возможна опечатка или сокращение`,
      ),
    );
  }

  return { value, changed: source.trim() !== value, issues };
}
