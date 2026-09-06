import { afterAll, beforeAll, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let app: FastifyInstance;

const records = [
  { id: 'ROW-1', values: { company_email: 'Info @ A.example', company_city: 'Г. Сочи' } },
  { id: 'ROW-2', values: { company_email: 'ok@b.example' } },
];

beforeAll(async () => {
  app = await buildApp(loadConfig({ APP_ENV: 'test', APP_LOG_LEVEL: 'fatal' }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function createChangeSet(payload = { records }) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/change-sets', payload });
  return response;
}

test('создание набора изменений возвращает действия и отпечаток', async () => {
  const response = await createChangeSet();
  const body = response.json();

  expect(response.statusCode).toBe(200);
  expect(body.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(body.summary.records).toBe(2);
  expect(body.actions.map((a: { id: string }) => a.id)).toContain('ROW-1::company_email');
});

test('пустой список записей отклоняется схемой', async () => {
  const response = await createChangeSet({ records: [] });
  expect(response.statusCode).toBe(400);
});

test('применяется только подтверждённое действие', async () => {
  const changeSet = (await createChangeSet()).json();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/change-sets/apply',
    payload: {
      records,
      sourceFingerprint: changeSet.sourceFingerprint,
      actionIds: ['ROW-1::company_email'],
    },
  });
  const body = response.json();
  const row = body.records.find((r: { id: string }) => r.id === 'ROW-1');

  expect(response.statusCode).toBe(200);
  expect(body.applied).toHaveLength(1);
  expect(row.values.company_email).toBe('info@a.example');
  expect(row.values.company_city).toBe('Г. Сочи');
});

test('пустой список подтверждений ничего не меняет', async () => {
  const changeSet = (await createChangeSet()).json();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/change-sets/apply',
    payload: { records, sourceFingerprint: changeSet.sourceFingerprint, actionIds: [] },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().applied).toEqual([]);
  expect(response.json().records).toEqual(records);
});

test('изменившиеся исходные данные блокируют применение конфликтом', async () => {
  const changeSet = (await createChangeSet()).json();
  const stale = [{ id: 'ROW-1', values: { company_email: 'other @ A.example' } }];

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/change-sets/apply',
    payload: {
      records: stale,
      sourceFingerprint: changeSet.sourceFingerprint,
      actionIds: ['ROW-1::company_email'],
    },
  });

  expect(response.statusCode).toBe(409);
  expect(response.json().error).toBe('Conflict');
});

test('действие вне набора изменений отклоняется с 422', async () => {
  const changeSet = (await createChangeSet()).json();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/change-sets/apply',
    payload: {
      records,
      sourceFingerprint: changeSet.sourceFingerprint,
      actionIds: ['ROW-1::company_email', 'ROW-9::budget'],
    },
  });

  expect(response.statusCode).toBe(422);
  expect(response.json().message).toContain('ROW-9::budget');
});

test('повторный полный цикл не применяет изменения второй раз', async () => {
  const first = (await createChangeSet()).json();
  const applied = (
    await app.inject({
      method: 'POST',
      url: '/api/v1/change-sets/apply',
      payload: {
        records,
        sourceFingerprint: first.sourceFingerprint,
        actionIds: first.actions.map((a: { id: string }) => a.id),
      },
    })
  ).json();

  const second = (await createChangeSet({ records: applied.records })).json();

  expect(second.actions).toEqual([]);
  expect(second.summary.actions).toBe(0);
});
