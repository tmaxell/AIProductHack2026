import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { ErrorResponse } from '../../contracts/common.js';
import {
  ApplyChangeSetRequest,
  ApplyChangeSetResponse,
  ChangeSet as ChangeSetSchema,
  CreateChangeSetRequest,
} from '../../contracts/change-set.js';
import { applyActions, UnknownActionsError, type ApplyOutcome } from '../../domain/apply.js';
import {
  buildChangeSet,
  type ChangeAction,
  type ChangeSet,
  type SourceRecord,
} from '../../domain/change-set.js';

interface RecordDto {
  id: string;
  values: Record<string, string | null>;
}

/** DTO → домен: домен не должен зависеть от формы HTTP-запроса. */
function toDomain(records: readonly RecordDto[]): SourceRecord[] {
  return records.map((record) => ({ id: record.id, values: { ...record.values } }));
}

/** Домен → DTO: доменные структуры readonly, схема ответа ожидает обычные массивы. */
function toRecordDtos(records: readonly SourceRecord[]): RecordDto[] {
  return records.map((record) => ({ id: record.id, values: { ...record.values } }));
}

interface ActionDto {
  kind: 'normalize' | 'match';
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

/** Доменные структуры readonly, схема ответа ожидает обычные массивы. */
function toActionDto(action: ChangeAction): ActionDto {
  const dto: ActionDto = {
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
  };
  if (action.confidence !== undefined) dto.confidence = action.confidence;
  if (action.evidence !== undefined) dto.evidence = [...action.evidence];
  return dto;
}

function toChangeSetDto(changeSet: ChangeSet) {
  return {
    id: changeSet.id,
    sourceFingerprint: changeSet.sourceFingerprint,
    createdAt: changeSet.createdAt,
    actions: changeSet.actions.map(toActionDto),
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
        summary: 'Проанализировать записи и получить черновик набора изменений',
        description:
          'Ничего не изменяет. Возвращает предложенные действия, замечания и отпечаток исходных данных.',
        body: CreateChangeSetRequest,
        response: { 200: ChangeSetSchema, 400: ErrorResponse },
      },
    },
    (request) => toChangeSetDto(buildChangeSet(toDomain(request.body.records), fastify.companyIndex)),
  );

  fastify.post(
    '/change-sets/apply',
    {
      schema: {
        tags: ['change-sets'],
        summary: 'Применить подтверждённые действия',
        description:
          'Применяет только действия из actionIds. Если исходные данные изменились после анализа, ' +
          'операция отклоняется конфликтом. Повторный вызов с тем же набором не применяет изменения дважды.',
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
      const changeSet = buildChangeSet(records, fastify.companyIndex);

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
