import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { healthRoutes } from './health.js';
import { validationRoutes } from './validation.js';

export const v1Routes: FastifyPluginAsyncTypebox = async (fastify) => {
  await fastify.register(healthRoutes);
  await fastify.register(validationRoutes);
};
