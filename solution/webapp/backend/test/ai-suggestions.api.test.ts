import { afterEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { ExplanationProvider } from '../src/application/explanation-provider.js';
import type { AiSuggestion, AmbiguousRequest } from '../src/domain/ai-suggestion.js';

const records = [
  { id: 'ROW-1', values: { company_city: 'Челябинкс', company_name: 'Прочее' } },
  { id: 'ROW-2', values: { company_city: 'Izhesvk', company_name: 'Прочее' } },
];

function makeApp(provider?: ExplanationProvider) {
  return buildApp(
    loadConfig({ APP_ENV: 'test', APP_LOG_LEVEL: 'fatal', APP_STORAGE_PATH: ':memory:' }),
    provider === undefined ? {} : { explanationProvider: provider },
  );
}

function provider(suggest: (r: AmbiguousRequest) => Promise<readonly AiSuggestion[]>): ExplanationProvider {
  return { model: 'test-model', explain: () => Promise.reject(new Error('не используется')), suggest };
}

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function draftWith(app: FastifyInstance) {
  apps.push(app);
  await app.ready();
  const response = await app.inject({ method: 'POST', url: '/api/v1/change-sets', payload: { records } });
  return response.json<{ id: string; summary: { actions: number } }>();
}

describe('разбор спорных значений', () => {
  test('считает спорные значения, ничего не отправляя наружу', async () => {
    const suggest = vi.fn();
    const draft = await draftWith(await makeApp(provider(suggest)));

    const status = await apps[0]!.inject({
      method: 'GET',
      url: `/api/v1/change-sets/${draft.id}/ai-suggestions`,
    });

    expect(status.json()).toMatchObject({ available: true, pending: 2 });
    expect(suggest).not.toHaveBeenCalled();
  });

  test('ответ модели становится предложением со статусом pending', async () => {
    const app = await makeApp(provider((request) =>
      Promise.resolve(request.items.map((item) => ({
        ref: item.ref,
        value: item.value === 'Челябинкс' ? 'Челябинск' : 'Ижевск',
        confidence: 'medium' as const,
        reason: 'опечатка',
      }))),
    ));
    const draft = await draftWith(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/ai-suggestions`,
    });
    const body = response.json<{
      added: number; rejected: number;
      changeSet: { summary: { actions: number }; actions: { kind: string; decision: string; after: string }[] };
    }>();

    expect(body.added).toBe(2);
    const ai = body.changeSet.actions.filter((action) => action.kind === 'ai');
    expect(ai.map((action) => action.after).sort()).toEqual(['Ижевск', 'Челябинск']);
    // Ничего не применено: решение остаётся за человеком, запись — за публикацией.
    expect(ai.every((action) => action.decision === 'pending')).toBe(true);
    expect(body.changeSet.summary.actions).toBe(draft.summary.actions + 2);
  });

  test('значение вне словаря отбрасывается локальной проверкой', async () => {
    const app = await makeApp(provider((request) =>
      Promise.resolve([
        { ref: request.items[0]!.ref, value: 'Атлантида', confidence: 'high' as const, reason: 'выдумка' },
        { ref: 'record-999', value: 'Москва', confidence: 'high' as const, reason: 'нет такой записи' },
      ]),
    ));
    const draft = await draftWith(app);

    const body = (await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/ai-suggestions`,
    })).json<{ added: number; rejected: number }>();

    expect(body.added).toBe(0);
    expect(body.rejected).toBe(2);
  });

  test('повторный разбор не создаёт дубли действий', async () => {
    const app = await makeApp(provider((request) =>
      Promise.resolve([{ ref: request.items[0]!.ref, value: 'Челябинск', confidence: 'low' as const, reason: 'опечатка' }]),
    ));
    const draft = await draftWith(app);
    const url = `/api/v1/change-sets/${draft.id}/ai-suggestions`;

    expect((await app.inject({ method: 'POST', url })).json<{ added: number }>().added).toBe(1);
    expect((await app.inject({ method: 'POST', url })).json<{ added: number }>().added).toBe(0);
  });

  test('без ключа Groq разбор недоступен, остальное работает', async () => {
    const app = await makeApp();
    const draft = await draftWith(app);

    const status = await app.inject({
      method: 'GET',
      url: `/api/v1/change-sets/${draft.id}/ai-suggestions`,
    });
    expect(status.json()).toMatchObject({ available: false, pending: 2 });

    const attempt = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${draft.id}/ai-suggestions`,
    });
    expect(attempt.statusCode).toBe(503);
  });
});
