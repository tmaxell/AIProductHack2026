import { afterAll, beforeAll, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(loadConfig({ APP_ENV: 'test', APP_LOG_LEVEL: 'fatal' }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

test('валидное тело проходит схему и упирается в 501, а не в 400', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/validation/runs',
    payload: { records: [{ row_id: 'ROW-1', company_email: 'A@B.EXAMPLE' }] },
  });

  expect(response.statusCode).toBe(501);
  expect(response.json()).toMatchObject({ statusCode: 501, error: 'Not Implemented' });
});

test('пустой список записей отклоняется схемой', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/validation/runs',
    payload: { records: [] },
  });

  expect(response.statusCode).toBe(400);
});
