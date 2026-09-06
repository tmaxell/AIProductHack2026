import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { HealthResponse } from '../../contracts/health.js';

export const healthRoutes: FastifyPluginAsyncTypebox = (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['service'],
        summary: 'Проверка живости сервиса',
        response: { 200: HealthResponse },
      },
      logLevel: 'warn',
    },
    () => ({
      status: 'ok' as const,
      version: fastify.appVersion,
      env: fastify.appConfig.env,
      uptimeSeconds: Math.round(process.uptime()),
    }),
  );

  return Promise.resolve();
};
