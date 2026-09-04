# План: базовый технический минимум Project Launch Copilot

Статус: **утверждённый рабочий план** (не core-контракт — детали реализации могут уточняться по ходу работы, в отличие от `docs/core/PROJECT.md`).

Подробный разбор каждого пункта (вход/выход/контракты функций) — в [`plan/`](plan/README.md).

## Контекст

Кейс требует Widget Script в MWS Tables, автоматизирующий путь входящей заявки от «сырой записи» до подготовленного к запуску проекта: нормализация данных, поиск дублей, сопоставление со справочниками, классификация типа/приоритета, базовая проверка бюджета/сроков, создание задач по шаблону и назначение исполнителей — всё с preview/confirm и идемпотентными повторными запусками.

Этот план сознательно **не включает**:
- «углублённую» интеллектуальную функцию из п.5 условия кейса (классификация здесь — простая правило-ориентированная функция, нужна в любом случае как базовая по п.4 условия, но не «углубляется»);
- какую-либо интеграцию с внешним LLM API (даже опциональную);
- продвинутое распределение исполнителей (нагрузка/навыки/отсутствия/SLA) — только round-robin;
- статистические/ML-модели аномалий — только детерминированные проверочные правила.

Это отдельный будущий шаг, не часть этого плана. Существующие проекты/задачи (`record_type=EXISTING_TASK`, `parent_project_raw`) учитываются **минимально**: только чтобы `parent_project_raw` мог сматчиться на уже существующий проект и не породить дубль.

**Доступа к раздатому пространству MWS Tables пока нет.** Вся разработка и тестирование логики ведётся локально через mock-SDK; всё, что требует реального пространства, вынесено в отдельные milestone'ы (A–D), не блокирующие старт.

## Важная оговорка по платформе

Публичная документация AITable (на которой основана MWS Tables) частично противоречива и не проверена в предоставленном пространстве:
- `space.getActiveDatasheetAsync()` встречается в примере кода, но не задокументирован в описании класса `Space` (там есть только `getDatasheetAsync(id)`);
- формат значения ячейки Link-полей расходится между источниками (массив id-строк vs массив объектов `{id}`);
- нет документированного постоянного хранилища конфигурации для Script-виджета;
- лимиты `getRecordsAsync`/`updateRecordsAsync`/`createRecordsAsync` по размеру батча не задокументированы.

Как только появится доступ — Milestone A выполняется первым из всего, что трогает реальную MWS. До этого момента все допущения ниже — рабочая гипотеза, зафиксированная в mock-SDK, а не факт.

## Данные (`data/raw/dev-sample.csv`)

Один плоский файл, 82 столбца, 10 000 строк — реально 5 разных сущностей, различаемых колонкой `record_type`:

| record_type | строк | смысл |
|---|---|---|
| `APPLICATION` | 6800 | входящие заявки |
| `COMPANY_REFERENCE` | 1400 | справочник компаний |
| `EMPLOYEE` | 240 | справочник сотрудников |
| `TASK_TEMPLATE` | 360 | строки шаблонов задач (~12 типов × ~30 задач) |
| `EXISTING_TASK` | 1200 | существующие задачи существующих проектов (`task_project_id` вида `PRJ-EX-DEV-*`) |

**`dev-sample.csv` — иллюстрация классов «грязноты», а не спецификация конкретных значений.** У организаторов есть скрытый тестовый набор со своей эталонной разметкой (см. `data/AGENTS.md`). Поэтому нормализация/матчинг/классификация разбирают **классы форматов** (регэкспы на «дд.мм.гггг», «число + тыс./млн», телефон и т.п.) и берут справочные словари из общего доменного знания или из самих справочников в рантайме — никогда как список, зафиксированный по факту просмотра CSV. Не покрытое правилом уходит в ручной разбор, а не угадывается эвристикой под пример.

## Целевая структура данных в MWS Tables

8 датасетов, связи только через Link-поля + Lookup для отображения:

