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

export const ChangeAction = Type.Object(
  {
    id: Type.String({ description: 'Детерминированный id: <recordId>::<ruleCode>' }),
    recordId: Type.String(),
    field: Type.String(),
    ruleCode: Type.String(),
    ruleName: Type.String(),
    reason: Type.String(),
    group: Type.String(),
    before: Type.Union([Type.String(), Type.Null()]),
    after: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: 'ChangeAction' },
);

export const ChangeSetSummary = Type.Object(
  {
    records: Type.Integer(),
    actions: Type.Integer(),
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
  { records: Type.Array(Type.Ref(SourceRecord), { minItems: 1 }) },
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

export const CHANGE_SET_SCHEMAS = [
  SourceRecord,
  IssueSeverity,
  RecordIssue,
  ChangeAction,
  ChangeSetSummary,
  ChangeSet,
  CreateChangeSetRequest,
  ApplyChangeSetRequest,
  SkippedAction,
  ApplyChangeSetResponse,
];

export type SourceRecordDto = Static<typeof SourceRecord>;
