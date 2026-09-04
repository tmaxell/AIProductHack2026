# Milestone 2 — мастер конфигурации

Статус: локально, через mock-SDK (Milestone 1).

## Зачем

Виджет не должен хардкодить ID таблиц/полей — они разные в каждом пространстве MWS. Нужен одноразовый мастер настройки, который спрашивает всё через диалоги и запоминает ответы. Соответствует US1/US2 (`research/user-stories.md`).

## Выбор scope запуска (US1, часть 2 — НЕ кэшируется, спрашивается каждый раз)

US1 просит не только «сопоставить поля» (одноразово, ниже), но и «выбрать представление/набор записей» — это выбор **на каждый конкретный запуск**, отдельный от одноразового мастера:

- В начале **каждого** запуска (после того как `loadOrCreateConfig` уже вернул готовый конфиг без вопросов) — `input.viewAsync("Какое представление обрабатываем?", applicationsDatasheet)`, чтобы не гонять пайплайн по всей таблице «Заявки» без необходимости.
- Опционально следом — `input.recordAsync`/повторные вызовы для точечного выбора отдельных записей внутри представления, если пользователь не хочет обрабатывать всё представление целиком (иначе по умолчанию — все записи выбранного представления).
- Результат этого шага (`selectedView`, `selectedRecordIds`) **не сохраняется** в `CopilotConfig` — это одноразовый выбор именно этого запуска, в отличие от маппинга таблиц/полей ниже.
- Экспортируется как отдельная функция `selectScope(sdk, config) -> Promise<{ view: View, recordIds: string[] | null }>` в `solution/src/lib/config.js`, вызывается из `widget/main.js` первой, до любых normalize/match/classify-шагов.

## Одноразовый мастер настройки (US1, часть 1 + US2)

## Вход

- `sdk` из Milestone 1 (`space`, `input`, `output`).
- Ответы пользователя на диалоги: либо реального человека (интерактивный режим), либо предопределённая очередь ответов (скриптованный режим — см. Milestone 1).
- **На первом запуске — ничего заранее не известно**, конфиг создаётся с нуля.

## Что делает

1. Спрашивает (`input.textAsync`) ID датасета «⚙️ Copilot Config». Пробует прочитать в нём существующий конфиг; если пусто — идёт мастер по шагу 2.
2. Для каждой из 5 связанных таблиц (Компании/Сотрудники/Шаблоны задач/Проекты/Задачи) — `input.textAsync` на ID датасета → `space.getDatasheetAsync`.
3. Для каждой логической роли поля в каждой таблице — `input.fieldAsync(label, datasheet)` (полный список ролей — см. таблицу ниже).
4. Спрашивает пороги уверенности (или использует дефолты без вопроса, если пользователь не хочет менять — см. критерий готовности).
5. Сохраняет итог как JSON в записи Config-датасета, кэширует ID Config-датасета в `localStorage` (в mock — эмулируется файлом, см. Milestone 1).
6. Команда `"reconfigure"`, введённая вместо любого текстового ответа в основном сценарии, прерывает текущий прогон и перезапускает мастер с шага 2.

### Полный список логических ролей полей, которые мастер обязан спросить

| Таблица | Роли полей |
|---|---|
| Компании | `inn`, `email`, `phone`, `city`, `aliases`, `legalName`, `active` |
| Сотрудники | `fio`, `email`, `phone`, `role`, `skills`, `specializations`, `capacityHoursWeek`, `currentLoadPct`, `absentFrom`, `absentTo`, `active` |
| Шаблоны задач | `projectType`, `taskCode`, `taskName`, `order`, `durationHours`, `requiredRole`, `requiredSkills`, `predecessorCode`, `defaultPriority`, `mandatory` |
| Проекты | `projectName`, `projectType`, `priority`, `budget`, `currency`, `plannedStart`, `plannedEnd`, `status`, `companyLink` |
| Задачи | `taskName`, `status`, `priority`, `projectLink`, `assigneeLink`, `estimatedHours`, `dueDate`, `requiredRole`, `requiredSkills`, `sourceKey`, `blockedByLink` |
| Заявки (своя же таблица) | все `*_raw` роли + `company_link`, `employee_link`, `project_link`, `duplicate_link`, `duplicate_group_id`, `suggested_project_type`, `suggested_priority`, `match_confidence`, `match_reason`, `anomaly_flags`, `anomaly_notes`, `readiness_status`, `_processed_hash`, `_last_run_id` |

## Выход

### `solution/src/lib/config.js` — контракт

```js
// loadOrCreateConfig(sdk) -> Promise<CopilotConfig>
// saveConfig(sdk, config: CopilotConfig) -> Promise<void>
// runWizard(sdk, existingConfig?) -> Promise<CopilotConfig>   // вызывается loadOrCreateConfig при пустом/битом конфиге или по команде "reconfigure"
// selectScope(sdk, config: CopilotConfig) -> Promise<{ view: View, recordIds: string[] | null }>   // каждый запуск, см. выше
```

Форма `CopilotConfig`:

```js
{
  version: 1,
  tables: {
    applications: { datasheetId: "dst_applications", fields: { companyNameRaw: "fld_xxx", ... /* все роли из таблицы выше */ } },
    companies:    { datasheetId: "dst_companies",    fields: { inn: "fld_xxx", email: "fld_xxx", ... } },
    employees:    { datasheetId: "dst_employees",    fields: { ... } },
    templates:    { datasheetId: "dst_templates",    fields: { ... } },
    projects:     { datasheetId: "dst_projects",     fields: { ... } },
    tasks:        { datasheetId: "dst_tasks",        fields: { ... } },
    config:       { datasheetId: "dst_config" },
    runs:         { datasheetId: "dst_runs" }
  },
  thresholds: { matchAuto: 0.85, matchManualLow: 0.6, matchTopK: 3, classifyAuto: 0.6 },   // matchTopK — сколько вариантов показывать в неоднозначных случаях, US11
  assignPointers: {}   // заполняется/обновляется в Milestone 9, изначально пусто
}
```

### Побочный эффект

- Одна запись в реальном/mock-датасете «⚙️ Copilot Config» с полем `payload` (текст) = `JSON.stringify(config)`.
- Локальный кэш ID Config-датасета (файл в `data/derived/` в mock-режиме, `localStorage` в браузере).

## Критерий готовности

- Первый запуск на пустом seed проходит весь мастер и создаёт валидный `CopilotConfig`.
- Повторный запуск **не** переспрашивает ничего — подхватывает сохранённый конфиг за один вызов `loadOrCreateConfig`.
- Команда `"reconfigure"` в любом текстовом диалоге основного сценария запускает мастер заново и перезаписывает конфиг.
- `saveConfig`/`loadOrCreateConfig` работают идентично и под mock-SDK, и (после Milestone A/B) под реальным SDK — без правок кода, только данные другие.
- `selectScope` спрашивается **на каждом** запуске (в отличие от `loadOrCreateConfig`) и не читает/не пишет `CopilotConfig` — тест на это: два подряд вызова `run-local.js` оба спрашивают view, а не только первый.

## Демонстрация (обязательный шаг перед переходом к следующему milestone)

Интерактивный прогон `run-local.js` в реальном терминале: пользователь сам отвечает на вопросы мастера (ID таблиц, поля, view), видит сохранённый `CopilotConfig` (можно дампнуть как JSON), затем второй запуск — без единого вопроса, кроме `selectScope`.
