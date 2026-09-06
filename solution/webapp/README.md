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

- `GET /api/v1/health` — состояние сервиса, используется healthcheck'ом Docker;
- контракт `POST /api/v1/validation/runs` в OpenAPI, валидация тела запроса;
- единый формат ошибок, structured-логи, graceful shutdown;
- конфигурация только из переменных окружения с проверкой на старте;
- lint, проверка типов и тесты бекенда.

Ещё не сделано:

- **логика проверки заявок пока целиком на фронтенде** (`frontend/public/widget-script.js`);
  `POST /api/v1/validation/runs` до переноса отвечает `501 Not Implemented`;
- у фронтенда нет шага сборки — статика отдаётся как есть;
- нет базы данных и хранения: состояние живёт в памяти страницы;
- нет CI.

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `FRONTEND_PORT` | `8080` | Порт приложения на хосте |
| `BACKEND_PORT` | `8000` | Порт бекенда на хосте, пробрасывается только в dev |
| `APP_ENV` | `production` | `development` / `production` / `test` |
| `APP_LOG_LEVEL` | `info` | Уровень логов Fastify |
| `APP_EXPOSE_DOCS` | `false` | Отдавать ли Swagger UI |
| `APP_CORS_ORIGINS` | пусто | Список origin через запятую; пусто — CORS выключен |

Секреты в репозиторий не коммитятся: `.env` в `.gitignore`, в примере значений
секретов нет.
