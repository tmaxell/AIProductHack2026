# Milestone 1 — локальный mock-SDK и seed

Статус: локально, без MWS. **Стартуем отсюда** — всё остальное зависит от этого шага.

## Зачем

Без доступа к MWS нужен способ разрабатывать и запускать всю остальную логику (Milestones 2–11) на реальных данных, полностью офлайн, и видеть результат визуально.

## Вход

- `data/raw/dev-sample.csv` — единственный источник данных, **только на чтение** (`data/AGENTS.md`: `raw/` не форматируем, не переименовываем, не правим на месте).
- Больше ничего не требуется — это первый шаг, зависимостей от других модулей нет.

## Что делает

1. `seed.js` парсит CSV (нужен корректный CSV-парсер, учитывающий многострочные quoted-поля — обычный `split('\n')` сломается на строках вида `"React\nТестирование\nUX"`), группирует строки по `record_type`, раскладывает по 5 логическим таблицам, генерирует стабильные внутренние id записей (`app_0001`, `cmp_0001`, `emp_0001`, `tpl_0001`, `tsk_0001`), собирает две пустые таблицы (`config`, `runs`) и заглушки в `projects` из уникальных `task_project_id` вида `PRJ-EX-DEV-*`, встречающихся в `EXISTING_TASK`.
2. `mock-sdk.js` реализует классы с той же формой API, что и реальный Script API (см. таблицу ниже), поверх этих данных в памяти.
3. `run-local.js` — CLI: грузит seed, поднимает mock-SDK, вызывает `run(sdk)` из `widget/main.js` (на этом этапе `main.js` ещё пустой — просто печатает диагностику).

## Выход

### `data/derived/local-seed.json`

Воспроизводимый файл (не коммитится по умолчанию, см. `data/derived/README.md`), точная форма:

```json
{
  "meta": { "sourceFile": "data/raw/dev-sample.csv", "sourceSha256": "<hash>", "generatedAt": "<ISO>" },
  "datasheets": {
    "companies":    { "id": "dst_companies",    "name": "Компании",       "fields": [{"id":"fld_inn","name":"inn","type":"SingleText"}, ...], "records": [ {"id":"cmp_0001","cells":{"fld_inn":"6012447316", ...}} ] },
    "employees":    { "id": "dst_employees",    "name": "Сотрудники",     "fields": [...], "records": [...] },
    "templates":    { "id": "dst_templates",    "name": "Шаблоны задач",  "fields": [...], "records": [...] },
    "projects":     { "id": "dst_projects",     "name": "Проекты",         "fields": [...], "records": [ /* заглушки PRJ-EX-* + пусто для новых */ ] },
    "tasks":        { "id": "dst_tasks",        "name": "Задачи",          "fields": [...], "records": [ /* сид из EXISTING_TASK */ ] },
    "applications": { "id": "dst_applications", "name": "Заявки",          "fields": [...], "records": [ /* только *_raw поля, остальное пусто */ ] },
    "config":       { "id": "dst_config",       "name": "⚙️ Copilot Config", "fields": [], "records": [] },
    "runs":         { "id": "dst_runs",         "name": "Copilot Runs",    "fields": [], "records": [] }
  }
}
```

### `solution/devtools/mock-sdk.js` — контракт классов

Формы объектов совпадают с реальным Script API (см. `plan/milestone-A-platform-verification.md` про то, что именно предстоит сверить):

| Класс/объект | Методы, которые обязаны быть реализованы |
|---|---|
| `Space` | `getDatasheetAsync(id) -> Promise<Datasheet>` |
| `Datasheet` | `getRecordsAsync(opts?) -> Promise<Record[]>`, `getRecordAsync(id)`, `createRecordAsync(valuesMap)`, `createRecordsAsync(records[])`, `updateRecordAsync(id, valuesMap)`, `updateRecordsAsync(records[])`, `deleteRecordAsync(id)`, `deleteRecordsAsync(ids[])`, `getField(key)`, `getView(key)`, `.fields`, `.views` |
| `View` | `getRecordsAsync(opts?)`, `.id`, `.name` |
| `Field` | `.id`, `.name`, `.type` |
| `Record` | `.id`, `getCellValue(fieldId)`, `getCellValueString(fieldId)` |
| `input` | `textAsync(label) -> Promise<string>`, `fieldAsync(label, datasheet) -> Promise<Field>`, `viewAsync(label, datasheet) -> Promise<View>`, `recordAsync(label, datasheet) -> Promise<Record>` |
| `output` | `text(s)`, `markdown(s)`, `table(rows)`, `clear()` |

Два режима `input.*`:
- **Скриптованный** (для тестов): конструктор `createMockSdk(seed, {answers: [...]})` — каждый вызов `input.*` берёт следующий ответ из очереди `answers`; если очередь пуста — бросает понятную ошибку (а не молча зависает).
- **Интерактивный** (для ручного локального прогона): `createMockSdk(seed, {interactive: true})` — использует `node:readline` и реально спрашивает в терминале.

`output.*` в обоих режимах либо печатает в `console.*` (ASCII-таблицы через простой форматтер колонок), либо, если передан `{captureTo: buffer}`, копит вызовы в массив для последующего рендера в `viewer.html`.

### `solution/devtools/run-local.js` — CLI

```
node solution/devtools/run-local.js [--seed <path>] [--html] [--answers <path-to-json>]
```
- без флагов — интерактивный режим на `data/derived/local-seed.json`;
- `--answers file.json` — скриптованный режим (для автоматизированных сквозных тестов, включая тест идемпотентности из Milestone 11);
- `--html` — после прогона поднимает `node:http` сервер без зависимостей и открывает `viewer.html`, который показывает получившиеся таблицы + вывод `output.*` за прогон.

## Критерий готовности

- `node solution/devtools/seed.js` регенерирует `local-seed.json` без ошибок, количество записей на таблицу точно совпадает с профилем в `data/README.md` (6800/1400/240/360/1200).
- `node solution/devtools/run-local.js` запускается и завершается без ошибок (даже если пайплайн ещё пустой — просто печатает диагностику: сколько таблиц загружено, сколько записей в каждой).
- Повторный запуск `seed.js` с тем же `dev-sample.csv` даёт идентичный (побайтово, за вычетом `generatedAt`) `local-seed.json` — воспроизводимость.

## Демонстрация (обязательный шаг перед переходом к следующему milestone)

Терминальный вывод `run-local.js`: список из 5+2 таблиц с количеством записей в каждой (сверка на глаз с `data/README.md`). Показывается пользователю как есть, без обработки.
