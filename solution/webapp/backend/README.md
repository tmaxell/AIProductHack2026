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
| `GET` | `/api/v1/health` | состояние сервиса, используется healthcheck'ом |
| `POST` | `/api/v1/change-sets` | проанализировать записи, вернуть черновик набора изменений |
| `GET` | `/api/v1/change-sets` | список сохранённых версий |
| `GET` | `/api/v1/change-sets/:id` | версия с решениями и результатами действий |
| `PATCH` | `/api/v1/change-sets/:id/decisions` | сохранить решения и отредактированные target-значения draft |
| `GET` | `/api/v1/change-sets/:id/history` | append-only события версии |
| `GET` | `/api/v1/change-sets/:id/diff?against=…` | сравнить две версии |
| `POST` | `/api/v1/change-sets/:id/publish` | опубликовать accepted-действия |
| `POST` | `/api/v1/change-sets/:id/rollback` | создать компенсирующий rollback-draft |
| `POST` | `/api/v1/change-sets/:id/discard` | отбросить draft без удаления истории |
| `POST` | `/api/v1/change-sets/:id/explanation-preview` | показать точный маскированный payload без внешнего вызова |
| `POST` | `/api/v1/change-sets/:id/explanations` | после явного согласия получить и сохранить объяснение Groq |
| `GET` | `/api/v1/change-sets/:id/explanations` | история результатов и ошибок объяснения |
| `POST` | `/api/v1/change-sets/apply` | deprecated stateless selective apply для совместимости |
| `GET` | `/api/v1/docs` | Swagger UI, только при `APP_EXPOSE_DOCS=true` |

`POST /change-sets` не меняет исходные записи, сохраняет draft и возвращает три вида действий:
исправления формата (`kind: normalize`) и предложенные связи со справочником
компаний (`kind: match`, с уровнем уверенности и перечнем совпавших признаков),
а также ссылки на возможные дубли (`kind: duplicate`).

Публикация применяет только действия с решением `accepted` и проверяет
сохранённый `sourceFingerprint`: если данные изменились после анализа, операция
отклоняется `409`, а конфликт сохраняется в истории. Повторная публикация
возвращает сохранённый результат. Опубликованная версия неизменяема; rollback
создаёт новый draft с обратными действиями и тоже требует подтверждения.

SQLite открывается по `APP_STORAGE_PATH`. На старте backend транзакционно
выполняет пронумерованные forward-only миграции. В Docker каталог смонтирован в
named volume `change-set-storage`; `docker compose down -v` удаляет историю.

## AI-объяснение

Groq получает только выбранные действия сохранённой версии. Полные исходные
строки не отправляются, record/action id заменяются псевдонимами, email,
телефоны и ФИО маскируются. UI сначала вызывает локальный preview и показывает
поля и значения, затем требует отдельное подтверждение внешней отправки.

Провайдер не получает tools и не может менять решения, публиковать или делать
rollback. Ответ валидируется по закрытой JSON Schema и сохраняется с моделью и
`change-set-explanation-v1`; ошибки тоже сохраняются, но не меняют Change Set.
Endpoint, модель, structured-output mode, timeout, retry и лимит ответа задаются
переменными `GROQ_*`, перечисленными в `.env.example`.

`GROQ_API_KEY` читается только из окружения backend. Он не входит в DTO,
structured logs или SQLite и не копируется в Docker image: `.env*` исключены
как общим `.gitignore`, так и `.dockerignore` backend build context.

## Справочник компаний

Источник — демонстрационный набор `data/raw/dev-sample.csv`, путь задаётся
`APP_DATASET_PATH` и монтируется в контейнер read-only. Загружаются только
строки `record_type = COMPANY_REFERENCE`.

Если файл недоступен, сервис поднимается и работает: сопоставление просто не
предлагается, а нормализация продолжает работать. Сколько записей загружено —
видно в `GET /api/v1/health`.
