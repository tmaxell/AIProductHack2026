import { afterAll, beforeAll, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

interface RecordDto {
  id: string;
  values: Record<string, string | null>;
}

interface ActionDto {
  id: string;
  recordId: string;
  field: string;
  before: string | null;
  after: string | null;
}

interface ChangeSetDto {
  id: string;
  sourceFingerprint: string;
  actions: ActionDto[];
  summary: { records: number; actions: number; attention: number; blocking: number };
}

interface ApplyDto {
  records: RecordDto[];
  applied: ActionDto[];
  skipped: { actionId: string; reason: string }[];
}

interface ErrorDto {
  statusCode: number;
  error: string;
  message: string;
}

let app: FastifyInstance;

const records: RecordDto[] = [
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

function create(payload: { records: RecordDto[] } = { records }) {
  return app.inject({ method: 'POST', url: '/api/v1/change-sets', payload });
}

function apply(payload: {
  records: RecordDto[];
  sourceFingerprint: string;
  actionIds: string[];
}) {
  return app.inject({ method: 'POST', url: '/api/v1/change-sets/apply', payload });
}

test('создание набора изменений возвращает действия и отпечаток', async () => {
  const response = await create();
  const body = response.json<ChangeSetDto>();

  expect(response.statusCode).toBe(200);
  expect(body.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(body.summary.records).toBe(2);
  expect(body.actions.map((action) => action.id)).toContain('ROW-1::company_email');
});

test('пустой список записей отклоняется схемой', async () => {
  expect((await create({ records: [] })).statusCode).toBe(400);
});

test('применяется только подтверждённое действие', async () => {
  const changeSet = (await create()).json<ChangeSetDto>();

  const response = await apply({
    records,
    sourceFingerprint: changeSet.sourceFingerprint,
    actionIds: ['ROW-1::company_email'],
  });
  const body = response.json<ApplyDto>();
  const row = body.records.find((record) => record.id === 'ROW-1');

  expect(response.statusCode).toBe(200);
  expect(body.applied).toHaveLength(1);
  expect(row?.values.company_email).toBe('info@a.example');
  // Не подтверждённое действие не применяется.
  expect(row?.values.company_city).toBe('Г. Сочи');
});

test('пустой список подтверждений ничего не меняет', async () => {
  const changeSet = (await create()).json<ChangeSetDto>();

  const response = await apply({
    records,
    sourceFingerprint: changeSet.sourceFingerprint,
    actionIds: [],
  });

  expect(response.statusCode).toBe(200);
  expect(response.json<ApplyDto>().applied).toEqual([]);
  expect(response.json<ApplyDto>().records).toEqual(records);
});

test('изменившиеся исходные данные блокируют применение конфликтом', async () => {
  const changeSet = (await create()).json<ChangeSetDto>();

  const response = await apply({
    records: [{ id: 'ROW-1', values: { company_email: 'other @ A.example' } }],
    sourceFingerprint: changeSet.sourceFingerprint,
    actionIds: ['ROW-1::company_email'],
  });

  expect(response.statusCode).toBe(409);
  expect(response.json<ErrorDto>().error).toBe('Conflict');
});

test('действие вне набора изменений отклоняется с 422', async () => {
  const changeSet = (await create()).json<ChangeSetDto>();

  const response = await apply({
    records,
    sourceFingerprint: changeSet.sourceFingerprint,
    actionIds: ['ROW-1::company_email', 'ROW-9::budget'],
  });

  expect(response.statusCode).toBe(422);
  expect(response.json<ErrorDto>().message).toContain('ROW-9::budget');
});

test('повторный полный цикл не применяет изменения второй раз', async () => {
  const first = (await create()).json<ChangeSetDto>();
  const applied = (
    await apply({
      records,
      sourceFingerprint: first.sourceFingerprint,
      actionIds: first.actions.map((action) => action.id),
    })
  ).json<ApplyDto>();

  const second = (await create({ records: applied.records })).json<ChangeSetDto>();

  expect(second.actions).toEqual([]);
  expect(second.summary.actions).toBe(0);
});
