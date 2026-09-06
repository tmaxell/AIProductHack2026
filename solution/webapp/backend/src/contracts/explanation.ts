import { Type } from '@sinclair/typebox';
import { ActionDecision, ActionResult, ChangeSetStatus, Confidence, StoredChangeSet } from './change-set.js';

export const ExplanationScope = Type.Union(
  [Type.Literal('accepted'), Type.Literal('not-rejected')],
  {
    $id: 'ExplanationScope',
    description: 'Область действий вместо их перечисления; по умолчанию not-rejected',
  },
);

export const ExplanationRequest = Type.Object(
  {
    // На полной выгрузке в Change Set десятки тысяч действий: перечисление их
    // идентификаторов не проходит ограничение размера тела запроса, поэтому
    // область можно задать через scope, а список — только для точечных выборок.
    actionIds: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
    ),
    scope: Type.Optional(Type.Ref(ExplanationScope)),
    instruction: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  },
  { $id: 'ExplanationRequest' },
);

export const DisclosedAction = Type.Object({
  actionRef: Type.String(),
  recordRef: Type.String(),
  kind: Type.Union([
    Type.Literal('normalize'), Type.Literal('match'),
    Type.Literal('duplicate'), Type.Literal('ai'),
  ]),
  field: Type.String(),
  ruleCode: Type.String(),
  ruleName: Type.String(),
  reason: Type.String(),
  before: Type.Union([Type.String(), Type.Null()]),
  after: Type.Union([Type.String(), Type.Null()]),
  decision: Type.Ref(ActionDecision),
  result: Type.Ref(ActionResult),
  confidence: Type.Optional(Type.Ref(Confidence)),
  evidence: Type.Optional(Type.Array(Type.String())),
});

export const ExplanationPayload = Type.Object({
  version: Type.Object({
    sequence: Type.Integer(),
    status: Type.Ref(ChangeSetStatus),
    isRollback: Type.Boolean(),
  }),
  instruction: Type.Optional(Type.String()),
  coverage: Type.Optional(Type.Object({
    totalActions: Type.Integer(),
    sampledActions: Type.Integer(),
    byRule: Type.Record(Type.String(), Type.Integer()),
    byDecision: Type.Record(Type.String(), Type.Integer()),
    byResult: Type.Record(Type.String(), Type.Integer()),
  })),
  actions: Type.Array(DisclosedAction),
});

export const ExplanationPreviewResponse = Type.Object(
  {
    available: Type.Boolean(),
    model: Type.Optional(Type.String()),
    promptVersion: Type.String(),
    actionIds: Type.Array(Type.String()),
    fields: Type.Array(Type.String()),
    payload: ExplanationPayload,
  },
  { $id: 'ExplanationPreviewResponse' },
);

export const ExplanationOutput = Type.Object({
  summary: Type.String(),
  evidence: Type.Array(Type.String()),
  risks: Type.Array(Type.String()),
  openQuestions: Type.Array(Type.String()),
  recommendedActions: Type.Array(Type.String()),
});

export const StoredExplanation = Type.Object({
  id: Type.String(),
  changeSetId: Type.String(),
  status: Type.Union([Type.Literal('pending'), Type.Literal('completed'), Type.Literal('failed')]),
  model: Type.String(),
  promptVersion: Type.String(),
  actionIds: Type.Array(Type.String()),
  disclosedFields: Type.Array(Type.String()),
  requestPayload: ExplanationPayload,
  response: Type.Optional(ExplanationOutput),
  errorCode: Type.Optional(Type.String()),
  errorMessage: Type.Optional(Type.String()),
  createdAt: Type.String({ format: 'date-time' }),
  completedAt: Type.Optional(Type.String({ format: 'date-time' })),
});

export const ExplanationList = Type.Object(
  { items: Type.Array(StoredExplanation) },
  { $id: 'ExplanationList' },
);

export const AiSuggestionSummary = Type.Object(
  {
    requested: Type.Integer({ description: 'Сколько спорных значений было отправлено' }),
    added: Type.Integer({ description: 'Сколько предложений добавлено в draft' }),
    rejected: Type.Integer({ description: 'Сколько ответов отброшено локальной проверкой' }),
    changeSet: StoredChangeSet,
  },
  { $id: 'AiSuggestionSummary' },
);

export const AiSuggestionStatus = Type.Object(
  { available: Type.Boolean(), pending: Type.Integer() },
  { $id: 'AiSuggestionStatus' },
);

export const EXPLANATION_SCHEMAS = [
  AiSuggestionSummary,
  AiSuggestionStatus,
  ExplanationScope,
  ExplanationRequest,
  ExplanationPreviewResponse,
  ExplanationList,
];
