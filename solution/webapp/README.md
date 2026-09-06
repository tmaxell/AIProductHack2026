# Веб-приложение Project Launch Copilot

Самостоятельное веб-приложение: фронтенд в контейнере с nginx и backend на
Node.js/Fastify. Разрабатывается **параллельно** и **независимо** от Widget
Script для реальных MWS Tables.

> **Граница треков.** Всё, что относится к встраиваемому виджету, живёт в
> `solution/` вне этого каталога (`solution/src`, `build`, `devtools`, `dist`,
> `plan`, `docs`). Веб-приложение его не импортирует, не собирает и не изменяет.
> Обратное тоже верно. Подробнее — [`../README.md`](../README.md).

## Состав

```text
solution/webapp/
├── docker-compose.yml           # прод-подобный стек
├── docker-compose.override.yml  # режим разработки, подхватывается автоматически
├── Makefile                     # частые команды
├── .env.example                 # переменные окружения
├── backend/                     # API на Fastify + TypeScript
└── frontend/                    # статика и nginx
    ├── nginx.conf               # отдаёт статику и проксирует /api/ в backend
    └── public/                  # текущий фронтенд
```

Единый origin: страница и API отдаются с одного порта, поэтому CORS в штатной
конфигурации не нужен.

Сейчас это переходная архитектура после объединения PR #6: backend содержит
безопасный Change Set API, строгую нормализацию и персистентные версии. UI
создаёт draft, сохраняет решения, публикует и готовит rollback только через
backend. Расширенные подсказки frontend (сотрудники, классификация и план задач)
временно вычисляются локально в `engine.js`/`launch.js`, но не являются
источником сохраняемых или публикуемых действий.

## Запуск

```bash
cp .env.example .env      # необязательно: у всех значений есть дефолты
make up                   # режим разработки: hot reload бекенда и статики
```

- приложение — <http://127.0.0.1:8080>
- API — <http://127.0.0.1:8080/api/v1/health>
- документация API (Swagger UI) — <http://127.0.0.1:8080/api/v1/docs>

Прод-подобный запуск, без bind mount, hot reload и открытой документации:

```bash
make prod
```

Остальные команды — `make help`.

## Разработка бекенда без Docker

```bash
make install    # npm ci в backend/
make dev        # tsx watch на http://127.0.0.1:8000
make check      # lint + typecheck + тесты
```

## Что уже есть и чего ещё нет

Реализовано:

Backend:

- `POST /api/v1/change-sets` создаёт новую сохранённую draft-версию; решения,
  результаты действий и append-only события хранятся в SQLite;
- история, diff версий, публикация, `draft → published → superseded/discarded`
  и компенсирующий rollback доступны через versioned Change Set API;
- необязательный Groq-слой объясняет выбранные действия только после отдельного
  preview и явного согласия; маскированный payload, модель, prompt version и
  результат/ошибка сохраняются в истории версии;
- публикация использует существующие selective apply и `sourceFingerprint`,
  блокирует конфликт и идемпотентно возвращает сохранённый результат;
- детерминированная нормализация в доменном слое, без зависимости от HTTP;
- сопоставление заявки со справочником компаний по ИНН, email, телефону,
  названию и алиасам, с уровнем уверенности и перечнем совпавших признаков;
  неоднозначные и неактивные совпадения не применяются автоматически;
- поиск возможных дублей по всей таблице заявок: совпадение названия проекта
  дополняется признаком компании, исходные записи не удаляются;
- `GET /api/v1/health`, единый формат ошибок, structured-логи, graceful shutdown;
- конфигурация только из переменных окружения с проверкой на старте;
- forward-only миграции SQLite и Docker named volume `change-set-storage`;
- lint, проверка типов и 135 тестов бекенда.

Frontend-демонстрация:

- выбор области и полей проверки;
- список версий, diff, выборочное подтверждение, публикация и rollback-preview;
- disclosure-preview и сохранённые результаты AI-объяснения;
- локальные matching сотрудников, классификация и preview плана задач с
  назначениями и итоговой сводкой.

Ещё не сделано:

- локальные matching сотрудников, классификация и план задач ещё не перенесены
  в Change Set API и остаются только неподтверждаемыми подсказками UI;
- нет реальных связей Link/Lookup и записей Project/Task: frontend показывает
  только план в памяти;
- у фронтенда нет шага сборки — статика отдаётся как есть;
- нет CI; SQLite рассчитан на один writable backend instance.

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `FRONTEND_PORT` | `8080` | Порт приложения на хосте |
| `BACKEND_PORT` | `8000` | Порт бекенда на хосте, пробрасывается только в dev |
| `APP_ENV` | `production` | `development` / `production` / `test` |
| `APP_LOG_LEVEL` | `info` | Уровень логов Fastify |
| `APP_EXPOSE_DOCS` | `false` | Отдавать ли Swagger UI |
| `APP_CORS_ORIGINS` | пусто | Список origin через запятую; пусто — CORS выключен |
| `APP_DATASET_PATH` | `/app/data/raw/dev-sample.csv` | Набор данных со справочником компаний |
| `APP_STORAGE_PATH` | `./var/change-sets.sqlite` | SQLite-файл версий; Compose переопределяет на `/app/storage/change-sets.sqlite` |
| `GROQ_API_KEY` | пусто | Включает AI-объяснение на backend; не передаётся во frontend |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint провайдера |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Модель с поддержкой выбранного structured output |
| `GROQ_STRUCTURED_OUTPUT` | `strict` | `strict`, `best-effort` или `json-object` |
| `GROQ_TIMEOUT_MS` | `15000` | Timeout одной попытки |
| `GROQ_MAX_RETRIES` | `2` | Повторы для timeout, сети, `429` и `5xx` |
| `GROQ_MAX_COMPLETION_TOKENS` | `1200` | Верхний предел ответа |

Архитектурное решение, модель данных и правила rollback описаны в
[`docs/adr/0001-persistent-change-set-versions.md`](docs/adr/0001-persistent-change-set-versions.md).
Граница AI-слоя и правила раскрытия данных — в
[`docs/adr/0002-groq-change-set-explanations.md`](docs/adr/0002-groq-change-set-explanations.md).

Секреты в репозиторий не коммитятся: `.env` в `.gitignore`, в примере значений
секретов нет.
