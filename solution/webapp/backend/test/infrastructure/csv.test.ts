import { expect, test } from 'vitest';
import { parseCsv, parseCsvRecords } from '../../src/infrastructure/csv.js';

test('разбирает простые строки', () => {
  expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
});

test('сохраняет запятые внутри кавычек', () => {
  expect(parseCsv('a,b\n"Иванов, И.",2')).toEqual([['a', 'b'], ['Иванов, И.', '2']]);
});

test('понимает экранированные кавычки', () => {
  expect(parseCsv('a\n"АО ""Ромашка"""')).toEqual([['a'], ['АО "Ромашка"']]);
});

test('понимает перевод строки внутри значения', () => {
  expect(parseCsv('a,b\n"первая\nвторая",2')).toEqual([['a', 'b'], ['первая\nвторая', '2']]);
});

test('понимает CRLF и последнюю строку без перевода', () => {
  expect(parseCsv('a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
});

test('снимает BOM с первого заголовка', () => {
  expect(parseCsvRecords('﻿id,name\n1,Ромашка')).toEqual([{ id: '1', name: 'Ромашка' }]);
});

test('недостающие колонки становятся пустой строкой', () => {
  expect(parseCsvRecords('a,b,c\n1,2')).toEqual([{ a: '1', b: '2', c: '' }]);
});

test('пустой ввод не ломается', () => {
  expect(parseCsvRecords('')).toEqual([]);
});
