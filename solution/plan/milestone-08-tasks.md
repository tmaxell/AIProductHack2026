# Milestone 8 — генерация задач по шаблону

Статус: локально, чистая функция планирования + запись выполняется из Milestone 10 (launch.js).

## Зачем

После того как заявка классифицирована (Milestone 6) и готова к запуску (Milestone 7), нужно создать конкретный набор задач по шаблону этого типа проекта — без дублей при повторном запуске.

## Вход

- Заявка с резолвленным `project_type` (принятый `suggestedType` из Milestone 6 либо явный выбор пользователя, если он переопределил рекомендацию).
- Строки Шаблона задач этого `project_type`, отсортированные по `order` (из справочника Шаблонов, через `CopilotConfig`).
- Список уже существующих Задач **этого конкретного проекта** — если проект новый, список пуст; если это донастройка уже существующего/легаси проекта (Milestone 10 линкует по `parent_project_raw`), список может быть непустым.

## Что делает

1. Для каждой строки шаблона считает ключ идемпотентности `sourceKey = \`${applicationRecordId}__${templateTaskCode}\`` (не `projectId`, а именно id заявки — чтобы повторная генерация от той же заявки не задваивала задачи, даже если проект переиспользуется).
2. Сверяет `sourceKey` с `source_key` уже существующих задач проекта — что уже есть, не создаёт повторно.
3. Для оставшихся формирует `TaskDraft` (см. форму ниже), включая нерезолвленный `predecessorCode` — реальный `blockedBy`-id проставляется отдельно, после того как все задачи батча реально созданы и у них появились id (нельзя сослаться на ещё не созданную запись).

## Выход

### `solution/src/lib/tasks.js`

```js
// planTasksForApplication(application, templateRows, existingTasks) -> { toCreate: TaskDraft[], toSkip: {sourceKey: string, reason: string}[] }
// resolvePredecessorLinks(createdTasks: {id: string, taskCode: string, predecessorCode: string|null}[]) -> {taskId: string, blockedByTaskId: string}[]
```

Форма `TaskDraft`:

```js
{
  sourceKey: "app_0007__INT-03",
  taskCode: "INT-03",
  taskName: "Согласование контура интеграции",
  requiredRole: "Архитектор",
  requiredSkills: ["API", "REST"],
  estimatedHours: 16,
  priority: "Высокий",              // из template_default_priority, либо suggestedPriority заявки, если шаблон не задаёт
  predecessorCode: "INT-02" ,        // null, если задача первая в цепочке
  dueDate: null                        // проставляется в launch.js на основе planned_start/order, не здесь
}
```

`resolvePredecessorLinks` вызывается **после** реального `createRecordsAsync` (в Milestone 10), когда у задач уже есть настоящие id — сопоставляет `taskCode` → `id` внутри одного батча и возвращает пары для отдельного `updateRecordsAsync` (`blockedByLink`).

## Критерий готовности

- Повторный вызов `planTasksForApplication` с `existingTasks`, уже содержащим все `sourceKey` из предыдущего прогона, возвращает `toCreate: []` — это и есть проверка идемпотентности на уровне модуля (используется в Milestone 11 в сквозном тесте).
- Порядок `toCreate` соответствует `template_order` — обязательные (`mandatory=true`) задачи присутствуют всегда, опциональные можно отфильтровать отдельным флагом вызова (не блокирует основной сценарий).

## Демонстрация (обязательный шаг перед переходом к следующему milestone)

После Milestone 10 (запуск) — дамп таблицы «Задачи» для одного запущенного проекта: видно созданные задачи в правильном порядке с `blockedByLink`, повторный запуск того же прогона не добавляет новых.
