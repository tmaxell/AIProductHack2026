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

1. Спрашивает (`input.textAsync`) ID датасета «Copilot Config». Пробует прочитать в нём существующий конфиг; если пусто — идёт мастер по шагу 2.
2. Таблица «Заявки» — не спрашивается текстом: определяется автоматически через `space.getActiveDatasheetAsync()` (виджет установлен внутри неё), с фолбэком на `input.textAsync` только если активный датасет не определился. Обоснование и ограничения — `solution/PLAN.md#авто-детект-текущей-таблицы`.
3. Только для таблиц, которые реально нужны уже реализованным Milestones 1-7 (Компании/Сотрудники/Шаблоны задач) — `input.textAsync` на ID датасета → `space.getDatasheetAsync`. «Проекты», «Задачи» и «Copilot Runs» — НЕ спрашиваются вообще (не читаются никаким текущим кодом, появятся вместе с Milestones 8-10, см. `solution/PLAN.md#авто-детект-текущей-таблицы`).
4. Для каждой логической роли поля в каждой таблице (включая «Заявки», но только для ролей, реально используемых Milestones 1-7 — см. таблицу ниже) — сначала пробует авто-детект **по содержимому значений** первых ~30 записей (`config.js#detectFieldsByContent`: только для `currency_raw`/`priority_raw` — узнаваемый словарём формат, который не путается с другими полями); если не сработало (или роль не входит в число авто-детектируемых) — `input.fieldAsync(label, datasheet)`.
5. Спрашивает пороги уверенности (или использует дефолты без вопроса, если пользователь не хочет менять — см. критерий готовности).
6. Сохраняет итог как JSON в записи Config-датасета, кэширует ID Config-датасета в `localStorage` (в mock — эмулируется файлом, см. Milestone 1).
7. Команда `"reconfigure"`, введённая вместо любого текстового ответа в основном сценарии, прерывает текущий прогон и перезапускает мастер с шага 2.

### Список логических ролей полей, которые мастер СЕЙЧАС спрашивает

Только то, что реально читает уже реализованный код (Milestones 1-7) — не полная схема из `PLAN.md#целевая-структура-данных-в-mws-tables`. `⚡` — авто-детект по содержимому, вопроса не будет, если сработает.

| Таблица | Роли полей |
|---|---|
| Компании | `inn`, `email`, `phone`, `city`, `aliases`, `legalName`, `active` |
| Сотрудники | `fio`, `email`, `phone`, `role`, `skills`, `specializations`, `capacityHoursWeek`, `currentLoadPct`, `absentFrom`, `absentTo`, `active` |
| Шаблоны задач | `projectType`, `taskCode`, `taskName`, `order`, `durationHours`, `requiredRole`, `requiredSkills`, `predecessorCode`, `defaultPriority`, `mandatory` |
| Заявки (своя же таблица) | `application_id_raw`, `project_name_raw`, `company_name_raw`, `company_inn_raw`, `company_email_raw`, `company_phone_raw`, `company_city_raw`, `requester_fio_raw`, `requester_email_raw`, `requester_phone_raw`, `project_type_raw`, `priority_raw`⚡, `budget_raw`, `currency_raw`⚡, `planned_start_raw`, `planned_end_raw`, `duration_raw`, `required_roles_raw`, `required_skills_raw`, `preferred_assignee_raw`, `project_status_raw` |

Не спрашиваются вообще (см. `schema.js#APPLICATION_UNUSED_RAW_FIELDS`): `project_description_raw`, `sla_raw`, `source_channel_raw`, `external_reference_raw`, `parent_project_raw`, `comment_raw`, `created_at_raw`, `updated_at_raw`, `source_system`, `source_row_key` — описательный текст/метаданные источника, ни normalize/match/classify/anomalies их не читают. Системные поля Заявок (`normalized_*`, `suggested_*`, `company_link` и т.п.) тоже не спрашиваются — ими владеет сам виджет, читаются/пишутся по имени поля (см. `main.js#recordToApplicationObject`, `preview.js#resolveFieldId`), а не через мастер.

Таблицы «Проекты» и «Задачи» (роли `projectName`/`taskName`/... — см. `schema.js`) сохранены в исходниках как задел под Milestones 8-10, но НЕ входят в `TABLE_LABELS` — мастер про них не спрашивает вообще, пока эти milestone'ы не реализованы.

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
