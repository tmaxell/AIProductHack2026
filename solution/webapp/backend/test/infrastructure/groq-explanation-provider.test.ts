import { describe, expect, test, vi } from 'vitest';
import { GroqExplanationProvider } from '../../src/infrastructure/groq-explanation-provider.js';

const payload = {
  version: { sequence: 1, status: 'draft' as const, isRollback: false },
  actions: [],
};
const output = {
  summary: 'Итог',
  evidence: ['Правило'],
  risks: [],
  openQuestions: [],
  recommendedActions: ['Проверить'],
};

function provider(fetchFn: typeof fetch, maxRetries = 1) {
  return new GroqExplanationProvider({
    apiKey: 'test-key',
    baseUrl: 'https://api.groq.test/openai/v1/',
    model: 'test-model',
    structuredOutput: 'strict',
    timeoutMs: 1000,
    maxRetries,
    maxCompletionTokens: 1200,
    fetchFn,
    sleep: () => Promise.resolve(),
  });
}

describe('Groq explanation adapter', () => {
  test('запрашивает strict JSON Schema и возвращает валидный объект', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), {
        status: 200,
      }),
    );
    await expect(provider(fetchFn).explain(payload)).resolves.toEqual(output);
    const [url, request] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.groq.test/openai/v1/chat/completions');
    expect(typeof request?.body).toBe('string');
    const body = JSON.parse(request?.body as string) as {
      response_format: { json_schema: { strict: boolean } };
      tools?: unknown;
    };
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.tools).toBeUndefined();
    expect(request?.headers).toMatchObject({ authorization: 'Bearer test-key' });
  });

  test('задача оператора отделена от недоверенного payload', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), {
        status: 200,
      }),
    );

    await provider(fetchFn).explain({ ...payload, instruction: 'Покажи риски публикации' });

    const body = JSON.parse(fetchFn.mock.calls[0]![1]?.body as string) as {
      messages: { role: string; content: string }[];
    };
    const system = body.messages.find((message) => message.role === 'system')!.content;
    const user = body.messages.find((message) => message.role === 'user')!.content;
    const serialized = user.slice(user.indexOf('Payload:'));

    expect(user).toContain('Задача оператора: Покажи риски публикации');
    expect(system).toContain('Задача оператора');
    // Инструкция не должна попадать в блок, объявленный недоверенными данными:
    // иначе модель одновременно обязана ей следовать и не исполнять её.
    expect(serialized).not.toContain('Покажи риски публикации');
    expect(serialized).not.toContain('instruction');
  });

  test('без инструкции подставляется задача по умолчанию', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), {
        status: 200,
      }),
    );

    await provider(fetchFn).explain(payload);

    const body = JSON.parse(fetchFn.mock.calls[0]![1]?.body as string) as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages[1]!.content).toContain('Задача оператора: Объясни изменения');
  });

  test('повторяет 429 и не включает тело провайдера в ошибку', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('secret provider details', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), {
          status: 200,
        }),
      );
    await expect(provider(fetchFn).explain(payload)).resolves.toEqual(output);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test('отклоняет ответ вне схемы', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"summary":"only"}' } }] }), {
        status: 200,
      }),
    );
    await expect(provider(fetchFn, 0).explain(payload)).rejects.toMatchObject({
      code: 'groq_schema_mismatch',
    });
  });
});
