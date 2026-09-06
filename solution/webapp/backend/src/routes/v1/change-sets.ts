import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { ErrorResponse } from '../../contracts/common.js';
import {
  ApplyChangeSetRequest,
  ApplyChangeSetResponse,
  ChangeSetDiff as ChangeSetDiffSchema,
  ChangeSetDiffQuery,
  ChangeSetHistory,
  ChangeSetIdParams,
  ChangeSetList,
  ChangeSetListQuery,
  CreateChangeSetRequest,
  PublishChangeSetRequest,
  PublishChangeSetResponse,
  StoredChangeSet,
  UpdateDecisionsRequest,
} from '../../contracts/change-set.js';
import { applyActions, UnknownActionsError, type ApplyOutcome } from '../../domain/apply.js';
import {
  buildChangeSet,
  type ChangeAction,
  type SourceRecord,
} from '../../domain/change-set.js';
import type { VersionedAction, VersionedChangeSet } from '../../domain/version.js';

interface RecordDto {
  id: string;
  values: Record<string, string | null>;
}

function toDomain(records: readonly RecordDto[]): SourceRecord[] {
  return records.map((record) => ({ id: record.id, values: { ...record.values } }));
}

function toRecordDtos(records: readonly SourceRecord[]): RecordDto[] {
  return records.map((record) => ({ id: record.id, values: { ...record.values } }));
}

interface ActionDto {
  kind: 'normalize' | 'match' | 'duplicate';
  id: string;
  recordId: string;
  field: string;
  ruleCode: string;
  ruleName: string;
  reason: string;
  group: string;
  before: string | null;
  after: string | null;
  confidence?: 'high' | 'medium' | 'low';
  evidence?: string[];
}

function toActionDto(action: ChangeAction): ActionDto {
  return {
    kind: action.kind,
    id: action.id,
    recordId: action.recordId,
    field: action.field,
    ruleCode: action.ruleCode,
    ruleName: action.ruleName,
    reason: action.reason,
    group: action.group,
    before: action.before,
    after: action.after,
    ...(action.confidence === undefined ? {} : { confidence: action.confidence }),
    ...(action.evidence === undefined ? {} : { evidence: [...action.evidence] }),
  };
}

function toVersionedActionDto(action: VersionedAction) {
  return {
    ...toActionDto(action),
    decision: action.decision,
    result: action.result,
    ...(action.editedAfter === undefined ? {} : { editedAfter: action.editedAfter }),
    ...(action.resultMessage === undefined ? {} : { resultMessage: action.resultMessage }),
    ...(action.executedAt === undefined ? {} : { executedAt: action.executedAt }),
  };
}

function toStoredDto(changeSet: VersionedChangeSet) {
  return {
    id: changeSet.id,
    sequence: changeSet.sequence,
    status: changeSet.status,
    sourceFingerprint: changeSet.sourceFingerprint,
    createdAt: changeSet.createdAt,
    updatedAt: changeSet.updatedAt,
    ...(changeSet.publishedAt === undefined ? {} : { publishedAt: changeSet.publishedAt }),
    ...(changeSet.parentId === undefined ? {} : { parentId: changeSet.parentId }),
    ...(changeSet.rollbackOfId === undefined ? {} : { rollbackOfId: changeSet.rollbackOfId }),
    actions: changeSet.actions.map(toVersionedActionDto),
    issues: changeSet.issues.map((found) => ({ ...found })),
    summary: { ...changeSet.summary },
  };
}

function toApplyDto(outcome: ApplyOutcome) {
  return {
    records: toRecordDtos(outcome.records),
    applied: outcome.applied.map(toActionDto),
    skipped: outcome.skipped.map((entry) => ({ ...entry })),
  };
}

