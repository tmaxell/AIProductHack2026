import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { Static } from '@sinclair/typebox';
import { EXPLANATION_PROMPT_VERSION } from '../../application/change-set-explanation-service.js';
import { ChangeSetIdParams } from '../../contracts/change-set.js';
import { ErrorResponse } from '../../contracts/common.js';
import {
  ExplanationList,
  ExplanationPreviewResponse,
  ExplanationRequest,
  StoredExplanation,
} from '../../contracts/explanation.js';
import type { ExplanationPreview } from '../../domain/explanation.js';
import type { StoredExplanation as StoredExplanationEntity } from '../../infrastructure/change-set-store.js';

function previewDto(preview: ExplanationPreview) {
  return {
    actionIds: [...preview.actionIds],
    fields: [...preview.fields],
    payload: {
      version: { ...preview.payload.version },
      actions: preview.payload.actions.map((action) => ({
        actionRef: action.actionRef,
        recordRef: action.recordRef,
        kind: action.kind,
        field: action.field,
        ruleCode: action.ruleCode,
        ruleName: action.ruleName,
        reason: action.reason,
        before: action.before,
        after: action.after,
        decision: action.decision,
        result: action.result,
        ...(action.confidence === undefined ? {} : { confidence: action.confidence }),
        ...(action.evidence === undefined ? {} : { evidence: [...action.evidence] }),
      })),
    },
  };
}

function explanationDto(
  explanation: StoredExplanationEntity,
): Static<typeof StoredExplanation> {
  return {
    id: explanation.id,
    changeSetId: explanation.changeSetId,
    status: explanation.status,
    model: explanation.model,
    promptVersion: explanation.promptVersion,
    actionIds: [...explanation.actionIds],
    disclosedFields: [...explanation.disclosedFields],
    requestPayload: previewDto({
      actionIds: explanation.actionIds,
      fields: explanation.disclosedFields,
      payload: explanation.requestPayload,
    }).payload,
    createdAt: explanation.createdAt,
    ...(explanation.completedAt === undefined ? {} : { completedAt: explanation.completedAt }),
    ...(explanation.errorCode === undefined ? {} : { errorCode: explanation.errorCode }),
    ...(explanation.errorMessage === undefined ? {} : { errorMessage: explanation.errorMessage }),
    ...(explanation.response === undefined
      ? {}
      : {
          response: {
            summary: explanation.response.summary,
            evidence: [...explanation.response.evidence],
            risks: [...explanation.response.risks],
            openQuestions: [...explanation.response.openQuestions],
            recommendedActions: [...explanation.response.recommendedActions],
          },
        }),
  };
}

export const explanationRoutes: FastifyPluginAsyncTypebox = (fastify) => {
  fastify.post(
    '/change-sets/:id/explanation-preview',
    {
      schema: {
        tags: ['change-set-explanations'],
        summary: 'Показать точный маскированный payload до отправки в Groq',
        params: ChangeSetIdParams,
        body: ExplanationRequest,
        response: { 200: ExplanationPreviewResponse, 404: ErrorResponse, 422: ErrorResponse },
      },
    },
    (request) => ({
      available: fastify.explanations.available,
      ...(fastify.explanations.model === undefined ? {} : { model: fastify.explanations.model }),
      promptVersion: EXPLANATION_PROMPT_VERSION,
      ...previewDto(fastify.explanations.preview(request.params.id, request.body.actionIds)),
    }),
  );

  fastify.post(
    '/change-sets/:id/explanations',
    {
      schema: {
        tags: ['change-set-explanations'],
        summary: 'Явно отправить показанный payload в Groq и сохранить результат',
        params: ChangeSetIdParams,
        body: ExplanationRequest,
        response: {
          200: StoredExplanation,
          404: ErrorResponse,
          422: ErrorResponse,
          502: ErrorResponse,
          503: ErrorResponse,
          504: ErrorResponse,
        },
      },
    },
    async (request) =>
      explanationDto(await fastify.explanations.explain(request.params.id, request.body.actionIds)),
  );

  fastify.get(
    '/change-sets/:id/explanations',
    {
      schema: {
        tags: ['change-set-explanations'],
        summary: 'Получить сохранённую историю AI-объяснений версии',
        params: ChangeSetIdParams,
        response: { 200: ExplanationList, 404: ErrorResponse },
      },
    },
    (request) => ({ items: fastify.explanations.list(request.params.id).map(explanationDto) }),
  );

  return Promise.resolve();
};
