import { Type } from '@sinclair/typebox';

export const HealthResponse = Type.Object(
  {
    status: Type.Literal('ok'),
    version: Type.String({ description: 'Версия сервиса из package.json' }),
    env: Type.String(),
    uptimeSeconds: Type.Number(),
    referenceCompanies: Type.Integer({
      description: 'Сколько записей справочника компаний загружено; 0 — сопоставление недоступно',
    }),
  },
  { $id: 'HealthResponse' },
);
