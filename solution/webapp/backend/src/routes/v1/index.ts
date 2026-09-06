import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { changeSetRoutes } from './change-sets.js';
import { healthRoutes } from './health.js';
import { explanationRoutes } from './explanations.js';

export const v1Routes: FastifyPluginAsyncTypebox = async (fastify) => {
  await fastify.register(healthRoutes);
  await fastify.register(changeSetRoutes);
  await fastify.register(explanationRoutes);
};
