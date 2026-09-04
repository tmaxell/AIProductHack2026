# Milestone 7 — базовые проверки аномалий

Статус: локально, чистые функции. Работает последним из «аналитических» шагов — объединяет результаты normalize+match+classify.

## Зачем

Кейс требует показывать «аномалии бюджета и сроков» и не позволять запускать явно неисправные заявки без ведома пользователя. Здесь — только детерминированные правила (см. `../PLAN.md#контекст`: статистические/ML-модели аномалий сознательно вне скоупа).

## Вход

Заявка **после** Milestone 3 (normalized_*) и Milestone 6 (suggestedType/Priority) — то есть этот модуль получает уже обогащённую запись, а не сырые `*_raw` поля:

```js
{
  recordId, normalized_email, normalized_phone, normalized_planned_start, normalized_planned_end,
  normalized_budget_amount, normalized_currency_code, duration_raw, project_status_raw,
  suggestedType, suggestedPriority, application_id_raw,
  // + для проверки конфликтующих дублей: остальные заявки с тем же application_id_raw
}
```

## Что делает

Прогоняет фиксированный список правил (каждое — отдельная маленькая чистая функция, не одна большая):

| Код | Условие | severity |
|---|---|---|
| `REQUIRED_FIELD_MISSING` | обязательное поле пусто после нормализации (email компании, ИНН, название) | blocking |
| `EMAIL_INVALID` | `normalized_email` не проходит базовый формат `x@y.z` | info |
| `PHONE_INVALID` | `normalized_phone` не 11 цифр в формате `+7XXXXXXXXXX` | info |
| `TIMELINE_INVALID` | `planned_end <= planned_start` | blocking |
| `DURATION_MISMATCH` | распарсенная `duration_raw` (в днях) расходится с `(planned_end - planned_start)` больше чем на условные 20% | info |
| `BUDGET_INVALID` | `normalized_budget_amount <= 0` или не распарсен | info |
| `CURRENCY_UNKNOWN` | валюта не резолвится в известный код (RUB/USD/EUR/...) | info |
| `DUPLICATE_ID_CONFLICT` | тот же `application_id_raw` у другой заявки с другой компанией/бюджетом | info |
| `STATUS_UNRECOGNIZED` | `project_status_raw` не мапится ни в один известный статус | info |
| `NO_COMPANY_MATCH` | Milestone 5 не нашёл ни одной компании (даже в ручной корзине) | blocking |
| `NO_CLASSIFICATION` | `suggestedType === null` | blocking |

## Выход

### `solution/src/lib/anomalies.js`

```js
// detectAnomalies(enrichedRecord) -> AnomalyFlag[]
// isBlocking(flags: AnomalyFlag[]) -> boolean
// resolveReadinessStatus(enrichedRecord, flags) -> "Not Reviewed" | "Needs Review" | "Ready to Launch"
```

Форма `AnomalyFlag`:

```js
{ recordId: "app_0007", code: "BUDGET_INVALID", severity: "blocking" | "info", message: "Бюджет не распознан из значения '—'" }
```

Пишется в заявку как `anomaly_flags` (multi-select из кодов) + `anomaly_notes` (человекочитаемые `message`, склеенные) — через тот же preview-движок Milestone 4 (`kind:"anomaly-ack"`, показывается пользователю для подтверждения того, что он видел флаг, но само наличие флага не требует отдельного action-подтверждения — это просто информационная запись, blocking-флаги не позволяют перевести `readiness_status` в `"Ready to Launch"`, пока не сняты).

## Критерий готовности

- Каждое правило из таблицы покрыто минимум одним юнит-тестом (позитивный и негативный случай).
- `resolveReadinessStatus` никогда не возвращает `"Ready to Launch"`, если среди флагов есть хоть один `severity: "blocking"`.
- Ни одно правило не требует сети/справочников сверх уже переданных в `enrichedRecord` — чистая синхронная функция.

## Демонстрация (обязательный шаг перед переходом к следующему milestone)

Прогон на подвыборке с заведомо «подозрительными» бюджетами/сроками (см. `../PLAN.md#данные`): видно проставленные `anomaly_flags`/`anomaly_notes` и то, что заявки с blocking-флагом не переходят в `"Ready to Launch"`.
