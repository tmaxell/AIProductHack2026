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
└── domain/         # чистая логика без HTTP — пока пусто, см. domain/README.md
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

| Метод | Путь | Состояние |
|---|---|---|
| `GET` | `/api/v1/health` | работает |
| `POST` | `/api/v1/validation/runs` | контракт объявлен, отвечает `501` |
| `GET` | `/api/v1/docs` | Swagger UI, только при `APP_EXPOSE_DOCS=true` |

`501` — намеренно: логика проверки ещё не перенесена с фронтенда. Эндпоинт
существует, чтобы контракт был зафиксирован и виден в OpenAPI, а не чтобы
создавать видимость работающей функции.
