import { Type } from '@sinclair/typebox';

/** Единый формат ошибки для всех эндпоинтов. */
export const ErrorResponse = Type.Object(
  {
    statusCode: Type.Integer(),
    error: Type.String(),
    message: Type.String(),
  },
  { $id: 'ErrorResponse', description: 'Ошибка API' },
);

export const API_PREFIX = '/api/v1';
