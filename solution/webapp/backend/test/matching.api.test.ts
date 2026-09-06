import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

interface ActionDto {
  id: string;
  kind: 'normalize' | 'match';
  field: string;
  after: string | null;
  confidence?: 'high' | 'medium' | 'low';
  evidence?: string[];
}

interface ChangeSetDto {
  sourceFingerprint: string;
  actions: ActionDto[];
  issues: { recordId: string; code: string; severity: string }[];
  summary: { normalizations: number; matches: number };
}

interface HealthDto {
  referenceCompanies: number;
}

const datasetPath = fileURLToPath(new URL('./fixtures/companies.csv', import.meta.url));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(
    loadConfig({ APP_ENV: 'test', APP_LOG_LEVEL: 'fatal', APP_DATASET_PATH: datasetPath }),
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function create(records: { id: string; values: Record<string, string | null> }[]) {
  return app.inject({ method: 'POST', url: '/api/v1/change-sets', payload: { records } });
}

test('health сообщает, сколько записей справочника загружено', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
  expect(response.json<HealthDto>().referenceCompanies).toBe(3);
});

test('совпадение по ИНН предлагается как связь с объяснением', async () => {
  const body = (
    await create([{ id: 'R1', values: { company_inn: 'ИНН 7712345678' } }])
  ).json<ChangeSetDto>();

  const match = body.actions.find((action) => action.kind === 'match');

  expect(match).toBeDefined();
  expect(match?.field).toBe('company_ref_id');
  expect(match?.after).toBe('CMP-1');
  expect(match?.confidence).toBe('high');
  expect(match?.evidence).toEqual(['ИНН']);
  expect(body.summary.matches).toBe(1);
});

test('латинский alias находит компанию по названию', async () => {
  const body = (
    await create([{ id: 'R1', values: { company_name: 'Romashka Integratsiya' } }])
  ).json<ChangeSetDto>();

  const match = body.actions.find((action) => action.kind === 'match');
  expect(match?.after).toBe('CMP-1');
  expect(match?.confidence).toBe('low');
});

test('неактивная запись справочника не предлагается, а помечается предупреждением', async () => {
  const body = (
    await create([{ id: 'R1', values: { company_inn: '7700000001' } }])
  ).json<ChangeSetDto>();

  expect(body.actions.filter((action) => action.kind === 'match')).toEqual([]);
  expect(body.issues).toContainEqual(
    expect.objectContaining({ recordId: 'R1', code: 'INACTIVE_COMPANY_MATCH', severity: 'warning' }),
  );
});

test('уже проставленная связь не предлагается повторно', async () => {
  const body = (
    await create([
      { id: 'R1', values: { company_inn: '7712345678', company_ref_id: 'CMP-1' } },
    ])
  ).json<ChangeSetDto>();

  expect(body.summary.matches).toBe(0);
});

test('незнакомая компания не сопоставляется', async () => {
  const body = (
    await create([{ id: 'R1', values: { company_name: 'Неизвестная Контора' } }])
  ).json<ChangeSetDto>();

  expect(body.summary.matches).toBe(0);
  expect(body.issues).toEqual([]);
});

test('связь применяется только после подтверждения', async () => {
  const records: { id: string; values: Record<string, string | null> }[] = [
    { id: 'R1', values: { company_inn: '7712345678' } },
  ];
  const changeSet = (await create(records)).json<ChangeSetDto>();
  const match = changeSet.actions.find((action) => action.kind === 'match');

  const skipped = await app.inject({
    method: 'POST',
    url: '/api/v1/change-sets/apply',
    payload: { records, sourceFingerprint: changeSet.sourceFingerprint, actionIds: [] },
  });
  expect(skipped.json<{ records: typeof records }>().records[0]?.values.company_ref_id).toBeUndefined();

  const applied = await app.inject({
    method: 'POST',
    url: '/api/v1/change-sets/apply',
    payload: {
      records,
      sourceFingerprint: changeSet.sourceFingerprint,
      actionIds: [match!.id],
    },
  });
  expect(applied.json<{ records: typeof records }>().records[0]?.values.company_ref_id).toBe('CMP-1');
});

test('без набора данных сервис работает, сопоставление просто не предлагается', async () => {
  const bare = await buildApp(
    loadConfig({ APP_ENV: 'test', APP_LOG_LEVEL: 'fatal', APP_DATASET_PATH: '/nope/missing.csv' }),
  );
  await bare.ready();

  const body = (
    await bare.inject({
      method: 'POST',
      url: '/api/v1/change-sets',
      payload: { records: [{ id: 'R1', values: { company_inn: 'ИНН 7712345678' } }] },
    })
  ).json<ChangeSetDto>();

  expect(body.summary.matches).toBe(0);
  expect(body.summary.normalizations).toBe(1);
  await bare.close();
});