export const changeSetRoutes: FastifyPluginAsyncTypebox = (fastify) => {
  fastify.post(
    '/change-sets',
    {
      schema: {
        tags: ['change-sets'],
        summary: 'Создать и сохранить новую draft-версию набора изменений',
        description:
          'Строит preview существующей доменной функцией и сохраняет новую версию. Данные не изменяет.',
        body: CreateChangeSetRequest,
        response: { 200: StoredChangeSet, 400: ErrorResponse, 404: ErrorResponse },
      },
    },
    (request) =>
      toStoredDto(
        fastify.changeSets.create(toDomain(request.body.records), request.body.parentId),
      ),
  );

  fastify.get(
    '/change-sets',
    {
      schema: {
        tags: ['change-sets'],
        summary: 'Получить историю версий',
        querystring: ChangeSetListQuery,
        response: { 200: ChangeSetList },
      },
    },
    (request) => ({ items: fastify.changeSets.list(request.query.status).map(toStoredDto) }),
  );

  fastify.get(
    '/change-sets/:id',
    {
      schema: {
        tags: ['change-sets'],
        summary: 'Получить сохранённую версию',
        params: ChangeSetIdParams,
        response: { 200: StoredChangeSet, 404: ErrorResponse },
      },
    },
    (request) => toStoredDto(fastify.changeSets.get(request.params.id)),
  );

  fastify.patch(
    '/change-sets/:id/decisions',
    {
      schema: {
        tags: ['change-sets'],
        summary: 'Сохранить решения пользователя по действиям draft',
        params: ChangeSetIdParams,
        body: UpdateDecisionsRequest,
        response: {
          200: StoredChangeSet,
          404: ErrorResponse,
          409: ErrorResponse,
          422: ErrorResponse,
        },
      },
    },
    (request) =>
      toStoredDto(fastify.changeSets.updateDecisions(request.params.id, request.body.actions)),
  );

  fastify.get(
    '/change-sets/:id/history',
    {
      schema: {
        tags: ['change-sets'],
        summary: 'Получить append-only историю версии',
        params: ChangeSetIdParams,
        response: { 200: ChangeSetHistory, 404: ErrorResponse },
      },
    },
    (request) => ({ items: fastify.changeSets.history(request.params.id) }),
  );

  fastify.get(
    '/change-sets/:id/diff',
    {
      schema: {
        tags: ['change-sets'],
        summary: 'Сравнить две сохранённые версии',
        params: ChangeSetIdParams,
        querystring: ChangeSetDiffQuery,
        response: { 200: ChangeSetDiffSchema, 404: ErrorResponse },
      },
    },
    (request) => {
      const diff = fastify.changeSets.diff(request.params.id, request.query.against);
      return {
        ...diff,
        added: diff.added.map((entry) => ({
          key: entry.key,
          ...(entry.after === undefined ? {} : { after: toVersionedActionDto(entry.after) }),
        })),
        removed: diff.removed.map((entry) => ({
          key: entry.key,
          ...(entry.before === undefined ? {} : { before: toVersionedActionDto(entry.before) }),
        })),
        changed: diff.changed.map((entry) => ({
          key: entry.key,
          ...(entry.before === undefined ? {} : { before: toVersionedActionDto(entry.before) }),
          ...(entry.after === undefined ? {} : { after: toVersionedActionDto(entry.after) }),
        })),
      };
    },
  );

  fastify.post(
    '/change-sets/:id/publish',
    {
      schema: {
        tags: ['change-sets'],
        summary: 'Опубликовать подтверждённые действия draft',
        description:
          'Проверяет сохранённый fingerprint, применяет только accepted-действия и сохраняет результат каждого действия.',
        params: ChangeSetIdParams,
        body: PublishChangeSetRequest,
        response: {
          200: PublishChangeSetResponse,
          404: ErrorResponse,
          409: ErrorResponse,
        },
      },
    },
    (request) => {
      const outcome = fastify.changeSets.publish(
        request.params.id,
        toDomain(request.body.records),
      );
      return {
        changeSet: toStoredDto(outcome.changeSet),
        records: toRecordDtos(outcome.records),
        idempotent: outcome.idempotent,
      };
    },
  );

  fastify.post(
    '/change-sets/:id/rollback',
    {
      schema: {
        tags: ['change-sets'],
        summary: 'Создать компенсирующий rollback-draft',
        description: 'Не меняет данные: обратные действия требуют отдельного preview и публикации.',
        params: ChangeSetIdParams,
        body: PublishChangeSetRequest,
        response: { 200: StoredChangeSet, 404: ErrorResponse, 409: ErrorResponse },
      },
    },
    (request) =>
      toStoredDto(
        fastify.changeSets.createRollback(request.params.id, toDomain(request.body.records)),
      ),
  );

  fastify.post(
    '/change-sets/:id/discard',
    {
      schema: {
        tags: ['change-sets'],
        summary: 'Отбросить draft без удаления истории',
        params: ChangeSetIdParams,
        response: { 200: StoredChangeSet, 404: ErrorResponse, 409: ErrorResponse },
      },
    },
    (request) => toStoredDto(fastify.changeSets.discard(request.params.id)),
  );

  // Переходный stateless-контракт для старого клиента. Он использует те же
  // доменные build/apply/fingerprint-примитивы, но не является историей.
  fastify.post(
    '/change-sets/apply',
    {
      schema: {
        deprecated: true,
        tags: ['change-sets'],
        summary: 'Применить подтверждённые действия без сохранённой версии',
        body: ApplyChangeSetRequest,
        response: {
          200: ApplyChangeSetResponse,
          400: ErrorResponse,
          409: ErrorResponse,
          422: ErrorResponse,
        },
      },
    },
    (request, reply) => {
      const records = toDomain(request.body.records);
      const changeSet = buildChangeSet(records, fastify.dataset);
      if (changeSet.sourceFingerprint !== request.body.sourceFingerprint) {
        void reply.code(409).send({
          statusCode: 409,
          error: 'Conflict',
          message:
            'Исходные данные изменились после анализа. Повторите проверку и подтвердите изменения заново.',
        });
        return;
      }
      try {
        void reply.code(200).send(toApplyDto(applyActions(records, changeSet, request.body.actionIds)));
      } catch (error) {
        if (error instanceof UnknownActionsError) {
          void reply.code(422).send({
            statusCode: 422,
            error: 'Unprocessable Entity',
            message: error.message,
          });
          return;
        }
        throw error;
      }
    },
  );

  return Promise.resolve();
};
