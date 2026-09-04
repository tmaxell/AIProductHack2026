# Milestone'ы — детальный разбор

Каждый файл описывает один пункт из [`../PLAN.md`](../PLAN.md) в формате: **зачем → вход → что делает → выход (с точной формой данных/сигнатурами) → критерий готовности**. Цель — чтобы перед тем, как писать код очередного модуля, было однозначно понятно, что он получает на вход и что обязан вернуть/записать, без домысливания по ходу.

Общие сквозные формы данных (используются в нескольких milestone'ах) собраны в конце [`milestone-04-preview-engine.md`](milestone-04-preview-engine.md#сквозная-форма-action) — там же, где они впервые становятся общим контрактом между модулями.

## Локально, без MWS (стартуем отсюда)

1. [Локальный mock-SDK и seed](milestone-01-mock-sdk-seed.md)
2. [Мастер конфигурации](milestone-02-config-wizard.md)
3. [Нормализация](milestone-03-normalize.md)
4. [Движок preview/apply](milestone-04-preview-engine.md)
5. [Дедуп и сопоставление со справочниками](milestone-05-match-dedup.md)
6. [Классификация типа и приоритета](milestone-06-classify.md)
7. [Базовые проверки аномалий](milestone-07-anomalies.md)
8. [Генерация задач по шаблону](milestone-08-tasks.md)
9. [Round-robin назначение](milestone-09-assign.md)
10. [Запуск проекта и отчёт](milestone-10-launch-report.md)
11. [Сборка и юнит-тесты](milestone-11-build-tests.md)

## Когда появится доступ к реальной MWS

- [Milestone A — проверка платформы](milestone-A-platform-verification.md)
- [Milestone B — обновить mock-SDK по факту](milestone-B-mock-sdk-update.md)
- [Milestone C — таблицы и разовый импорт](milestone-C-real-tables-import.md)
- [Milestone D — финальная валидация](milestone-D-final-validation.md)

## Трассировка User Stories

Сверка с бэклогом `research/user-stories.md` (4 эпика, US1–US16), выполнена 2026-09-04. Все 16 закрыты; US1 и US11 потребовали точечных уточнений плана (отмечено ниже).

| US | Кто | Milestone | Комментарий |
|---|---|---|---|
| US1 | администратор проектного офиса | [02](milestone-02-config-wizard.md) | часть 1 (маппинг таблиц/полей) — одноразово; часть 2 (выбор view/записей) — **добавлено** отдельным разделом, спрашивается на каждом запуске, не кэшируется |
| US2 | пользователь виджета | [02](milestone-02-config-wizard.md) | сохранение конфигурации маппинга |
| US3 | менеджер проекта | [03](milestone-03-normalize.md) | `normalizeEmail` |
| US4 | менеджер проекта | [03](milestone-03-normalize.md) | `normalizePhone` |
| US5 | менеджер проекта | [03](milestone-03-normalize.md) | `normalizeWhitespace`/`normalizeYoAndCase` |
| US6 | менеджер проекта | [03](milestone-03-normalize.md) | `normalizeDate` |
| US7 | менеджер проекта | [03](milestone-03-normalize.md) | `normalizeCity`/`normalizeCompanyName` |
| US8 | администратор проектного офиса | [05](milestone-05-match-dedup.md) | `findApplicationDuplicates` |
| US9 | менеджер проекта | [05](milestone-05-match-dedup.md) | `findCompanyMatches` |
| US10 | менеджер проекта | [05](milestone-05-match-dedup.md) | `findEmployeeMatches` — тот же алгоритм (email/phone/ФИО), не заглушка |
| US11 | пользователь | [04](milestone-04-preview-engine.md), [05](milestone-05-match-dedup.md) | **добавлено**: `matchTopK` кандидатов на неоднозначную запись + групповой UI выбора варианта в preview (`12a`/`12b`/`12c`), было — один кандидат на accept/reject |
| US12 | пользователь | [04](milestone-04-preview-engine.md) | авто-корзина, дефолт «all» |
| US13 | менеджер проекта | [06](milestone-06-classify.md) | `classifyApplications` |
| US14 | руководитель операционного подразделения | [06](milestone-06-classify.md) | `normalizePriority` |
| US15 | менеджер проекта | [08](milestone-08-tasks.md) | `planTasksForApplication` |
| US16 | менеджер проекта | [09](milestone-09-assign.md) | `assignRoundRobin` |
