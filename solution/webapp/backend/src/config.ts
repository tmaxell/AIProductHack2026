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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnv = pickEnum('APP_ENV', env.APP_ENV, ENVS, 'development');
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
  };
}
