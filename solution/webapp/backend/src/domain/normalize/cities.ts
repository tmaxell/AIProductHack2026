/**
 * Канонические названия городов. Список взят из колонки company_city
 * справочника компаний того же набора данных, а не придуман.
 */
export const CANONICAL_CITIES = [
  'Барнаул', 'Владивосток', 'Волгоград', 'Воронеж', 'Екатеринбург', 'Ижевск',
  'Иркутск', 'Казань', 'Калининград', 'Кемерово', 'Краснодар', 'Красноярск',
  'Москва', 'Нижний Новгород', 'Новосибирск', 'Омск', 'Оренбург', 'Пермь',
  'Ростов-на-Дону', 'Самара', 'Санкт-Петербург', 'Саратов', 'Сочи', 'Томск',
  'Тула', 'Тюмень', 'Уфа', 'Хабаровск', 'Челябинск', 'Ярославль',
] as const;

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Кириллица → латиница детерминирована, обратное направление — нет. */
export function transliterate(value: string): string {
  return [...value.toLowerCase()].map((char) => TRANSLIT[char] ?? char).join('');
}

/**
 * Английские экзонимы, которые встречаются в наборе и не выводятся
 * транслитерацией: «Москва» никогда не даст «moscow».
 */
const EXONYMS: Record<string, string> = {
  moscow: 'Москва',
  'saint petersburg': 'Санкт-Петербург',
  'st. petersburg': 'Санкт-Петербург',
  'st petersburg': 'Санкт-Петербург',
  'nizhny novgorod': 'Нижний Новгород',
  nizhnynovgorod: 'Нижний Новгород',
  'rostov-on-don': 'Ростов-на-Дону',
  perm: 'Пермь',
  tyumen: 'Тюмень',
  kazan: 'Казань',
};

function comparable(value: string): string {
  return value.toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim();
}

/** Латинское написание → каноническое кириллическое, если оно однозначно. */
export const LATIN_TO_CITY: ReadonlyMap<string, string> = new Map([
  ...CANONICAL_CITIES.map((city) => [comparable(transliterate(city)), city] as const),
  ...Object.entries(EXONYMS).map(([latin, city]) => [comparable(latin), city] as const),
]);

/** Частицы внутри составных названий остаются строчными: Ростов-на-Дону. */
const LOWERCASE_PARTICLES = new Set(['на', 'над', 'под', 'при', 'у', 'в', 'за', 'из', 'до', 'от']);

export function titleCaseCity(value: string): string {
  return value
    .split(' ')
    .map((word, wordIndex) =>
      word
        .split('-')
        .map((part, partIndex) => {
          if (part === '') return part;
          const lower = part.toLowerCase();
          if ((wordIndex > 0 || partIndex > 0) && LOWERCASE_PARTICLES.has(lower)) return lower;
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join('-'),
    )
    .join(' ');
}

export const CITY_BY_COMPARABLE: ReadonlyMap<string, string> = new Map(
  CANONICAL_CITIES.map((city) => [comparable(city), city] as const),
);

export { comparable as cityComparable };