1. **Компании** — `legal_name`, `short_name`, `inn`, `kpp`, `email`, `phone`, `city`, `aliases`, `industry`, `segment`, `active`.
2. **Сотрудники** — `fio`, `email`, `phone`, `role`, `specializations`, `skills`, `capacity_hours_week`, `current_load_pct`, `absent_from/to`, `active`.
3. **Шаблоны задач** — `project_type`, `task_code`, `task_name`, `stage`, `order`, `duration_hours`, `required_role`, `required_skills`, `predecessor_code`, `default_priority`, `mandatory`.
4. **Проекты** — `project_name`, `project_type`, `priority`, `budget`, `currency`, `planned_start/end`, `status`, **Компания** (Two-way Link).
5. **Задачи** — `task_name`, `status`, `priority`, **Проект** (Two-way Link), **Исполнитель** (Two-way Link), `estimated_hours`, `spent_hours`, `due_date`, `required_role`, `required_skills`, `source_key`, **Блокируется** (One-way Link → Задачи).
6. **Заявки** (главная рабочая таблица) — все `*_raw` поля без изменений + `normalized_*`, **Компания**/**Проект** (Two-way Link), **Дубль заявки** (One-way self-link), `duplicate_group_id`, `suggested_project_type`, `suggested_priority`, `match_confidence`, `match_reason`, `anomaly_flags`, `anomaly_notes`, `readiness_status`, `_processed_hash`, `_last_run_id`.
7. **⚙️ Copilot Config** — datasheet ID всех таблиц, JSON карта полей, пороги уверенности, указатели round-robin.
8. **Copilot Runs** — лог прогонов (счётчики, timestamp, scope) для доказательства идемпотентности.

## Preview/confirm в рамках реального Script API

Только `input.textAsync/viewAsync/fieldAsync/recordAsync` и `output.text/markdown/table/clear` — без чекбоксов. Механика: `output.table()` печатает пронумерованный список действий → `input.textAsync("all/none/1,3,5-8")` → батч `updateRecordsAsync`/`createRecordsAsync`.

## Конфигурация без хардкода ID

Мастер настройки (один раз): ID таблиц через `input.textAsync` + `space.getDatasheetAsync`, поля через `input.fieldAsync`. Результат — JSON в записи **⚙️ Copilot Config**, ID Config-таблицы кэшируется в `localStorage`.

## Локальная разработка без доступа к MWS

`widget/main.js` принимает `{space, input, output}` параметром — не зависит от глобальных переменных. Локальный харнесс `solution/devtools/` (`seed.js`, `mock-sdk.js`, `run-local.js`) прогоняет весь сценарий на `data/raw/dev-sample.csv` без единого обращения к MWS, с визуализацией в терминале или браузере (`--html`).

## Milestones

Подробности каждого — по ссылкам.

Локально, без MWS:
1. [Локальный mock-SDK и seed](plan/milestone-01-mock-sdk-seed.md)
2. [Мастер конфигурации](plan/milestone-02-config-wizard.md)
3. [Нормализация](plan/milestone-03-normalize.md)
4. [Движок preview/apply](plan/milestone-04-preview-engine.md)
5. [Дедуп и сопоставление со справочниками](plan/milestone-05-match-dedup.md)
6. [Классификация типа и приоритета](plan/milestone-06-classify.md)
7. [Базовые проверки аномалий](plan/milestone-07-anomalies.md)
8. [Генерация задач по шаблону](plan/milestone-08-tasks.md)
9. [Round-robin назначение](plan/milestone-09-assign.md)
10. [Запуск проекта и отчёт](plan/milestone-10-launch-report.md)
11. [Сборка и юнит-тесты](plan/milestone-11-build-tests.md)

Когда появится доступ к реальной MWS:
- [Milestone A — проверка платформы](plan/milestone-A-platform-verification.md)
- [Milestone B — обновить mock-SDK по факту](plan/milestone-B-mock-sdk-update.md)
- [Milestone C — таблицы и разовый импорт](plan/milestone-C-real-tables-import.md)
- [Milestone D — финальная валидация](plan/milestone-D-final-validation.md)

## Файловая структура `solution/`

```
solution/
  PLAN.md                    # этот файл
  plan/                       # детальный разбор каждого milestone (вход/выход)
  docs/
    PLATFORM-NOTES.md        # факты о реальном API из Milestone A
    INSTALL.md                # установка/настройка без знания JS
    ALGORITHMS.md             # описание алгоритмов
    TEST-RESULTS.md           # результаты прогонов
  devtools/
    seed.js mock-sdk.js run-local.js viewer.html
  src/
    setup/seed.js
    lib/
      config.js normalize.js match.js classify.js anomalies.js
      tasks.js assign.js launch.js report.js util.js
    widget/main.js
  build/build.js
  dist/widget.bundle.js
  tests/
    fixtures/*.json
    *.test.js
```

## Проверка результата

**Доступно уже сейчас (без MWS):**
1. `node --test solution/tests` — все юнит-тесты зелёные.
2. `node solution/build/build.js` — собирает `dist/widget.bundle.js` без ошибок.
3. `node solution/devtools/run-local.js` — весь сценарий целиком на `local-seed.json`, визуально ASCII/`--html`.
4. Идемпотентность: два подряд запуска `run-local.js` на одном seed → второй запуск: 0 новых действий/связей/задач.

**Когда появится доступ к MWS:**
5. Milestone A → B (проверка платформы, поправка mock-SDK).
6. Milestone C (реальные датасеты + импорт, сверка количества записей).
7. Milestone D (прогон на 50–100, затем на всех 6800; повторный прогон подтверждает идемпотентность).
8. Обновить `STATUS.md`/`research/product-materials-interim.md` по факту реализации.

## Явно вне скоупа

- «Углублённая» интеллектуальная функция из п.5 условия кейса — следующий отдельный план.
- Любая интеграция с LLM/внешним API.
- Продвинутое (не round-robin) назначение исполнителей.
- Полноценное управление существующими проектами/задачами.
- Промышленная нагрузка, авторизация, отдельный backend.
