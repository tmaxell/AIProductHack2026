import { describe, expect, test } from 'vitest';
import { applyActions, UnknownActionsError } from '../../src/domain/apply.js';
import { actionId, buildChangeSet, type SourceRecord } from '../../src/domain/change-set.js';

const records: SourceRecord[] = [
  {
    id: 'ROW-1',
    values: {
      company_email: 'Info @ A.example',
      company_city: 'Г. Сочи',
      planned_start: '31.02.2027',
      budget: '2,08 млн',
    },
  },
  {
    id: 'ROW-2',
    values: { company_email: 'ok@b.example', company_city: 'Москва' },
  },
];

describe('buildChangeSet', () => {
  test('предлагает по одному действию на поле и не трогает корректные значения', () => {
    const changeSet = buildChangeSet(records);
    const ids = changeSet.actions.map((action) => action.id);

    expect(ids).toContain(actionId('ROW-1', 'company_email'));
    expect(ids).toContain(actionId('ROW-1', 'company_city'));
    expect(ids).toContain(actionId('ROW-1', 'budget'));
    // ROW-2 уже нормализована, предложений по ней быть не должно.
    expect(ids.filter((id) => id.startsWith('ROW-2'))).toEqual([]);
  });

  test('несуществующая дата попадает в блокирующие, а не в предложения', () => {
    const changeSet = buildChangeSet(records);

    expect(changeSet.actions.some((action) => action.field === 'planned_start')).toBe(false);
    expect(changeSet.issues).toContainEqual(
      expect.objectContaining({ recordId: 'ROW-1', code: 'IMPOSSIBLE_DATE', severity: 'error' }),
    );
    expect(changeSet.summary.blocking).toBe(1);
  });

  test('не создаёт применяемые действия для значений с ошибкой', () => {
    const invalid: SourceRecord[] = [
      {
        id: 'ROW-BAD',
        values: {
          company_email: ' BAD @ invalid ',
          requester_phone: 'ИНН 1234567890',
        },
      },
    ];

    const changeSet = buildChangeSet(invalid);

    expect(changeSet.actions).toEqual([]);
    expect(changeSet.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'company_email', code: 'INVALID_EMAIL' }),
        expect.objectContaining({ field: 'requester_phone', code: 'BAD_PHONE' }),
      ]),
    );
    expect(changeSet.summary.blocking).toBe(2);
  });

  test('id набора и действий детерминированы', () => {
    expect(buildChangeSet(records).id).toBe(buildChangeSet(records).id);
    expect(buildChangeSet(records).sourceFingerprint).toBe(
      buildChangeSet(records).sourceFingerprint,
    );
  });

  test('отпечаток меняется вместе с исходными данными', () => {
    const changed: SourceRecord[] = [
      { id: 'ROW-1', values: { ...records[0]!.values, budget: '3 млн' } },
      records[1]!,
    ];

    expect(buildChangeSet(changed).sourceFingerprint).not.toBe(
      buildChangeSet(records).sourceFingerprint,
    );
  });

  test('порядок записей не влияет на отпечаток', () => {
    expect(buildChangeSet([...records].reverse()).sourceFingerprint).toBe(
      buildChangeSet(records).sourceFingerprint,
    );
  });
});

describe('applyActions', () => {
  test('применяет только выбранные действия', () => {
    const changeSet = buildChangeSet(records);
    const selected = [actionId('ROW-1', 'company_email')];

    const outcome = applyActions(records, changeSet, selected);
    const row = outcome.records.find((record) => record.id === 'ROW-1');

    expect(outcome.applied).toHaveLength(1);
    expect(row?.values.company_email).toBe('info@a.example');
    // Не выбранное действие не применяется.
    expect(row?.values.company_city).toBe('Г. Сочи');
  });

  test('повторное применение того же действия ничего не меняет', () => {
    const first = applyActions(records, buildChangeSet(records), [
      actionId('ROW-1', 'company_email'),
    ]);
    const second = applyActions(first.records, buildChangeSet(first.records), []);

    expect(second.applied).toHaveLength(0);
    expect(second.records).toEqual(first.records);
  });

  test('уже применённое действие попадает в skipped, а не применяется дважды', () => {
    const changeSet = buildChangeSet(records);
    const applied = applyActions(records, changeSet, [actionId('ROW-1', 'company_email')]);

    const again = applyActions(applied.records, changeSet, [actionId('ROW-1', 'company_email')]);

    expect(again.applied).toHaveLength(0);
    expect(again.skipped).toEqual([
      { actionId: actionId('ROW-1', 'company_email'), reason: 'already-applied' },
    ]);
  });

  test('действие вне набора изменений отклоняется', () => {
    expect(() => applyActions(records, buildChangeSet(records), ['ROW-1::unknown'])).toThrow(
      UnknownActionsError,
    );
  });

  test('исходные записи не мутируются', () => {
    const changeSet = buildChangeSet(records);
    applyActions(records, changeSet, changeSet.actions.map((action) => action.id));

    expect(records[0]!.values.company_email).toBe('Info @ A.example');
  });
});
