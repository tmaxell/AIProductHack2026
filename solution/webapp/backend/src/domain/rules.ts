import {
  normalizeBudget,
  normalizeCity,
  normalizeCompanyName,
  normalizeCurrency,
  normalizeDate,
  normalizeEmail,
  normalizeFio,
  normalizeInn,
  normalizePhone,
  normalizePriority,
  normalizeStatus,
  type Normalizer,
} from './normalize/index.js';

export interface Rule {
  /** Стабильный код правила: попадает в id действия и в отчёт. */
  readonly code: string;
  readonly field: string;
  readonly name: string;
  readonly reason: string;
  readonly group: string;
  readonly normalize: Normalizer;
}

/** Порядок задаёт порядок правил в отчёте. */
export const RULES: readonly Rule[] = [
  {
    code: 'company_email',
    field: 'company_email',
    name: 'Email компании',
    reason: 'Приведение email к нижнему регистру и удаление пробелов',
    group: 'Контакты',
    normalize: normalizeEmail,
  },
  {
    code: 'company_name',
    field: 'company_name',
    name: 'Название компании',
    reason: 'Удаление лишних пробелов и приведение кавычек к единому виду',
    group: 'Компания',
    normalize: normalizeCompanyName,
  },
  {
    code: 'company_phone',
    field: 'company_phone',
    name: 'Телефон компании',
    reason: 'Приведение телефона к единому формату',
    group: 'Контакты',
    normalize: normalizePhone,
  },
  {
    code: 'company_inn',
    field: 'company_inn',
    name: 'ИНН компании',
    reason: 'Удаление префикса «ИНН» и пробелов',
    group: 'Реквизиты',
    normalize: normalizeInn,
  },
  {
    code: 'company_city',
    field: 'company_city',
    name: 'Город',
    reason: 'Снятие префикса «г.» и приведение известных сокращений к полному названию',
    group: 'География',
    normalize: normalizeCity,
  },
  {
    code: 'requester_fio',
    field: 'requester_fio',
    name: 'ФИО заявителя',
    reason: 'Приведение ФИО к единому регистру',
    group: 'Контакты',
    normalize: normalizeFio,
  },
  {
    code: 'requester_email',
    field: 'requester_email',
    name: 'Email заявителя',
    reason: 'Приведение email к нижнему регистру и удаление пробелов',
    group: 'Контакты',
    normalize: normalizeEmail,
  },
  {
    code: 'requester_phone',
    field: 'requester_phone',
    name: 'Телефон заявителя',
    reason: 'Приведение телефона к единому формату',
    group: 'Контакты',
    normalize: normalizePhone,
  },
  {
    code: 'budget',
    field: 'budget',
    name: 'Бюджет',
    reason: 'Очистка валюты и приведение «млн»/«тыс.» к числу',
    group: 'Финансы',
    normalize: normalizeBudget,
  },
  {
    code: 'currency',
    field: 'currency',
    name: 'Валюта',
    reason: 'Приведение к коду ISO 4217',
    group: 'Финансы',
    normalize: normalizeCurrency,
  },
  {
    code: 'planned_start',
    field: 'planned_start',
    name: 'Дата начала',
    reason: 'Приведение даты к формату ГГГГ-ММ-ДД',
    group: 'Сроки',
    normalize: normalizeDate,
  },
  {
    code: 'planned_end',
    field: 'planned_end',
    name: 'Дата окончания',
    reason: 'Приведение даты к формату ГГГГ-ММ-ДД',
    group: 'Сроки',
    normalize: normalizeDate,
  },
  {
    code: 'priority',
    field: 'priority',
    name: 'Приоритет',
    reason: 'Приведение к шкале, которую использует таблица задач',
    group: 'Классификация',
    normalize: normalizePriority,
  },
  {
    code: 'status',
    field: 'status',
    name: 'Статус заявки',
    reason: 'Приведение статуса к единому написанию',
    group: 'Классификация',
    normalize: normalizeStatus,
  },
];

export const RULES_BY_CODE = new Map(RULES.map((rule) => [rule.code, rule]));
