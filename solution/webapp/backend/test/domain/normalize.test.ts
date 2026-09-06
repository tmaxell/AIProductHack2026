import { describe, expect, test } from 'vitest';
import {
  normalizeBudget,
  normalizeCity,
  normalizeDate,
  normalizeEmail,
  normalizeFio,
  normalizeInn,
  normalizePhone,
} from '../../src/domain/normalize/index.js';

const codes = (result: { issues: readonly { code: string }[] }): string[] =>
  result.issues.map((issue) => issue.code);

describe('email', () => {
  test('приводит к нижнему регистру и убирает пробелы и mailto', () => {
    expect(normalizeEmail(' MAILTO:Info @ A.example ')).toMatchObject({
      value: 'info@a.example',
      changed: true,
    });
  });

  test('помечает нераспознанный адрес ошибкой', () => {
    expect(codes(normalizeEmail('не-почта'))).toContain('INVALID_EMAIL');
  });

  test('пустое значение не даёт предложения', () => {
    expect(normalizeEmail('   ')).toMatchObject({ value: null, changed: false });
  });
});

describe('phone', () => {
  test('приводит восьмёрку к +7', () => {
    expect(normalizePhone('8 (925) 952-11-02')).toMatchObject({
      value: '+79259521102',
      changed: true,
    });
  });

  test('маскированный номер помечается предупреждением', () => {
    expect(codes(normalizePhone('+7925*****02'))).toContain('MASKED_PHONE');
  });
});

describe('inn', () => {
  test('снимает префикс ИНН', () => {
    expect(normalizeInn('ИНН 6012447316')).toMatchObject({
      value: '6012447316',
      changed: true,
    });
  });

  test('нецифровой ИНН помечается ошибкой', () => {
    expect(codes(normalizeInn('ИНН 60-12'))).toContain('BAD_INN');
  });
});

describe('city', () => {
  test('снимает префикс с пробелом', () => {
    expect(normalizeCity(' Г Екатеринбург ')).toMatchObject({ value: 'Екатеринбург' });
  });

  // Регрессия: прежняя реализация давала «. Сочи».
  test('снимает префикс с точкой целиком', () => {
    expect(normalizeCity('Г. Сочи')).toMatchObject({ value: 'Сочи' });
    expect(normalizeCity('г. Краснодар')).toMatchObject({ value: 'Краснодар' });
  });

  // Регрессия: прежняя реализация давала «агарин».
  test('не режет город, который просто начинается на «Г»', () => {
    expect(normalizeCity('Гагарин')).toMatchObject({ value: 'Гагарин', changed: false });
  });

  test('разворачивает известные сокращения и латиницу', () => {
    expect(normalizeCity('Нск')).toMatchObject({ value: 'Новосибирск' });
    expect(normalizeCity('Vladivostok')).toMatchObject({ value: 'Владивосток' });
  });

  test('неизвестная латиница остаётся, но помечается замечанием', () => {
    const result = normalizeCity('Metropolis');
    expect(result.value).toBe('Metropolis');
    expect(codes(result)).toContain('LATIN_CITY');
  });
});

describe('fio', () => {
  test('приводит к единому регистру и схлопывает пробелы', () => {
    expect(normalizeFio('  НИКОЛАЕВ  максим ')).toMatchObject({
      value: 'Николаев Максим',
      changed: true,
    });
  });

  test('сохраняет инициалы', () => {
    expect(normalizeFio('Николаев М.')).toMatchObject({ value: 'Николаев М.' });
  });
});

describe('budget', () => {
  test('убирает валюту и разряды', () => {
    expect(normalizeBudget('4 603 000 ₽')).toMatchObject({ value: '4603000', changed: true });
    expect(normalizeBudget('RUB 991000')).toMatchObject({ value: '991000' });
  });

  test('разворачивает млн и тыс', () => {
    expect(normalizeBudget('2,08 млн')).toMatchObject({ value: '2080000' });
    expect(normalizeBudget('4081 тыс.')).toMatchObject({ value: '4081000' });
  });

  test('подозрительные суммы помечаются предупреждением', () => {
    expect(codes(normalizeBudget('500'))).toContain('TINY_BUDGET');
    expect(codes(normalizeBudget('900000000'))).toContain('HUGE_BUDGET');
  });

  test('нераспознанный формат не предлагает изменения', () => {
    const result = normalizeBudget('по договорённости');
    expect(result.changed).toBe(false);
    expect(codes(result)).toContain('BAD_BUDGET');
  });
});

describe('date', () => {
  test('разбирает поддерживаемые форматы', () => {
    expect(normalizeDate('07.12.2026')).toMatchObject({ value: '2026-12-07' });
    expect(normalizeDate('06.02.27')).toMatchObject({ value: '2027-02-06' });
    expect(normalizeDate('11 декабря 2026')).toMatchObject({ value: '2026-12-11' });
    expect(normalizeDate('04/06/2027')).toMatchObject({ value: '2027-06-04' });
  });

  // Регрессия: прежняя реализация молча превращала это в 2027-03-03.
  test('несуществующая календарная дата — ошибка, а не соседняя дата', () => {
    const result = normalizeDate('31.02.2027');
    expect(result.changed).toBe(false);
    expect(result.value).toBe('31.02.2027');
    expect(codes(result)).toContain('IMPOSSIBLE_DATE');
  });

  test('високосный год остаётся валидным', () => {
    expect(normalizeDate('29.02.2028')).toMatchObject({ value: '2028-02-29' });
    expect(codes(normalizeDate('29.02.2027'))).toContain('IMPOSSIBLE_DATE');
  });

  // Регрессия: прежняя реализация считала такое значение уже нормализованным.
  test('дата со временем обрезается до даты', () => {
    expect(normalizeDate('2027-01-01T00:00:00Z')).toMatchObject({
      value: '2027-01-01',
      changed: true,
    });
  });

  test('уже нормализованная дата не даёт предложения', () => {
    expect(normalizeDate('2026-09-29')).toMatchObject({ value: '2026-09-29', changed: false });
  });

  test('нераспознанный формат помечается ошибкой', () => {
    expect(codes(normalizeDate('когда-нибудь'))).toContain('BAD_DATE');
  });
});
