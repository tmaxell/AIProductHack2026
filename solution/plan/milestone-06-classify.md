# Milestone 6 — классификация типа и приоритета (базовая, не «глубокая»)

Статус: локально, чистые функции + подключение к preview-движку.

## Зачем

Чтобы выбрать шаблон задач (Milestone 8) и приоритет проекта, нужно привести `project_type_raw`/`priority_raw` к каноническому набору значений. Это базовая функция кейса (п.4 условия), не «углублённая» интеллектуальная фича из п.5 — см. `../PLAN.md#контекст`.

## Вход

- `project_type_raw`, `project_description_raw`, `required_roles_raw`, `required_skills_raw`, `priority_raw` заявки.
- Справочник Шаблонов задач — **не хардкод**, а прочитанный в начале прогона список уникальных `template_project_type` + агрегированные (объединённые по группе) `template_required_role`/`template_required_skills`.

## Что делает

1. Строит на старте прогона `Map<canonicalType, {roles: Set, skills: Set}>` из справочника Шаблонов (агрегация в рантайме, не список, вписанный в код).
2. Нормализует `project_type_raw` (снятие регистра/пробелов, как в Milestone 3) и сравнивает строковым сходством с каждым `canonicalType`.
3. Тай-брейк / усиление: доля токенов `required_roles_raw`+`required_skills_raw` заявки, покрытых `roles`/`skills` шаблонной группы (`coverage = |A∩B|/|A|`, **не** симметричный Jaccard) добавляется к score сходства имени. Jaccard здесь не годится: шаблон описывает весь тип проекта (~30 задач, широкий набор ролей), поэтому его множество почти всегда шире списка одной заявки, и Jaccard наказывал даже идеальные совпадения — подтверждено на практике (auto-классификация была 10% вместо ожидаемых ~70%), см. `solution/docs/TEST-RESULTS.md`, Milestone 6.
4. Лучший `canonicalType` с суммарным score `>= config.thresholds.classifyAuto` → предлагается автоматически; ниже — `suggestedType: null`, флаг на ручной выбор (в preview показывается заявка с топ-2 кандидатами и их score, чтобы пользователь мог быстро выбрать нужный текстом).
5. Приоритет: статический словарь вариантов `{"P1":"Критический","P2":"Высокий","P3":"Средний","P4":"Низкий","высокий":"Высокий","normal":"Средний","low":"Низкий","1":"Критический",...}` (стандартные общеупотребимые обозначения, не подсмотренные в CSV специально) → 4 канонических уровня. Не найдено в словаре → `suggestedPriority: null`, на ручной выбор.

## Выход

### `solution/src/lib/classify.js`

```js
// buildCanonicalTypeIndex(templateRows) -> Map<canonicalType, {roles: Set<string>, skills: Set<string>}>
// classifyApplications(applications, canonicalTypeIndex) -> ClassificationResult[]
// normalizePriority(raw) -> { value: string|null, confidence: number, reason: string }
```

Форма `ClassificationResult`:

```js
{
  recordId: "app_0007",
  suggestedType: "Интеграция систем" | null,
  typeConfidence: 0.82,
  typeReason: "совпадение с шаблоном 'Интеграция систем' по названию (0.7) + пересечению ролей/навыков (0.9)",
  suggestedPriority: "Высокий" | null,
  priorityConfidence: 1.0,
  priorityReason: "priority_raw='P2' -> словарь приоритетов"
}
```

Оборачивается в `Action` (`kind:"classify"`, `field: "suggested_project_type"` и отдельно `field: "suggested_priority"`) и идёт в тот же preview-движок Milestone 4.

## Критерий готовности

- Каждой заявке присвоен `suggestedType`/`suggestedPriority` либо явный `null` + флаг ручного выбора — никогда исключение на пустых/мусорных значениях.
- `buildCanonicalTypeIndex` строится **только** из данных Шаблонов, доступных в конкретном прогоне (проверяется тестом: если в тестовых Шаблонах всего 2 типа — классификатор не «знает» про остальные 12 из `dev-sample.csv`, что доказывает отсутствие хардкода).

## Демонстрация (обязательный шаг перед переходом к следующему milestone)

Прогон на подвыборке заявок разных типов (интеграция/миграция/поддержка и т.п.): видно предложенный тип и приоритет с причиной («совпадение по названию + пересечению ролей/навыков»), подтверждаем, видно проставленное значение в дампе «Заявки».
