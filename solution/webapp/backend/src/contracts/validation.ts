import { Type, type Static } from '@sinclair/typebox';

/**
 * Контракт повторяет поведение, которое уже реализовано на фронтенде
 * (widget-script.js: validateRow → issues + changes). Новые продуктовые
 * требования сюда не добавляются: сначала перенос, потом развитие.
 */

export const IssueSeverity = Type.Union(
  [Type.Literal('error'), Type.Literal('warning'), Type.Literal('info')],
  { $id: 'IssueSeverity' },
);

export const Issue = Type.Object(
  {
    code: Type.String({ examples: ['LATIN_CITY'] }),
    severity: Type.Ref(IssueSeverity),
    message: Type.String(),
    field: Type.Optional(Type.String()),
  },
  { $id: 'Issue' },
);

export const FieldChange = Type.Object(
  {
    field: Type.String({ examples: ['company_email'] }),
    before: Type.Union([Type.String(), Type.Null()]),
    after: Type.Union([Type.String(), Type.Null()]),
    rule: Type.String({ description: 'Правило, предложившее изменение' }),
  },
  { $id: 'FieldChange' },
);

export const RecordResult = Type.Object(
  {
    recordId: Type.String(),
    issues: Type.Array(Type.Ref(Issue)),
    changes: Type.Array(Type.Ref(FieldChange)),
  },
  { $id: 'RecordResult' },
);

export const ValidationSummary = Type.Object(
  {
    records: Type.Integer({ description: 'Сколько записей проверено' }),
    changes: Type.Integer({ description: 'Безопасные исправления' }),
    attention: Type.Integer({ description: 'Замечания и предупреждения' }),
    blocking: Type.Integer({ description: 'Блокирующие ошибки' }),
  },
  { $id: 'ValidationSummary' },
);

export const ValidationRunRequest = Type.Object(
  {
    records: Type.Array(Type.Record(Type.String(), Type.Unknown()), {
      minItems: 1,
      description: 'Заявки в том виде, в каком их отдаёт представление',
    }),
  },
  { $id: 'ValidationRunRequest' },
);

export const ValidationRunResponse = Type.Object(
  {
    summary: Type.Ref(ValidationSummary),
    results: Type.Array(Type.Ref(RecordResult)),
  },
  { $id: 'ValidationRunResponse' },
);

export const VALIDATION_SCHEMAS = [
  IssueSeverity,
  Issue,
  FieldChange,
  RecordResult,
  ValidationSummary,
  ValidationRunRequest,
  ValidationRunResponse,
];

export type ValidationRunRequestType = Static<typeof ValidationRunRequest>;
export type ValidationRunResponseType = Static<typeof ValidationRunResponse>;
