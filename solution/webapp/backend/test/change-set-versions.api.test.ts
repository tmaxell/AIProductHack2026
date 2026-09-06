import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

interface RecordDto {
  id: string;
  values: Record<string, string | null>;
}

interface ActionDto {
  id: string;
  field: string;
  before: string | null;
  after: string | null;
  editedAfter?: string | null;
  decision: 'pending' | 'accepted' | 'rejected';
  result: 'pending' | 'applied' | 'skipped' | 'conflict' | 'failed';
}

interface VersionDto {
  id: string;
  sequence: number;
  status: 'draft' | 'published' | 'superseded' | 'discarded';
  parentId?: string;
  rollbackOfId?: string;
  actions: ActionDto[];
}

interface PublishDto {
  changeSet: VersionDto;
  records: RecordDto[];
  idempotent: boolean;
}

const records: RecordDto[] = [
  {
    id: 'ROW-1',
    values: { company_email: 'Info @ A.example', company_city: 'Г. Сочи' },
  },
];

async function makeApp(storagePath = ':memory:'): Promise<FastifyInstance> {
  const instance = await buildApp(
    loadConfig({ APP_ENV: 'test', APP_LOG_LEVEL: 'fatal', APP_STORAGE_PATH: storagePath }),
  );
  await instance.ready();
  return instance;
}

async function create(app: FastifyInstance, source = records, parentId?: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/change-sets',
    payload: { records: source, ...(parentId === undefined ? {} : { parentId }) },
  });
  expect(response.statusCode).toBe(200);
  return response.json<VersionDto>();
}

