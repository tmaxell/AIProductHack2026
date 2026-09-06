import { readFile } from 'node:fs/promises';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ChangeSetExplanationService } from './application/change-set-explanation-service.js';
import { ChangeSetConflictError, ChangeSetService } from './application/change-set-service.js';
import {
  ExplanationProviderError,
  ExplanationUnavailableError,
  type ExplanationProvider,
} from './application/explanation-provider.js';
import type { AppConfig } from './config.js';
import { loadDataset, type Dataset } from './infrastructure/dataset-file.js';
import {
  InvalidChangeSetStateError,
  SqliteChangeSetStore,
  StoredChangeSetNotFoundError,
  UnknownStoredActionsError,
} from './infrastructure/change-set-store.js';
import { API_PREFIX, ErrorResponse } from './contracts/common.js';
import { CHANGE_SET_SCHEMAS } from './contracts/change-set.js';
import { EXPLANATION_SCHEMAS } from './contracts/explanation.js';
import { EmptyExplanationScopeError } from './application/change-set-explanation-service.js';
import { ChangeSetAiSuggestionService } from './application/ai-suggestion-service.js';
import { GroqExplanationProvider } from './infrastructure/groq-explanation-provider.js';
import { v1Routes } from './routes/v1/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    appConfig: AppConfig;
    appVersion: string;
    dataset: Dataset;
    changeSets: ChangeSetService;
    explanations: ChangeSetExplanationService;
    aiSuggestions: ChangeSetAiSuggestionService;
  }
}

async function readVersion(): Promise<string> {
  const url = new URL('../package.json', import.meta.url);
  const raw = await readFile(url, 'utf8');
  return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
}

export interface BuildAppOptions {
  readonly explanationProvider?: ExplanationProvider;
}

export async function buildApp(
  config: AppConfig,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    // X-Forwarded-* приходят от nginx: без trustProxy в логах будет ip контейнера.
    trustProxy: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.decorate('appConfig', config);
  app.decorate('appVersion', await readVersion());
  app.decorate(
    'dataset',
    await loadDataset(config.datasetPath, (message: string) => { app.log.info(message); }),
  );
  const changeSetStore = new SqliteChangeSetStore(config.storagePath);
  app.decorate('changeSets', new ChangeSetService(changeSetStore, app.dataset));
  const configuredExplanationProvider = config.groqApiKey === undefined
    ? undefined
    : new GroqExplanationProvider({
        apiKey: config.groqApiKey,
        baseUrl: config.groqBaseUrl,
        model: config.groqModel,
        structuredOutput: config.groqStructuredOutput,
        timeoutMs: config.groqTimeoutMs,
        maxRetries: config.groqMaxRetries,
        maxCompletionTokens: config.groqMaxCompletionTokens,
      });
  const explanationProvider = options.explanationProvider ?? configuredExplanationProvider;
  app.decorate('explanations', new ChangeSetExplanationService(changeSetStore, explanationProvider));
  app.decorate('aiSuggestions', new ChangeSetAiSuggestionService(changeSetStore, explanationProvider));
  app.addHook('onClose', () => {
    changeSetStore.close();
    return Promise.resolve();
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  if (config.corsOrigins.length > 0) {
    await app.register(cors, { origin: [...config.corsOrigins] });
  }

  app.addSchema(ErrorResponse);
  for (const schema of CHANGE_SET_SCHEMAS) app.addSchema(schema);
  for (const schema of EXPLANATION_SCHEMAS) app.addSchema(schema);

  // Обработчик задаётся до регистрации дочерних route-плагинов: Fastify
  // наследует error handler по encapsulation-иерархии в момент регистрации.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    let statusCode = error.statusCode ?? 500;
    // Известные ошибки домена и приложения несут безопасный текст для
    // пользователя. Маскируется только нераспознанное: иначе 503
    // «AI не настроен» превращался во «Внутреннюю ошибку сервиса».
    let known = true;
    if (error instanceof StoredChangeSetNotFoundError) statusCode = 404;
    else if (error instanceof UnknownStoredActionsError) statusCode = 422;
    else if (error instanceof ExplanationUnavailableError) statusCode = 503;
    else if (error instanceof EmptyExplanationScopeError) statusCode = 422;
    else if (error instanceof ExplanationProviderError) statusCode = error.statusCode;
    else if (error instanceof InvalidChangeSetStateError || error instanceof ChangeSetConflictError) {
      statusCode = 409;
    } else known = statusCode < 500;

    if (!known) request.log.error({ err: error }, 'unhandled error');
    else if (statusCode >= 500) request.log.warn({ err: error }, error.name);

    reply.code(statusCode).send({
      statusCode,
      error: error.name || 'Error',
      message: known ? error.message : 'Внутренняя ошибка сервиса',
    });
  });

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

  return app;
}
