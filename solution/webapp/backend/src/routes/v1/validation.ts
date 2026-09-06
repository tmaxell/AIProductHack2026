import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { ErrorResponse } from '../../contracts/common.js';
import {
  ValidationRunRequest,
  ValidationRunResponse,
} from '../../contracts/validation.js';

/**
 * Контракт объявлен, реализации нет: доменная логика пока живёт на фронтенде
 * и переносится в src/domain отдельной задачей. Эндпоинт честно отвечает 501,
 * чтобы никто не принял его за работающий.
 */
export const validationRoutes: FastifyPluginAsyncTypebox = (fastify) => {
  fastify.post(
    '/validation/runs',
    {
      schema: {
        tags: ['validation'],
        summary: 'Проверить заявки и вернуть предложенные изменения',
        description:
          'Не реализовано: логика проверки переносится с фронтенда отдельной задачей.',
        body: ValidationRunRequest,
        response: {
          200: ValidationRunResponse,
          501: ErrorResponse,
        },
      },
    },
    (_request, reply) => {
      void reply.code(501).send({
        statusCode: 501,
        error: 'Not Implemented',
        message:
          'Проверка заявок пока выполняется на фронтенде. Перенос логики в backend — отдельная задача.',
      });
    },
  );

  return Promise.resolve();
};
