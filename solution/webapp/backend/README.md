# Backend веб-приложения

Fastify 5 + TypeScript, Node.js 22+. Внешних сервисов и базы данных нет.

## Слои

```text
src/
├── index.ts        # точка входа: старт сервера и graceful shutdown
├── app.ts          # buildApp(): плагины, схемы, маршруты, обработка ошибок
├── config.ts       # чтение и валидация переменных окружения
├── contracts/      # TypeBox-схемы = одновременно валидация, OpenAPI и типы
├── routes/v1/      # HTTP-слой: только разбор запроса и вызов домена
└── domain/         # чистая логика без HTTP, см. domain/README.md
```

Правило: `routes/` не содержит бизнес-логики, `domain/` не знает про Fastify.
Схема описывается один раз в `contracts/` — из неё берутся и рантайм-валидация,
и OpenAPI, и статические типы.

## Команды

```bash
npm ci
npm run dev        # tsx watch, http://127.0.0.1:8000
npm test           # vitest
npm run lint       # eslint с типовыми правилами
npm run typecheck  # tsc --noEmit
npm run build      # компиляция в dist/
```

## Эндпоинты

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/v1/health` | состояние сервиса, используется healthcheck'ом |
| `POST` | `/api/v1/change-sets` | проанализировать записи, вернуть черновик набора изменений |
| `POST` | `/api/v1/change-sets/apply` | применить подтверждённые действия |
| `GET` | `/api/v1/docs` | Swagger UI, только при `APP_EXPOSE_DOCS=true` |

`POST /change-sets` ничего не изменяет. `POST /change-sets/apply` применяет
только действия из `actionIds` и требует `sourceFingerprint` из черновика:
если исходные данные изменились после анализа, операция отклоняется `409`,
а не выполняется поверх устаревшего набора. Действие вне набора — `422`.
