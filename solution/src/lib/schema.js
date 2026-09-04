'use strict';

// Общая схема столбцов/ролей полей, разделяемая между devtools/seed.js (сборка локального seed)
// и src/lib/config.js (мастер настройки). Единственный источник правды по именам колонок
// dev-sample.csv — если файл поменяется, править нужно только здесь.
//
// Изолирован от Milestone-специфичной логики нарочно: и seed (Milestone 1), и config (Milestone 2)
// не должны дублировать список колонок каждый на свой лад.

// Поля таблицы "Заявки", как они приходят из record_type=APPLICATION в dev-sample.csv.
const APPLICATION_RAW_FIELDS = [
  'application_id_raw', 'project_name_raw', 'project_description_raw',
  'company_name_raw', 'company_inn_raw', 'company_email_raw', 'company_phone_raw', 'company_city_raw',
  'requester_fio_raw', 'requester_email_raw', 'requester_phone_raw',
  'project_type_raw', 'priority_raw', 'budget_raw', 'currency_raw',
  'planned_start_raw', 'planned_end_raw', 'duration_raw', 'sla_raw',
  'required_roles_raw', 'required_skills_raw', 'preferred_assignee_raw',
  'project_status_raw', 'source_channel_raw', 'external_reference_raw', 'parent_project_raw', 'comment_raw',
  'created_at_raw', 'updated_at_raw', 'source_system', 'source_row_key',
];

// Поля таблицы "Компании" (record_type=COMPANY_REFERENCE).
const COMPANY_FIELDS = [
  'company_ref_id', 'company_legal_name', 'company_short_name', 'company_inn', 'company_kpp',
  'company_email', 'company_phone', 'company_city', 'company_aliases', 'company_industry',
  'company_segment', 'company_active',
];

// Поля таблицы "Сотрудники" (record_type=EMPLOYEE).
const EMPLOYEE_FIELDS = [
  'employee_id', 'employee_fio', 'employee_email', 'employee_phone', 'employee_role',
  'employee_specializations', 'employee_skills', 'employee_capacity_hours_week', 'employee_current_load_pct',
  'employee_absent_from', 'employee_absent_to', 'employee_active',
];

// Поля таблицы "Шаблоны задач" (record_type=TASK_TEMPLATE).
const TEMPLATE_FIELDS = [
  'template_id', 'template_project_type', 'template_task_code', 'template_task_name', 'template_stage',
  'template_order', 'template_duration_hours', 'template_required_role', 'template_required_skills',
  'template_predecessor_code', 'template_default_priority', 'template_mandatory',
];

// Поля таблицы "Задачи" (record_type=EXISTING_TASK — существующие легаси-задачи).
const TASK_FIELDS = [
  'task_id', 'task_project_id', 'task_name', 'task_status', 'task_priority', 'task_assignee_id',
  'task_estimated_hours', 'task_spent_hours', 'task_due_date', 'task_required_role', 'task_required_skills',
];

// "Проекты" не приходят как самостоятельные строки в dev-sample.csv (только заглушки из
// task_project_id/parent_project_raw, см. devtools/seed.js) — но по целевой схеме
// (solution/PLAN.md#целевая-структура-данных-в-mws-tables) таблица должна уметь хранить эти поля,
// иначе Milestone 2 не сможет их замаппить, а Milestone 10 (launch.js) — записать.
const PROJECT_TARGET_FIELDS = [
  'project_name', 'project_type', 'priority', 'budget', 'currency',
  'planned_start', 'planned_end', 'status', 'company_link',
];

// Аналогично — поля "Задач", которыми управляет виджет (Link-поля + идемпотентность), а не CSV.
const TASK_TARGET_EXTRA_FIELDS = ['project_link', 'assignee_link', 'source_key', 'blocked_by_link'];

// Логические роли полей, которые мастер настройки (Milestone 2) обязан спросить у пользователя —
// см. solution/plan/milestone-02-config-wizard.md. В реальном MWS названия полей могут отличаться
// от наших raw-колонок, поэтому это отдельный список "ролей", а не просто алиас APPLICATION_RAW_FIELDS
// и т.п. (для applications роли совпадают с raw-колонками, т.к. это и есть исходные поля).
const WIZARD_ROLES = {
  applications: APPLICATION_RAW_FIELDS.slice(),
  companies: ['inn', 'email', 'phone', 'city', 'aliases', 'legalName', 'active'],
  employees: ['fio', 'email', 'phone', 'role', 'skills', 'specializations', 'capacityHoursWeek', 'currentLoadPct', 'absentFrom', 'absentTo', 'active'],
  templates: ['projectType', 'taskCode', 'taskName', 'order', 'durationHours', 'requiredRole', 'requiredSkills', 'predecessorCode', 'defaultPriority', 'mandatory'],
  projects: ['projectName', 'projectType', 'priority', 'budget', 'currency', 'plannedStart', 'plannedEnd', 'status', 'companyLink'],
  tasks: ['taskName', 'status', 'priority', 'projectLink', 'assigneeLink', 'estimatedHours', 'dueDate', 'requiredRole', 'requiredSkills', 'sourceKey', 'blockedByLink'],
};

// Поля на "Заявках", которыми владеет сам виджет (пишет их, не спрашивает про них в мастере).
// Ключи — они же fieldId по умолчанию, если конкретное поле ещё не создано в целевой таблице.
const SYSTEM_APPLICATION_FIELDS = [
  'normalized_company_email', 'normalized_requester_email', 'normalized_company_phone', 'normalized_requester_phone',
  'normalized_planned_start', 'normalized_planned_end', 'normalized_budget_amount', 'normalized_currency_code',
  'normalized_city', 'normalized_company_name', 'normalized_requester_fio',
  'company_link', 'employee_link', 'project_link', 'duplicate_link', 'duplicate_group_id',
  'suggested_project_type', 'suggested_priority', 'match_confidence', 'match_reason',
  'anomaly_flags', 'anomaly_notes', 'readiness_status',
  '_processed_hash', '_last_run_id',
];

const schema = {
  APPLICATION_RAW_FIELDS,
  COMPANY_FIELDS,
  EMPLOYEE_FIELDS,
  TEMPLATE_FIELDS,
  TASK_FIELDS,
  PROJECT_TARGET_FIELDS,
  TASK_TARGET_EXTRA_FIELDS,
  WIZARD_ROLES,
  SYSTEM_APPLICATION_FIELDS,
};

// Milestone 11: под Node — обычный module.exports; в бандле для MWS (после сборки build.js, где
// каждый файл обёрнут в свою IIFE — см. solution/plan/milestone-11-build-tests.md) module не
// определён, и модуль кладёт себя в общий неймспейс, чтобы другие обёрнутые файлы могли его найти
// без деклараций одноимённых переменных в общей области видимости (которые иначе конфликтовали бы).
if (typeof module !== 'undefined') {
  module.exports = schema;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.schema = schema;
}