async function decide(
  app: FastifyInstance,
  version: VersionDto,
  updates: { actionId: string; decision: 'accepted' | 'rejected'; editedAfter?: string }[],
) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/change-sets/${version.id}/decisions`,
    payload: { actions: updates },
  });
}

describe('персистентные версии Change Set', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  test('повторный анализ создаёт новую версию и список сохраняет обе', async () => {
    const first = await create(app);
    const second = await create(app, records, first.id);
    const listed = await app.inject({ method: 'GET', url: '/api/v1/change-sets' });

    expect(first.id).not.toBe(second.id);
    expect(second.sequence).toBe(first.sequence + 1);
    expect(second.parentId).toBe(first.id);
    expect(listed.json<{ items: VersionDto[] }>().items.map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  test('решения и редактирование сохраняются, публикация неизменяема и идемпотентна', async () => {
    const version = await create(app);
    const email = version.actions.find((action) => action.field === 'company_email')!;
    const city = version.actions.find((action) => action.field === 'company_city')!;
    const updated = await decide(app, version, [
      { actionId: email.id, decision: 'accepted', editedAfter: 'owner@a.example' },
      { actionId: city.id, decision: 'rejected' },
    ]);

    expect(updated.statusCode).toBe(200);
    expect(updated.json<VersionDto>().actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: email.id,
          decision: 'accepted',
          editedAfter: 'owner@a.example',
        }),
        expect.objectContaining({ id: city.id, decision: 'rejected' }),
      ]),
    );

    const published = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${version.id}/publish`,
      payload: { records },
    });
    const body = published.json<PublishDto>();
    expect(body.changeSet.status).toBe('published');
    expect(body.idempotent).toBe(false);
    expect(body.records[0]?.values).toMatchObject({
      company_email: 'owner@a.example',
      company_city: 'Г. Сочи',
    });
    expect(body.changeSet.actions.find((action) => action.id === email.id)?.result).toBe('applied');

    const repeated = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${version.id}/publish`,
      payload: { records },
    });
    expect(repeated.json<PublishDto>()).toMatchObject({ idempotent: true, records: body.records });

    expect((await decide(app, body.changeSet, [{ actionId: email.id, decision: 'rejected' }])).statusCode)
      .toBe(409);
  });

  test('изменившийся источник блокирует publish и сохраняет конфликт в истории', async () => {
    const version = await create(app);
    const email = version.actions.find((action) => action.field === 'company_email')!;
    await decide(app, version, [{ actionId: email.id, decision: 'accepted' }]);

    const conflict = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${version.id}/publish`,
      payload: { records: [{ id: 'ROW-1', values: { company_email: 'changed@example.org' } }] },
    });
    expect(conflict.statusCode).toBe(409);

    const stored = await app.inject({
      method: 'GET',
      url: `/api/v1/change-sets/${version.id}`,
    });
    expect(stored.json<VersionDto>().actions.find((action) => action.id === email.id)?.result).toBe(
      'conflict',
    );
    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/change-sets/${version.id}/history`,
    });
    expect(history.json<{ items: { type: string }[] }>().items.map((event) => event.type)).toContain(
      'publish.conflict',
    );
  });

  test('diff показывает изменённые решения и удалённые действия', async () => {
    const first = await create(app);
    const firstEmail = first.actions.find((action) => action.field === 'company_email')!;
    await decide(app, first, [{ actionId: firstEmail.id, decision: 'accepted' }]);
    const second = await create(
      app,
      [{ id: 'ROW-1', values: { company_email: 'ok@example.org', company_city: 'Г. Сочи' } }],
      first.id,
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/change-sets/${second.id}/diff?against=${encodeURIComponent(first.id)}`,
    });
    const diff = response.json<{ removed: { before: ActionDto }[]; changed: unknown[] }>();
    expect(response.statusCode).toBe(200);
    expect(diff.removed.map((entry) => entry.before.field)).toContain('company_email');
  });

  test('новая публикация supersede-ит предыдущую, draft можно discard', async () => {
    const first = await create(app);
    await decide(
      app,
      first,
      first.actions.map((action) => ({ actionId: action.id, decision: 'accepted' as const })),
    );
    const firstPublished = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/change-sets/${first.id}/publish`,
        payload: { records },
      })
    ).json<PublishDto>();
    const second = await create(app, firstPublished.records, first.id);
    await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${second.id}/publish`,
      payload: { records: firstPublished.records },
    });

    const old = await app.inject({ method: 'GET', url: `/api/v1/change-sets/${first.id}` });
    expect(old.json<VersionDto>().status).toBe('superseded');

    const draft = await create(app, firstPublished.records, second.id);
    const discarded = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/discard`,
    });
    expect(discarded.json<VersionDto>().status).toBe('discarded');
  });

  test('rollback создаёт один compensating draft и восстанавливает только принятые действия', async () => {
    const source = await create(app);
    const email = source.actions.find((action) => action.field === 'company_email')!;
    await decide(app, source, [{ actionId: email.id, decision: 'accepted' }]);
    const published = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/change-sets/${source.id}/publish`,
        payload: { records },
      })
    ).json<PublishDto>();

    const rollbackResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${source.id}/rollback`,
      payload: { records: published.records },
    });
    const rollback = rollbackResponse.json<VersionDto>();
    const repeated = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${source.id}/rollback`,
      payload: { records: published.records },
    });
    expect(repeated.json<VersionDto>().id).toBe(rollback.id);
    expect(rollback.rollbackOfId).toBe(source.id);
    expect(rollback.actions).toHaveLength(1);
    expect(rollback.actions[0]).toMatchObject({
      before: 'info@a.example',
      after: 'Info @ A.example',
      decision: 'pending',
    });

    await decide(app, rollback, [
      { actionId: rollback.actions[0]!.id, decision: 'accepted' },
    ]);
    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${rollback.id}/publish`,
      payload: { records: published.records },
    });
    expect(restored.json<PublishDto>().records[0]?.values.company_email).toBe('Info @ A.example');
  });
});

test('файловое хранилище переживает перезапуск приложения и миграции повторяются безопасно', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'plc-change-sets-'));
  const path = join(directory, 'versions.sqlite');
  let first: FastifyInstance | undefined;
  let second: FastifyInstance | undefined;
  try {
    first = await makeApp(path);
    const version = await create(first);
    await first.close();
    first = undefined;

    second = await makeApp(path);
    const listed = await second.inject({ method: 'GET', url: '/api/v1/change-sets' });
    expect(listed.json<{ items: VersionDto[] }>().items[0]?.id).toBe(version.id);
  } finally {
    if (first !== undefined) await first.close();
    if (second !== undefined) await second.close();
    await rm(directory, { recursive: true, force: true });
  }
});
