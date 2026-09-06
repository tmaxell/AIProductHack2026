import { readFile } from 'node:fs/promises';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import type { CompanyIndex } from './domain/matching/index.js';
import { loadCompanyIndex } from './infrastructure/company-reference-file.js';
import { API_PREFIX, ErrorResponse } from './contracts/common.js';
import { CHANGE_SET_SCHEMAS } from './contracts/change-set.js';
import { v1Routes } from './routes/v1/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    appConfig: AppConfig;
    appVersion: string;
    companyIndex: CompanyIndex;
  }
}

async function readVersion(): Promise<string> {
  const url = new URL('../package.json', import.meta.url);
  const raw = await readFile(url, 'utf8');
  return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
}

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    // X-Forwarded-* приходят от nginx: без trustProxy в логах будет ip контейнера.
    trustProxy: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.decorate('appConfig', config);
  app.decorate('appVersion', await readVersion());
  app.decorate(
    'companyIndex',
    await loadCompanyIndex(config.datasetPath, (message) => { app.log.info(message); }),
  );

  await app.register(helmet, { contentSecurityPolicy: false });

  if (config.corsOrigins.length > 0) {
    await app.register(cors, { origin: [...config.corsOrigins] });
  }

  app.addSchema(ErrorResponse);
  for (const schema of CHANGE_SET_SCHEMAS) app.addSchema(schema);

  if (config.exposeDocs) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Project Launch Copilot API',
          description:
            'API веб-приложения. Не имеет отношения к Widget Script для реальных MWS Tables.',
          version: app.appVersion,
        },
        servers: [{ url: API_PREFIX }],
      },
    });
    // Под префиксом /api/, чтобы nginx проксировал документацию тем же
    // единственным правилом, что и остальной API.
    await app.register(swaggerUi, { routePrefix: `${API_PREFIX}/docs` });
  }

  await app.register(v1Routes, { prefix: API_PREFIX });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Маршрут ${request.method} ${request.url} не найден`,
    }),
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) request.log.error({ err: error }, 'unhandled error');
    reply.code(statusCode).send({
      statusCode,
      error: error.name || 'Error',
      // Внутренние детали наружу не отдаём.
      message: statusCode >= 500 ? 'Внутренняя ошибка сервиса' : error.message,
    });
  });

  return app;
}
