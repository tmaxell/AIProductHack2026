import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ExplanationProvider } from '../src/application/explanation-provider.js';
import { ExplanationProviderError } from '../src/application/explanation-provider.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const records = [{
  id: 'ROW-SECRET-1',
  values: { requester_email: 'User @ Example.org', company_city: 'Г. Сочи' },
}];
const result = {
  summary: 'Есть два изменения.',
  evidence: ['Правила нормализации'],
  risks: ['Проверьте домен email'],
  openQuestions: [],
  recommendedActions: ['Подтвердить только после проверки'],
};

async function makeApp(
  explanationProvider?: ExplanationProvider,
  storagePath = ':memory:',
): Promise<FastifyInstance> {
  const app = await buildApp(
    loadConfig({ APP_ENV: 'test', APP_LOG_LEVEL: 'fatal', APP_STORAGE_PATH: storagePath }),
    explanationProvider === undefined ? {} : { explanationProvider },
  );
  await app.ready();
  return app;
}

async function createDraft(app: FastifyInstance) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/change-sets',
    payload: { records },
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ id: string; status: string; actions: { id: string }[] }>();
}

describe('AI-объяснения сохранённого Change Set', () => {
  const apps: FastifyInstance[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
  });

  test('preview работает без ключа, а внешний вызов явно недоступен', async () => {
    const app = await makeApp();
    apps.push(app);
    const draft = await createDraft(app);
    const actionIds = [draft.actions[0]!.id];

    const preview = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/explanation-preview`,
      payload: { actionIds },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      available: false,
      actionIds,
      payload: { actions: [{ recordRef: 'record-1' }] },
    });
    expect(JSON.stringify(preview.json<{ payload: unknown }>().payload)).not.toContain('ROW-SECRET-1');

    const explain = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/explanations`,
      payload: { actionIds },
    });
    expect(explain.statusCode).toBe(503);
    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/change-sets/${draft.id}/explanations`,
    });
    expect(list.json()).toEqual({ items: [] });
  });

  test('сохраняет успешный результат, модель, prompt version и audit-события', async () => {
    const explain = vi.fn<ExplanationProvider['explain']>().mockResolvedValue(result);
    const app = await makeApp({ model: 'test-model', explain, suggest: () => Promise.resolve([]) });
    apps.push(app);
    const draft = await createDraft(app);
    const actionIds = draft.actions.map((action) => action.id);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/explanations`,
      payload: { actionIds },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'completed',
      model: 'test-model',
      promptVersion: 'change-set-copilot-v2',
      response: result,
    });
    expect(explain).toHaveBeenCalledOnce();

    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/change-sets/${draft.id}/history`,
    });
    expect(history.json<{ items: { type: string }[] }>().items.map((event) => event.type)).toEqual(
      expect.arrayContaining(['explanation.requested', 'explanation.completed']),
    );
  });

  test('область задаётся scope, а не перечислением действий', async () => {
    const app = await makeApp();
    apps.push(app);
    const draft = await createDraft(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/explanation-preview`,
      payload: { scope: 'not-rejected' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ actionIds: string[] }>();
    expect(body.actionIds).toEqual(draft.actions.map((action) => action.id));
  });

  test('пустая область отклоняется с 422, а не уходит в модель', async () => {
    const app = await makeApp();
    apps.push(app);
    const draft = await createDraft(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/explanation-preview`,
      payload: { scope: 'accepted' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: string }>().error).toBe('EmptyExplanationScopeError');
  });

  test('ошибка сохраняется, но не меняет статус Change Set', async () => {
    const provider: ExplanationProvider = {
      model: 'test-model',
      suggest: () => Promise.resolve([]),
      explain: () => Promise.reject(new ExplanationProviderError('Временная ошибка', 'temporary')),
    };
    const app = await makeApp(provider);
    apps.push(app);
    const draft = await createDraft(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/explanations`,
      payload: { actionIds: [draft.actions[0]!.id] },
    });
    expect(response.statusCode).toBe(502);
    const attempts = await app.inject({
      method: 'GET',
      url: `/api/v1/change-sets/${draft.id}/explanations`,
    });
    expect(attempts.json()).toMatchObject({
      items: [{ status: 'failed', errorCode: 'temporary', errorMessage: 'Временная ошибка' }],
    });
    const stored = await app.inject({ method: 'GET', url: `/api/v1/change-sets/${draft.id}` });
    expect(stored.json()).toMatchObject({ status: 'draft' });
  });

  test('результат переживает перезапуск SQLite backend', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'plc-explanations-'));
    directories.push(directory);
    const storagePath = join(directory, 'store.sqlite');
    const first = await makeApp(
      { model: 'test-model', explain: () => Promise.resolve(result), suggest: () => Promise.resolve([]) },
      storagePath,
    );
    const draft = await createDraft(first);
    await first.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/explanations`,
      payload: { actionIds: [draft.actions[0]!.id] },
    });
    await first.close();

    const second = await makeApp(undefined, storagePath);
    apps.push(second);
    const list = await second.inject({
      method: 'GET',
      url: `/api/v1/change-sets/${draft.id}/explanations`,
    });
    expect(list.json()).toMatchObject({ items: [{ status: 'completed', response: result }] });
  });
});
