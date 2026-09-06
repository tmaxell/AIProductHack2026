import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const fixture = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../data/raw/dev-sample.csv',
);

describe('полный snapshot выгрузки', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(loadConfig({
      APP_ENV: 'test',
      APP_LOG_LEVEL: 'fatal',
      APP_DATASET_PATH: fixture,
      APP_STORAGE_PATH: ':memory:',
    }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  test('читает все заявки стабильными страницами', async () => {
    const metadata = await app.inject({ method: 'GET', url: '/api/v1/dataset-snapshots/current' });
    expect(metadata.statusCode).toBe(200);
    expect(metadata.json()).toMatchObject({ id: 'DEV', schemaVersion: '1.0', recordCount: 6800 });

    const first = await app.inject({
      method: 'GET',
      url: '/api/v1/dataset-snapshots/current/records?limit=2',
    });
    const firstPage = first.json<{ items: { id: string }[]; nextCursor: string; total: number }>();
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBe(6800);

    const second = await app.inject({
      method: 'GET',
      url: `/api/v1/dataset-snapshots/current/records?limit=2&cursor=${firstPage.nextCursor}`,
    });
    expect(second.json<{ items: { id: string }[] }>().items[0]?.id).not.toBe(firstPage.items[0]?.id);
  });

  test('строит один Change Set по всей выгрузке и отдаёт действия страницами', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/dataset-snapshots/current/change-sets',
      payload: {},
    });
    expect(created.statusCode).toBe(200);
    const draft = created.json<{ id: string; summary: { records: number; actions: number } }>();
    expect(draft.summary.records).toBe(6800);
    expect(draft.summary.actions).toBeGreaterThan(0);

    const page = await app.inject({
      method: 'GET',
      url: `/api/v1/change-sets/${draft.id}/actions?limit=10`,
    });
    expect(page.statusCode).toBe(200);
    expect(page.json<{ items: unknown[]; total: number }>().items).toHaveLength(10);
    expect(page.json<{ total: number }>().total).toBe(draft.summary.actions);
  });

  test('limit ограничивает разбор первыми записями выгрузки', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/dataset-snapshots/current/change-sets',
      payload: { limit: 100 },
    });

    expect(created.statusCode).toBe(200);
    const draft = created.json<{ summary: { records: number; actions: number } }>();
    expect(draft.summary.records).toBe(100);
    // Ради этого ограничение и вводится: решения и идентификаторы всей выгрузки
    // не помещаются в тело запроса.
    expect(draft.summary.actions).toBeLessThan(5000);
  });

  test('публикация части выгрузки не конфликтует и не трогает остальные записи', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/api/v1/dataset-snapshots/current/records?limit=1',
    });
    const untouchedBefore = before.json<{ total: number }>().total;

    const draft = (await app.inject({
      method: 'POST',
      url: '/api/v1/dataset-snapshots/current/change-sets',
      payload: { limit: 5 },
    })).json<{ id: string; actions: { id: string }[] }>();

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/change-sets/${draft.id}/decisions`,
      payload: { actions: draft.actions.map((action) => ({ id: action.id, decision: 'accepted' })) },
    });

    const published = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/publish-current`,
    });

    expect(published.statusCode).toBe(200);
    const outcome = published.json<{ records: unknown[]; changeSet: { status: string } }>();
    expect(outcome.changeSet.status).toBe('published');
    expect(outcome.records).toHaveLength(5);

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/dataset-snapshots/current/records?limit=1',
    });
    expect(after.json<{ total: number }>().total).toBe(untouchedBefore);
  });
});
