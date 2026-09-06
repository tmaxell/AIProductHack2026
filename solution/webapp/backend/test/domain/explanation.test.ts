import { describe, expect, test } from 'vitest';
import {
  buildExplanationPreview,
  EXPLANATION_SAMPLE_LIMIT,
  isExplanationOutput,
  maskDisclosedValue,
} from '../../src/domain/explanation.js';
import type { VersionedChangeSet } from '../../src/domain/version.js';

const version: VersionedChangeSet = {
  id: 'cs-1',
  sequence: 4,
  status: 'draft',
  sourceFingerprint: 'fingerprint',
  sourceRecords: [],
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
  actions: [
    {
      id: 'real-row-id::email',
      kind: 'normalize',
      recordId: 'real-row-id',
      field: 'requester_email',
      ruleCode: 'EMAIL',
      ruleName: 'Email',
      reason: 'Нормализация',
      group: 'Контакты',
      before: 'Ivan.Petrov @ Example.org',
      after: 'ivan.petrov@example.org',
      decision: 'accepted',
      result: 'pending',
    },
    {
      id: 'real-row-id::phone',
      kind: 'normalize',
      recordId: 'real-row-id',
      field: 'requester_phone',
      ruleCode: 'PHONE',
      ruleName: 'Телефон',
      reason: 'Нормализация',
      group: 'Контакты',
      before: '+7 999 123-45-67',
      after: '+79991234567',
      decision: 'pending',
      result: 'pending',
    },
  ],
  issues: [],
  summary: { records: 1, actions: 2, normalizations: 2, matches: 0, duplicates: 0, attention: 0, blocking: 0 },
};

describe('минимизация данных для AI-объяснения', () => {
  test('маскирует персональные значения', () => {
    expect(maskDisclosedValue('email', 'user@example.org')).toBe('***@example.org');
    expect(maskDisclosedValue('phone', '+7 999 123-45-67')).toBe('***67');
    expect(maskDisclosedValue('requester_name', 'Иван Петров')).toBe('И*** П***');
  });

  test('раскрывает только выбранные действия и заменяет record id', () => {
    const preview = buildExplanationPreview(version, ['real-row-id::email'], 'Покажи риски');
    expect(preview.fields).toEqual(['requester_email']);
    expect(preview.payload.actions).toHaveLength(1);
    expect(preview.payload.actions[0]).toMatchObject({
      recordRef: 'record-1',
      before: '***@ Example.org',
      after: '***@example.org',
    });
    expect(JSON.stringify(preview.payload)).not.toContain('real-row-id');
    expect(preview.payload).toMatchObject({
      instruction: 'Покажи риски',
      coverage: { totalActions: 1, sampledActions: 1 },
    });
  });

  test('примеры распределяются по правилам, а не берутся подряд', () => {
    const rules = ['budget', 'company_email', 'company_phone', 'currency', 'priority', 'status'];
    const many = {
      ...version,
      actions: rules.flatMap((ruleCode) =>
        Array.from({ length: 100 }, (_, index) => ({
          ...version.actions[0]!,
          id: `${ruleCode}-${String(index).padStart(4, '0')}`,
          recordId: `row-${ruleCode}-${index}`,
          ruleCode,
          field: ruleCode,
        })),
      ),
    };

    const preview = buildExplanationPreview(many, many.actions.map((action) => action.id));
    const byRule = new Map<string, number>();
    for (const action of preview.payload.actions) {
      byRule.set(action.ruleCode, (byRule.get(action.ruleCode) ?? 0) + 1);
    }

    // Лимит выбирается полностью, каждое правило представлено, перекоса нет.
    expect(preview.payload.actions).toHaveLength(EXPLANATION_SAMPLE_LIMIT);
    expect(byRule.size).toBe(rules.length);
    expect(Math.max(...byRule.values()) - Math.min(...byRule.values())).toBeLessThanOrEqual(1);

    // Агрегат описывает весь набор, а не выборку.
    expect(preview.payload.coverage).toMatchObject({ totalActions: 600, sampledActions: 40 });
    // Disclosure перечисляет поля всех правил, попавших в выборку.
    expect(preview.fields).toEqual([...rules].sort());
  });

  test('выборка детерминирована', () => {
    const many = {
      ...version,
      actions: Array.from({ length: 200 }, (_, index) => ({
        ...version.actions[0]!,
        id: `action-${String(index).padStart(4, '0')}`,
        recordId: `row-${index}`,
        ruleCode: index % 2 === 0 ? 'budget' : 'status',
      })),
    };
    const ids = () =>
      buildExplanationPreview(many, many.actions.map((action) => action.id))
        .payload.actions.map((action) => action.actionRef);

    expect(ids()).toEqual(ids());
  });

  // Регрессия: значение duplicate_of — это row_id другой заявки, и оно уходило
  // в модель как есть, хотя ADR обещает заменять идентификаторы псевдонимами.
  test('ссылки на другие записи тоже становятся псевдонимами', () => {
    const withRefs = {
      ...version,
      actions: [
        {
          ...version.actions[0]!,
          id: 'dup',
          recordId: 'real-row-id',
          field: 'duplicate_of',
          kind: 'duplicate' as const,
          before: null,
          after: 'other-real-row-id',
        },
        {
          ...version.actions[0]!,
          id: 'match',
          recordId: 'real-row-id',
          field: 'company_ref_id',
          kind: 'match' as const,
          before: null,
          after: 'CMP-REAL-42',
        },
      ],
    };

    const preview = buildExplanationPreview(withRefs, ['dup', 'match']);
    const serialized = JSON.stringify(preview.payload);

    expect(serialized).not.toContain('other-real-row-id');
    expect(serialized).not.toContain('CMP-REAL-42');
    expect(serialized).not.toContain('real-row-id');
    expect(preview.payload.actions[0]?.after).toMatch(/^record-\d+$/);
    expect(preview.payload.actions[1]?.after).toMatch(/^company-\d+$/);
  });

  test('одна и та же запись получает один псевдоним', () => {
    const shared = {
      ...version,
      actions: [
        { ...version.actions[0]!, id: 'a', recordId: 'row-1', field: 'duplicate_of', after: 'row-2' },
        { ...version.actions[0]!, id: 'b', recordId: 'row-2', field: 'requester_email', after: 'x@y.z' },
      ],
    };

    const preview = buildExplanationPreview(shared, ['a', 'b']);
    // row-2 упомянута и как ссылка, и как сама запись — псевдоним должен совпасть.
    expect(preview.payload.actions[0]?.after).toBe(preview.payload.actions[1]?.recordRef);
  });

  test('проверяет закрытый структурированный ответ', () => {
    const valid = { summary: 'ok', evidence: [], risks: [], openQuestions: [], recommendedActions: [] };
    expect(isExplanationOutput(valid)).toBe(true);
    expect(isExplanationOutput({ ...valid, command: 'publish' })).toBe(false);
  });
});
