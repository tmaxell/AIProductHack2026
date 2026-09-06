import { expect, test } from 'vitest';
import { loadConfig } from '../src/config.js';

test('значения по умолчанию рассчитаны на запуск в контейнере', () => {
  expect(loadConfig({})).toMatchObject({
    env: 'development',
    host: '0.0.0.0',
    port: 8000,
    corsOrigins: [],
  });
});

test('в production логи info и документация скрыта', () => {
  const config = loadConfig({ APP_ENV: 'production' });

  expect(config.logLevel).toBe('info');
  expect(config.exposeDocs).toBe(false);
});

test('некорректный порт роняет загрузку конфигурации', () => {
  expect(() => loadConfig({ APP_PORT: '99999' })).toThrow(/APP_PORT/);
});

test('список CORS-origin разбирается через запятую', () => {
  expect(loadConfig({ APP_CORS_ORIGINS: 'http://a, http://b ' }).corsOrigins).toEqual([
    'http://a',
    'http://b',
  ]);
});

test('Groq выключен без ключа и не принимает опасные значения retry', () => {
  expect(loadConfig({})).toMatchObject({
    groqBaseUrl: 'https://api.groq.com/openai/v1',
    groqModel: 'openai/gpt-oss-20b',
    groqStructuredOutput: 'strict',
    groqTimeoutMs: 15_000,
    groqMaxRetries: 2,
    groqMaxCompletionTokens: 1200,
  });
  expect(loadConfig({}).groqApiKey).toBeUndefined();
  expect(() => loadConfig({ GROQ_MAX_RETRIES: '20' })).toThrow(/GROQ_MAX_RETRIES/);
});
