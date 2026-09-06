# Backend веб-приложения

Fastify 5 + TypeScript, Node.js 22+. Версии Change Set хранятся в локальном
SQLite-файле. Необязательный Groq-провайдер включается только backend-ключом;
без него детерминированный сценарий работает полностью.

## Слои

```text
src/
├── application/  # сценарии версий, публикации и rollback
├── index.ts        # точка входа: старт сервера и graceful shutdown
├── app.ts          # buildApp(): плагины, схемы, маршруты, обработка ошибок
├── config.ts       # чтение и валидация переменных окружения
├── contracts/      # TypeBox-схемы = одновременно валидация, OpenAPI и типы
├── routes/v1/      # HTTP-слой: только разбор запроса и вызов домена
├── infrastructure/ # CSV, SQLite-репозиторий и миграции
└── domain/         # чистая логика без HTTP, см. domain/README.md
```

Правило: `routes/` не содержит бизнес-логики, `domain/` не знает ни про Fastify,
ни про файловую систему — источник справочника подменяется целиком в
`infrastructure/`, не задевая правила сопоставления.
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
| `GET` | `/api/v1/health` | состояние сервиса, размеры справочника и корпуса, доступность AI |
| `POST` | `/api/v1/change-sets` | draft по переданным записям |
| `GET` | `/api/v1/change-sets` | история версий |
| `GET` | `/api/v1/change-sets/:id` | сохранённая версия |
| `GET` | `/api/v1/change-sets/:id/actions` | страница действий с фильтрами и агрегатами |
| `PATCH` | `/api/v1/change-sets/:id/decisions` | решения пользователя по действиям |
| `GET` | `/api/v1/change-sets/:id/diff` | сравнение двух версий |
| `GET` | `/api/v1/change-sets/:id/history` | append-only история событий |
| `POST` | `/api/v1/change-sets/:id/publish` | публикация подтверждённых действий |
| `POST` | `/api/v1/change-sets/:id/rollback` | компенсирующий rollback-draft |
| `POST` | `/api/v1/change-sets/:id/discard` | отбросить draft, история сохраняется |
| `GET` | `/api/v1/dataset-snapshots/current` | метаданные выгрузки |
| `GET` | `/api/v1/dataset-snapshots/current/records` | чтение выгрузки страницами |
| `POST` | `/api/v1/dataset-snapshots/current/change-sets` | draft по выгрузке, `limit` ограничивает партию |
| `POST` | `/api/v1/change-sets/:id/publish-current` | публикация относительно snapshot backend |
| `POST` | `/api/v1/change-sets/:id/rollback-current` | rollback относительно snapshot backend |
| `POST` | `/api/v1/change-sets/:id/explanation-preview` | что именно уйдёт в Groq |
| `POST` | `/api/v1/change-sets/:id/explanations` | явный запрос объяснения |
| `GET` | `/api/v1/change-sets/:id/explanations` | история попыток объяснения |
| `GET` | `/api/v1/change-sets/:id/ai-suggestions` | сколько спорных значений ждёт разбора |
| `POST` | `/api/v1/change-sets/:id/ai-suggestions` | разбор спорных значений моделью |
| `GET` | `/api/v1/docs` | Swagger UI, только при `APP_EXPOSE_DOCS=true` |

Ничего не изменяет: создание draft, чтение выгрузки, `explanation-preview`
и `GET /ai-suggestions`.

Наружу обращаются только `POST /explanations` и `POST /ai-suggestions` — оба по
явному действию пользователя.

`publish` и `apply` требуют `sourceFingerprint` из черновика: если исходные
данные изменились после анализа, операция отклоняется `409`, а не выполняется
поверх устаревшего набора. Действие вне набора — `422`.

## Виды действий

| Вид | Откуда берётся | Есть ли уверенность |
|---|---|---|
| `normalize` | детерминированное правило из `domain/rules.ts` | нет |
| `match` | сопоставление со справочником компаний | да |
| `duplicate` | похожая заявка в корпусе | да |
| `ai` | разбор спорного значения моделью | да |

Все четыре подтверждаются одинаково и попадают в данные только при публикации.

## Справочник компаний

Источник — демонстрационный набор `data/raw/dev-sample.csv`, путь задаётся
`APP_DATASET_PATH` и монтируется в контейнер read-only. Загружаются только
строки `record_type = COMPANY_REFERENCE`.

Если файл недоступен, сервис поднимается и работает: сопоставление просто не
предлагается, а нормализация продолжает работать. Сколько записей загружено —
видно в `GET /api/v1/health`.
