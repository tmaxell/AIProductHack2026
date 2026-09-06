import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { changeSetRoutes } from './change-sets.js';
import { healthRoutes } from './health.js';

export const v1Routes: FastifyPluginAsyncTypebox = async (fastify) => {
  await fastify.register(healthRoutes);
  await fastify.register(changeSetRoutes);
};
