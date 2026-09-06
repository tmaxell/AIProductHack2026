import { describe, expect, test } from 'vitest';
import { buildExplanationPreview, isExplanationOutput, maskDisclosedValue } from '../../src/domain/explanation.js';
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
    const preview = buildExplanationPreview(version, ['real-row-id::email']);
    expect(preview.fields).toEqual(['requester_email']);
    expect(preview.payload.actions).toHaveLength(1);
    expect(preview.payload.actions[0]).toMatchObject({
      recordRef: 'record-1',
      before: '***@ Example.org',
      after: '***@example.org',
    });
    expect(JSON.stringify(preview.payload)).not.toContain('real-row-id');
  });

  test('проверяет закрытый структурированный ответ', () => {
    const valid = { summary: 'ok', evidence: [], risks: [], openQuestions: [], recommendedActions: [] };
    expect(isExplanationOutput(valid)).toBe(true);
    expect(isExplanationOutput({ ...valid, command: 'publish' })).toBe(false);
  });
});
