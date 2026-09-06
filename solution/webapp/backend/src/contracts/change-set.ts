import { Type, type Static } from '@sinclair/typebox';

/**
 * DTO API отделены от доменных сущностей: домен ничего не знает про HTTP,
 * а схема здесь одновременно валидирует запрос, описывает OpenAPI и даёт типы.
 */

export const SourceRecord = Type.Object(
  {
    id: Type.String({ minLength: 1, description: 'Идентификатор записи в источнике' }),
    values: Type.Record(Type.String(), Type.Union([Type.String(), Type.Null()]), {
      description: 'Значения полей записи как есть, без нормализации',
    }),
  },
  { $id: 'SourceRecord' },
);

export const IssueSeverity = Type.Union(
  [Type.Literal('error'), Type.Literal('warning'), Type.Literal('info')],
  { $id: 'IssueSeverity' },
);

export const RecordIssue = Type.Object(
  {
    recordId: Type.String(),
    field: Type.String(),
    code: Type.String({ examples: ['IMPOSSIBLE_DATE'] }),
    severity: Type.Ref(IssueSeverity),
    message: Type.String(),
  },
  { $id: 'RecordIssue' },
);

export const Confidence = Type.Union(
  [Type.Literal('high'), Type.Literal('medium'), Type.Literal('low')],
  {
    $id: 'Confidence',
    description:
      'Уровень уверенности сопоставления, а не вероятность: выводится из состава совпавших признаков',
  },
);

export const ChangeAction = Type.Object(
  {
    id: Type.String({ description: 'Детерминированный id: <recordId>::<ruleCode>' }),
    kind: Type.Union([Type.Literal('normalize'), Type.Literal('match'), Type.Literal('duplicate')]),
    recordId: Type.String(),
    field: Type.String(),
    ruleCode: Type.String(),
    ruleName: Type.String(),
    reason: Type.String(),
    group: Type.String(),
    before: Type.Union([Type.String(), Type.Null()]),
    after: Type.Union([Type.String(), Type.Null()]),
    confidence: Type.Optional(Type.Ref(Confidence)),
    evidence: Type.Optional(
      Type.Array(Type.String(), { description: 'Признаки, по которым найдено совпадение' }),
    ),
  },
  { $id: 'ChangeAction' },
);

export const ChangeSetSummary = Type.Object(
  {
    records: Type.Integer(),
    actions: Type.Integer(),
    normalizations: Type.Integer({ description: 'Исправления формата значений' }),
    matches: Type.Integer({ description: 'Предложенные связи со справочником' }),
    duplicates: Type.Integer({ description: 'Заявки, похожие на уже существующие' }),
    attention: Type.Integer({ description: 'Замечания и предупреждения' }),
    blocking: Type.Integer({ description: 'Ошибки, по которым изменение не предлагается' }),
  },
  { $id: 'ChangeSetSummary' },
);

export const ChangeSet = Type.Object(
  {
    id: Type.String(),
    sourceFingerprint: Type.String({
      description: 'Отпечаток исходных данных; возвращается обратно при применении',
    }),
    createdAt: Type.String({ format: 'date-time' }),
    actions: Type.Array(Type.Ref(ChangeAction)),
    issues: Type.Array(Type.Ref(RecordIssue)),
    summary: Type.Ref(ChangeSetSummary),
  },
  { $id: 'ChangeSet' },
);

