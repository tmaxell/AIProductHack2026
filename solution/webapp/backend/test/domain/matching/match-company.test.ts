import { describe, expect, test } from 'vitest';
import {
  buildCompanyIndex,
  companyNameKey,
  matchCompany,
  toQuery,
  type CompanyReference,
} from '../../../src/domain/matching/index.js';

const romashka: CompanyReference = {
  id: 'CMP-1',
  legalName: 'ООО «Ромашка Интеграция»',
  shortName: 'Ромашка Интеграция',
  inn: '7712345678',
  email: 'info@romashka.example',
  phone: '+74951234567',
  city: 'Москва',
  aliases: ['Romashka Integratsiya', 'Ромашка Интеграция Москва'],
  active: true,
};

const vektor: CompanyReference = {
  ...romashka,
  id: 'CMP-2',
  legalName: 'АО «Вектор Сеть»',
  shortName: 'Вектор Сеть',
  inn: '7798765432',
  email: 'info@vektor.example',
  phone: '+74957654321',
  city: 'Тула',
  aliases: [],
};

const index = buildCompanyIndex([romashka, vektor]);

function match(values: Parameters<typeof toQuery>[0]) {
  return matchCompany(toQuery(values), index);
}

describe('companyNameKey', () => {
  test('снимает ОПФ, кавычки и пунктуацию', () => {
    expect(companyNameKey('ООО «Ромашка Интеграция»')).toBe('ромашка интеграция');
    expect(companyNameKey('  РОМАШКА   ИНТЕГРАЦИЯ ')).toBe('ромашка интеграция');
  });

  test('не режет слово, которое начинается как ОПФ', () => {
    expect(companyNameKey('Аорта Групп')).toBe('аорта групп');
  });
});

describe('matchCompany', () => {
  test('совпадение по ИНН даёт высокую уверенность', () => {
    const outcome = match({ inn: 'ИНН 77 1234 5678' });

    expect(outcome.kind).toBe('matched');
    if (outcome.kind !== 'matched') return;
    expect(outcome.match.reference.id).toBe('CMP-1');
    expect(outcome.match.confidence).toBe('high');
    expect(outcome.match.factors.map((f) => f.code)).toEqual(['inn']);
  });

  test('название плюс город дают среднюю уверенность', () => {
    const outcome = match({ name: 'ромашка интеграция', city: 'г. Москва' });

    expect(outcome.kind).toBe('matched');
    if (outcome.kind !== 'matched') return;
    expect(outcome.match.confidence).toBe('medium');
    expect(outcome.match.factors.map((f) => f.code)).toEqual(['name', 'city']);
  });

  test('одно только название даёт низкую уверенность', () => {
    const outcome = match({ name: 'ООО «Ромашка Интеграция»' });

    expect(outcome.kind).toBe('matched');
    if (outcome.kind !== 'matched') return;
    expect(outcome.match.confidence).toBe('low');
  });

  test('название и email вместе поднимают уверенность до высокой', () => {
    const outcome = match({ name: 'Ромашка Интеграция', email: 'INFO@ROMASHKA.EXAMPLE' });

    expect(outcome.kind).toBe('matched');
    if (outcome.kind !== 'matched') return;
    expect(outcome.match.confidence).toBe('high');
  });

  test('латинский alias находит ту же компанию', () => {
    const outcome = match({ name: 'Romashka Integratsiya' });
    expect(outcome.kind).toBe('matched');
  });

  test('один город совпадением не считается', () => {
    expect(match({ city: 'Москва' }).kind).toBe('none');
  });

  test('незнакомая компания не сопоставляется', () => {
    expect(match({ name: 'Неизвестная Компания', inn: '5000000000' }).kind).toBe('none');
  });

  test('несколько равных кандидатов не разрешаются автоматически', () => {
    const twin: CompanyReference = { ...romashka, id: 'CMP-3', inn: '7700000000' };
    const outcome = matchCompany(
      toQuery({ name: 'Ромашка Интеграция' }),
      buildCompanyIndex([romashka, twin]),
    );

    expect(outcome.kind).toBe('ambiguous');
    if (outcome.kind !== 'ambiguous') return;
    expect(outcome.candidates.map((c) => c.reference.id).sort()).toEqual(['CMP-1', 'CMP-3']);
  });

  test('неактивная запись справочника не предлагается как связь', () => {
    const outcome = matchCompany(
      toQuery({ inn: '7712345678' }),
      buildCompanyIndex([{ ...romashka, active: false }]),
    );

    expect(outcome.kind).toBe('inactive');
  });

  test('более полное совпадение выигрывает у менее полного', () => {
    const outcome = match({ inn: '7712345678', name: 'Ромашка Интеграция', city: 'Москва' });

    expect(outcome.kind).toBe('matched');
    if (outcome.kind !== 'matched') return;
    expect(outcome.match.factors).toHaveLength(3);
  });
});

test('сведение ё в ключе сравнения находит компанию', () => {
  // «Королёв» в заявке и «Королев» в справочнике должны совпасть.
  const korolev: CompanyReference = {
    ...romashka,
    id: 'CMP-YO',
    legalName: 'ООО «Королев Групп»',
    shortName: 'Королев Групп',
    inn: '7700000099',
    email: 'info@korolev.example',
    phone: '+74950000099',
    aliases: [],
  };

  const outcome = matchCompany(
    toQuery({ name: 'ООО «Королёв Групп»' }),
    buildCompanyIndex([korolev]),
  );

  expect(outcome.kind).toBe('matched');
});
