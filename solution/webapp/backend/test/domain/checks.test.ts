import { expect, test } from 'vitest';
import { buildChangeSet, type SourceRecord } from '../../src/domain/change-set.js';
import { runRecordChecks } from '../../src/domain/checks.js';

test('дата окончания раньше начала — блокирующая ошибка', () => {
  expect(runRecordChecks({ planned_start: '2027-03-01', planned_end: '2027-02-01' })).toEqual([
    expect.objectContaining({ code: 'REVERSED_DATES', severity: 'error', field: 'planned_end' }),
  ]);
});

test('корректный порядок дат замечаний не даёт', () => {
  expect(runRecordChecks({ planned_start: '2027-02-01', planned_end: '2027-03-01' })).toEqual([]);
  expect(runRecordChecks({ planned_start: '2027-02-01', planned_end: '2027-02-01' })).toEqual([]);
});

test('без одной из дат проверка не срабатывает', () => {
  expect(runRecordChecks({ planned_start: '2027-02-01' })).toEqual([]);
  expect(runRecordChecks({ planned_start: '2027-02-01', planned_end: null })).toEqual([]);
});

// Проверка идёт по нормализованным значениям: иначе «06.02.27» и «2027-02-19»
// сравнивались бы как строки в разных форматах.
test('перевёрнутые даты находятся в разных исходных форматах', () => {
  const records: SourceRecord[] = [
    { id: 'R1', values: { planned_start: '19.02.2027', planned_end: '06.02.27' } },
  ];

  expect(buildChangeSet(records).issues).toContainEqual(
    expect.objectContaining({ recordId: 'R1', code: 'REVERSED_DATES' }),
  );
});

test('несуществующая дата не превращается в ложную ошибку порядка', () => {
  const records: SourceRecord[] = [
    { id: 'R1', values: { planned_start: '31.02.2027', planned_end: '2027-01-01' } },
  ];
  const codes = buildChangeSet(records).issues.map((issue) => issue.code);

  expect(codes).toContain('IMPOSSIBLE_DATE');
  expect(codes).not.toContain('REVERSED_DATES');
});
