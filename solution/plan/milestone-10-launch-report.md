# Milestone 10 — запуск проекта и отчёт

Статус: локально, через mock-SDK. Собирает вместе результаты всех предыдущих модулей.

## Зачем

Финальный шаг сквозного сценария: превратить готовую к запуску заявку в реальный Проект + Задачи + Исполнители, и показать пользователю понятную сводку по всему прогону.

## Вход `launch.js`

- Заявка с `readiness_status !== "Needs Review"` (не блокирующая, см. Milestone 7) **и** подтверждением пользователя (через preview-движок Milestone 4, `kind` для запуска — отдельный шаг подтверждения «запустить эти N заявок?», аналогичный остальным).
- Результат Milestone 6 (`suggestedType`/`suggestedPriority`, принятые пользователем).
- Результат Milestone 5 (`company_link`).
- `parent_project_raw` заявки + результат его сопоставления с уже существующим Проектом (тот же механизм блокировки/скоринга, что в Milestone 5, по точному совпадению `project_name`/id — не полноценный дедуп легаси-проектов, см. `../PLAN.md#контекст`).
- `CopilotConfig` (пороги, шаблоны, указатели round-robin).

## Что делает `launch.js`

1. Если `parent_project_raw` сматчился на существующий Проект — **только линкует** заявку к нему (`Заявка.project_link = existingProjectId`), новый проект не создаёт.
2. Иначе создаёт новый Проект через `createRecordAsync`: `project_name` из `project_name_raw`, `project_type`/`priority` из принятых `suggestedType`/`suggestedPriority`, `budget`/даты из normalized-полей, `company_link` из Milestone 5, `status: "draft"`.
3. Вызывает `planTasksForApplication` (Milestone 8) → получает `toCreate: TaskDraft[]`.
4. Для каждого `TaskDraft` вызывает `assignRoundRobin` (Milestone 9), копит изменения `pointerState`.
5. Создаёт все задачи одним `createRecordsAsync`, затем `resolvePredecessorLinks` (Milestone 8) → второй батч `updateRecordsAsync` для `blockedByLink`.
6. Обновляет заявку: `project_link`, `readiness_status = "Launched"`, `_processed_hash` (финальный, от всех участвовавших `*_raw` значений — если после этого `dev-sample` не поменяется, повторный прогон будет полным no-op).
7. Сохраняет обновлённый `assignPointers` в Config одним вызовом (`saveConfig`, Milestone 2).

## Выход `launch.js`

```js
// launchApplication(sdk, application, context: {config, matchResult, classificationResult}) -> LaunchResult
```

```js
{
  recordId: "app_0007",
  projectId: "prj_0201",
  createdNewProject: true,        // false, если просто слинковали с существующим
  tasksCreated: 6,
  tasksSkipped: 0                   // задачи, уже существовавшие по source_key (повторный запуск)
}
```

## Вход `report.js`

Все накопленные за прогон результаты: `applied`/`skipped` из каждого вызова `runPreviewCycle` (Milestone 4), все `MatchCandidate` (Milestone 5), все `AnomalyFlag` (Milestone 7), все `LaunchResult` (выше).

## Что делает `report.js`

Агрегирует счётчики, печатает `output.markdown`/`output.table` итоговую сводку, пишет одну запись в датасет **Copilot Runs**.

## Выход `report.js`

```js
// buildRunSummary(runContext) -> RunSummary
```

```js
{
  runId: "run_2026-09-04T12-00-00Z",
  startedAt, finishedAt,
  scope: "Новые заявки",             // имя view, на котором запускали
  checked: 6800,
  fixed: 5210,                          // применённых normalize-действий
  linkedCompany: 6100,
  linkedDuplicate: 340,
  anomaliesFound: 812,
  classified: 6550,
  tasksCreated: 4380,
  projectsCreated: 3020,
  manualReviewLeft: 450                 // сколько заявок осталось без подтверждённого решения
}
```

Эта же запись пишется как строка в **Copilot Runs** — используется в Milestone 11/D как доказательство идемпотентности (второй прогон на тех же данных должен дать нулевые `fixed`/`linkedCompany`/`tasksCreated`/`projectsCreated`).

## Критерий готовности

- Числа в `RunSummary` точно совпадают с фактическими изменениями в датасетах (тест: считает записи/связи до и после прогона, сверяет со сводкой).
- Повторный прогон на неизменных данных даёт `RunSummary` с нулевыми «созидающими» счётчиками (`fixed`, `linkedCompany`, `linkedDuplicate`, `tasksCreated`, `projectsCreated`) — это и есть формальная проверка идемпотентности всего пайплайна, а не только отдельных модулей.

## Демонстрация (обязательный шаг перед переходом к следующему milestone)

Полный сквозной прогон на подвыборке 20–50 заявок от начала до конца: мастер → scope → нормализация → дедуп/матчинг → классификация → аномалии → запуск → итоговая `output.markdown` сводка. Затем повторный прогон на той же подвыборке — сводка с нулевыми созидающими счётчиками. Это и есть первая полноценная демонстрация всего сценария целиком.