export const CreateChangeSetRequest = Type.Object(
  {
    records: Type.Array(Type.Ref(SourceRecord), { minItems: 1 }),
    parentId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { $id: 'CreateChangeSetRequest' },
);

export const ApplyChangeSetRequest = Type.Object(
  {
    records: Type.Array(Type.Ref(SourceRecord), { minItems: 1 }),
    sourceFingerprint: Type.String({
      minLength: 1,
      description: 'Отпечаток из набора изменений: защищает от применения поверх устаревших данных',
    }),
    actionIds: Type.Array(Type.String(), {
      description: 'Только подтверждённые пользователем действия',
    }),
  },
  { $id: 'ApplyChangeSetRequest' },
);

export const SkippedAction = Type.Object(
  { actionId: Type.String(), reason: Type.Literal('already-applied') },
  { $id: 'SkippedAction' },
);

export const ApplyChangeSetResponse = Type.Object(
  {
    records: Type.Array(Type.Ref(SourceRecord)),
    applied: Type.Array(Type.Ref(ChangeAction)),
    skipped: Type.Array(Type.Ref(SkippedAction)),
  },
  { $id: 'ApplyChangeSetResponse' },
);

export const ChangeSetStatus = Type.Union(
  [
    Type.Literal('draft'),
    Type.Literal('published'),
    Type.Literal('superseded'),
    Type.Literal('discarded'),
  ],
  { $id: 'ChangeSetStatus' },
);

export const ActionDecision = Type.Union(
  [Type.Literal('pending'), Type.Literal('accepted'), Type.Literal('rejected')],
  { $id: 'ActionDecision' },
);

export const ActionResult = Type.Union(
  [
    Type.Literal('pending'),
    Type.Literal('applied'),
    Type.Literal('skipped'),
    Type.Literal('conflict'),
    Type.Literal('failed'),
  ],
  { $id: 'ActionResult' },
);

export const VersionedChangeAction = Type.Intersect(
  [
    Type.Ref(ChangeAction),
    Type.Object({
      decision: Type.Ref(ActionDecision),
      editedAfter: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      result: Type.Ref(ActionResult),
      resultMessage: Type.Optional(Type.String()),
      executedAt: Type.Optional(Type.String({ format: 'date-time' })),
    }),
  ],
);

export const StoredChangeSet = Type.Object(
  {
    id: Type.String(),
    sequence: Type.Integer({ minimum: 1 }),
    status: Type.Ref(ChangeSetStatus),
    sourceFingerprint: Type.String(),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
    publishedAt: Type.Optional(Type.String({ format: 'date-time' })),
    parentId: Type.Optional(Type.String()),
    rollbackOfId: Type.Optional(Type.String()),
    actions: Type.Array(VersionedChangeAction),
    issues: Type.Array(Type.Ref(RecordIssue)),
    summary: Type.Ref(ChangeSetSummary),
  },
);

export const ChangeSetList = Type.Object(
  { items: Type.Array(StoredChangeSet) },
  { $id: 'ChangeSetList' },
);

export const ChangeSetIdParams = Type.Object(
  { id: Type.String({ minLength: 1 }) },
  { $id: 'ChangeSetIdParams' },
);

export const ChangeSetListQuery = Type.Object(
  { status: Type.Optional(Type.Ref(ChangeSetStatus)) },
  { $id: 'ChangeSetListQuery' },
);

export const ChangeSetDiffQuery = Type.Object(
  { against: Type.String({ minLength: 1 }) },
  { $id: 'ChangeSetDiffQuery' },
);

export const ActionDecisionUpdate = Type.Object(
  {
    actionId: Type.String({ minLength: 1 }),
    decision: Type.Ref(ActionDecision),
    editedAfter: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { $id: 'ActionDecisionUpdate' },
);

export const UpdateDecisionsRequest = Type.Object(
  { actions: Type.Array(Type.Ref(ActionDecisionUpdate), { minItems: 1 }) },
  { $id: 'UpdateDecisionsRequest' },
);

export const PublishChangeSetRequest = Type.Object(
  { records: Type.Array(Type.Ref(SourceRecord), { minItems: 1 }) },
  { $id: 'PublishChangeSetRequest' },
);

export const PublishChangeSetResponse = Type.Object(
  {
    changeSet: StoredChangeSet,
    records: Type.Array(Type.Ref(SourceRecord)),
    idempotent: Type.Boolean(),
  },
  { $id: 'PublishChangeSetResponse' },
);

export const ChangeSetEvent = Type.Object(
  {
    id: Type.Integer(),
    changeSetId: Type.String(),
    type: Type.String(),
    createdAt: Type.String({ format: 'date-time' }),
    payload: Type.Record(Type.String(), Type.Unknown()),
  },
);

export const ChangeSetHistory = Type.Object(
  { items: Type.Array(ChangeSetEvent) },
  { $id: 'ChangeSetHistory' },
);

export const ActionDiff = Type.Object(
  {
    key: Type.String(),
    before: Type.Optional(VersionedChangeAction),
    after: Type.Optional(VersionedChangeAction),
  },
);

export const ChangeSetDiff = Type.Object(
  {
    baseId: Type.String(),
    targetId: Type.String(),
    added: Type.Array(ActionDiff),
    removed: Type.Array(ActionDiff),
    changed: Type.Array(ActionDiff),
  },
  { $id: 'ChangeSetDiff' },
);

export const CHANGE_SET_SCHEMAS = [
  SourceRecord,
  IssueSeverity,
  Confidence,
  RecordIssue,
  ChangeAction,
  ChangeSetSummary,
  ChangeSet,
  CreateChangeSetRequest,
  ApplyChangeSetRequest,
  SkippedAction,
  ApplyChangeSetResponse,
  ChangeSetStatus,
  ActionDecision,
  ActionResult,
  ChangeSetList,
  ChangeSetIdParams,
  ChangeSetListQuery,
  ChangeSetDiffQuery,
  ActionDecisionUpdate,
  UpdateDecisionsRequest,
  PublishChangeSetRequest,
  PublishChangeSetResponse,
  ChangeSetHistory,
  ChangeSetDiff,
];

export type SourceRecordDto = Static<typeof SourceRecord>;
