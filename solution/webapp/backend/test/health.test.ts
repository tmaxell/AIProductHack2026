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

test('health отвечает 200 и описывает сервис', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    status: 'ok',
    env: 'test',
    aiExplanationAvailable: false,
  });
});

test('неизвестный маршрут отвечает единым форматом ошибки', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/v1/nope' });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({ statusCode: 404, error: 'Not Found' });
});
