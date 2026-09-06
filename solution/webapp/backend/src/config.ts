/**
 * Конфигурация читается только из переменных окружения и валидируется
 * при старте: неверное значение должно ронять процесс сразу, а не в рантайме.
 */
export interface AppConfig {
  readonly env: 'development' | 'production' | 'test';
  readonly host: string;
  readonly port: number;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  /** Пустой массив — CORS выключен: фронтенд ходит через тот же origin (nginx). */
  readonly corsOrigins: readonly string[];
  readonly exposeDocs: boolean;
  /** Демонстрационный набор данных со справочниками; пустая строка отключает сопоставление. */
  readonly datasetPath: string;
  /** SQLite-файл с версиями Change Set; :memory: используется в тестах. */
  readonly storagePath: string;
  /** Секрет остаётся только на backend; undefined полностью отключает внешний вызов. */
  readonly groqApiKey?: string;
  readonly groqBaseUrl: string;
  readonly groqModel: string;
  readonly groqTimeoutMs: number;
  readonly groqMaxRetries: number;
}

const ENVS = ['development', 'production', 'test'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

class ConfigError extends Error {}

function pickEnum<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (raw === undefined || raw === '') return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new ConfigError(`${name}: ожидалось одно из ${allowed.join(', ')}, получено "${raw}"`);
  }
  return raw as T;
}

function pickPort(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ConfigError(`${name}: ожидался порт 1..65535, получено "${raw}"`);
  }
  return value;
}

function pickInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ConfigError(`${name}: ожидалось целое ${minimum}..${maximum}, получено "${raw}"`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnv = pickEnum('APP_ENV', env.APP_ENV, ENVS, 'development');
  const groqApiKey = env.GROQ_API_KEY?.trim();
  return {
    env: appEnv,
    host: env.APP_HOST ?? '0.0.0.0',
    port: pickPort('APP_PORT', env.APP_PORT, 8000),
    logLevel: pickEnum(
      'APP_LOG_LEVEL',
      env.APP_LOG_LEVEL,
      LOG_LEVELS,
      appEnv === 'production' ? 'info' : 'debug',
    ),
    corsOrigins: (env.APP_CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    exposeDocs: (env.APP_EXPOSE_DOCS ?? String(appEnv !== 'production')) === 'true',
    datasetPath: env.APP_DATASET_PATH ?? '/app/data/raw/dev-sample.csv',
    storagePath:
      env.APP_STORAGE_PATH ?? (appEnv === 'test' ? ':memory:' : './var/change-sets.sqlite'),
    ...(groqApiKey ? { groqApiKey } : {}),
    groqBaseUrl: env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
    groqModel: env.GROQ_MODEL ?? 'openai/gpt-oss-20b',
    groqTimeoutMs: pickInteger('GROQ_TIMEOUT_MS', env.GROQ_TIMEOUT_MS, 15_000, 1_000, 60_000),
    groqMaxRetries: pickInteger('GROQ_MAX_RETRIES', env.GROQ_MAX_RETRIES, 2, 0, 5),
  };
}
