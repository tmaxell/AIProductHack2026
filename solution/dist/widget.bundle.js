// Собрано автоматически solution/build/build.js — не редактировать руками, правки внести
// в исходные файлы solution/src/ и пересобрать. См. solution/plan/milestone-11-build-tests.md.

// Каждый if (typeof require...) {...} else {...} блок из исходников уже вырезан этой сборкой
// (см. stripNodeOnlyBranches в build.js) — остались только else-ветки. MWS Script Widget, по
// эмпирической проверке, вешается на любое обращение к импорту, чьё имя совпадает с каким-либо
// npm/Node-модулем, независимо от достижимости этого кода в рантайме — см. PLATFORM-NOTES.md.
globalThis.__COPILOT_BUNDLED__ = true;

/* ---- src/lib/schema.js ---- */
;(function () {
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

})();


/* ---- src/lib/helpers.js ---- */
;(function () {
'use strict';

// Общие чистые утилиты для match.js/classify.js/preview.js — строковое сходство, токенизация,
// union-find для кластеризации дублей (Milestone 5), сравнение значений для идемпотентности.
// Никакой бизнес-логики здесь нет специально, чтобы не плодить дубли реализации между модулями.

/** Расстояние Левенштейна, O(len(a)*len(b)) — приемлемо для коротких строк (названия/email/ФИО). */
function levenshtein(a, b) {
  const s1 = a || '';
  const s2 = b || '';
  if (s1 === s2) return 0;
  const m = s1.length;
  const n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** 0..1, 1 = идентичны. Простая метрика — планка качества Milestone 5: быстро и просто важнее точности. */
function stringSimilarity(a, b) {
  const s1 = a || '';
  const s2 = b || '';
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(s1, s2) / maxLen;
}

/** Разбивает "React, Тестирование | UX\nJavaScript" на нормализованные токены — данные вперемешку
 * используют запятую/точку с запятой/пайп/перенос строки как разделитель (см. solution/PLAN.md#данные). */
function tokenize(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,|;\n]+/)
    .map((t) => t.trim().toLowerCase().replace(/ё/g, 'е'))
    .filter(Boolean);
}

/** Индекс Жаккара: |A∩B| / |A∪B|, 0 если оба множества пусты. */
function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const v of setA) if (setB.has(v)) intersection += 1;
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

function addToBucket(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

/** Сравнение значений для идемпотентности (null/undefined/'' — эквивалентны, массивы — поэлементно). */
function valuesEqual(a, b) {
  if (a === b) return true;
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return false;
}

/** Union-Find для транзитивной кластеризации дублей (Milestone 5, US8): если A~B и B~C — одна группа. */
class UnionFind {
  constructor(ids) {
    this.parent = new Map(ids.map((id) => [id, id]));
  }

  find(x) {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    this.parent.set(x, root); // path compression
    return root;
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  groups() {
    const byRoot = new Map();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!byRoot.has(root)) byRoot.set(root, []);
      byRoot.get(root).push(id);
    }
    return [...byRoot.values()];
  }
}

const utilModule = {
  levenshtein, stringSimilarity, tokenize, jaccard, addToBucket, valuesEqual, UnionFind,
};

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js (тот же паттерн везде).
if (typeof module !== 'undefined') {
  module.exports = utilModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.helpers = utilModule;
}

})();


/* ---- src/lib/normalize.js ---- */
;(function () {
'use strict';

// Milestone 3 — нормализация. Контракт и планка качества ("быстро и универсально важнее точности") —
// solution/plan/milestone-03-normalize.md. Каждая функция разбирает КЛАСС формата, а не список
// конкретных строк из dev-sample.csv (см. solution/PLAN.md#данные — почему это принципиально).

function result(value, changed, confidence, reason) {
  return { value, changed, confidence, reason };
}

function isEmpty(raw) {
  return raw === null || raw === undefined || String(raw).trim() === '';
}

/** Убирает лишние пробелы (включая неразрывный/zero-width) и схлопывает их. */
function normalizeWhitespace(raw) {
  if (isEmpty(raw)) return result(null, false, 0, 'empty');
  // \u00A0 (неразрывный пробел) и \u200B (zero-width space) ниже — экранированы явно кодами,
  // а не вставлены сырыми невидимыми байтами: сырые невидимые символы внутри исходника ломали
  // редактор кода MWS Script Widget при вставке всего бандла целиком (выглядело как "скрипт
  // зависает намертво ещё до старта выполнения" — баг платформы-редактора, не логики).
  const value = String(raw).replace(/[\u00A0\u200B]/g, ' ').replace(/\s+/g, ' ').trim();
  return result(value, value !== raw, value ? 0.9 : 0, 'убраны лишние пробелы/служебные символы');
}

/** Ключ сравнения (не для отображения): регистр + ё/е + пробелы — для матчинга в Milestone 5/6. */
function normalizeYoAndCase(raw) {
  if (isEmpty(raw)) return '';
  return String(raw).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

// ВАЖНО: reason во всех функциях ниже собирается из шагов, которые РЕАЛЬНО что-то поменяли в
// конкретном значении, а не статическая фраза на всю функцию — иначе получается вроде "снят
// mailto:" на значении, где никакого mailto: и не было (см. solution/docs/TEST-RESULTS.md,
// найдено при чтении сгенерированного отчёта прогона).
function normalizeEmail(raw) {
  if (isEmpty(raw)) return result(null, false, 0, 'empty');
  const original = String(raw);
  const steps = [];

  const trimmed = original.trim();
  if (trimmed !== original) steps.push('убраны пробелы по краям');
  let s = trimmed;

  if (/^mailto:/i.test(s)) {
    s = s.replace(/^mailto:/i, '');
    steps.push('снят префикс mailto:');
  }

  const noInnerSpaces = s.replace(/\s+/g, '');
  if (noInnerSpaces !== s) steps.push('убраны внутренние пробелы');
  s = noInnerSpaces;

  const lower = s.toLowerCase();
  if (lower !== s) steps.push('нижний регистр');
  s = lower;

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const changed = s !== original;
  let reason = steps.length ? steps.join(' + ') : 'изменений не потребовалось';
  if (!valid) reason += ', но итоговый формат подозрительный';
  return result(s, changed, valid ? 0.95 : 0.3, reason);
}

function normalizePhone(raw) {
  if (isEmpty(raw)) return result(null, false, 0, 'empty');
  const original = String(raw);
  const steps = [];

  let digits = original.replace(/\D/g, '');
  if (/[^\d]/.test(original)) steps.push('убраны разделители (пробелы/скобки/дефисы/+)');

  const beforeLeadingFix = digits;
  if (digits.length === 11 && (digits[0] === '8' || digits[0] === '7')) {
    digits = `7${digits.slice(1)}`;
  } else if (digits.length === 10) {
    digits = `7${digits}`;
  }
  if (digits !== beforeLeadingFix) steps.push('ведущая цифра приведена к 7 (код России)');

  if (digits.length !== 11) {
    return result(null, false, 0, `unrecognized format (${digits.length} цифр)`);
  }
  const value = `+${digits}`;
  const changed = value !== original;
  const reason = steps.length ? steps.join(' + ') : 'изменений не потребовалось';
  return result(value, changed, 0.95, reason);
}

const MONTHS_RU = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

function pad2(n) { return String(n).padStart(2, '0'); }

function normalizeDate(raw) {
  if (isEmpty(raw)) return result(null, false, 0, 'empty');
  const s = String(raw).trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const value = `${m[1]}-${m[2]}-${m[3]}`;
    return result(value, value !== s, 0.95, 'ISO-дата, время (если было) отброшено');
  }

  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) {
    const [, d, mo, yRaw] = m;
    const y = yRaw.length === 2 ? (Number(yRaw) > 50 ? `19${yRaw}` : `20${yRaw}`) : yRaw;
    const value = `${y}-${pad2(mo)}-${pad2(d)}`;
    return result(value, true, 0.85, 'дд.мм.гггг -> ISO');
  }

  m = s.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (m) {
    const [, d, monthName, y] = m;
    const mo = MONTHS_RU[monthName.toLowerCase()];
    if (mo) {
      const value = `${y}-${pad2(mo)}-${pad2(d)}`;
      return result(value, true, 0.85, 'русское название месяца -> ISO');
    }
  }

  return result(null, false, 0, 'unrecognized format');
}

function normalizeDuration(raw) {
  if (isEmpty(raw)) return result(null, false, 0, 'empty');
  const s = String(raw).trim().toLowerCase();

  let m = s.match(/^p(\d+)d$/i);
  if (m) return result(Number(m[1]), true, 0.95, 'ISO-8601 duration (P<n>D)');

  m = s.match(/^(\d+)\s*нед/);
  if (m) return result(Number(m[1]) * 7, true, 0.9, 'недели -> дни');

  m = s.match(/^(\d+)\s*д(н|ней|ня)?\b/);
  if (m) return result(Number(m[1]), true, 0.9, 'дни как есть');

  m = s.match(/^(\d+)\s*мес/);
  if (m) return result(Number(m[1]) * 30, true, 0.7, 'месяцы -> дни (приближённо, 30 дн/мес)');

  m = s.match(/^(\d+)\s*ч/);
  if (m) return result(Math.round(Number(m[1]) / 8), true, 0.6, 'часы -> дни (приближённо, 8ч/день)');

  return result(null, false, 0, 'unrecognized format');
}

const CURRENCY_WORDS = [
  ['rub', 'RUB'], ['rur', 'RUB'], ['₽', 'RUB'], ['руб', 'RUB'],
  ['usd', 'USD'], ['$', 'USD'],
  ['eur', 'EUR'], ['€', 'EUR'],
];

function normalizeCurrency(raw) {
  if (isEmpty(raw)) return result(null, false, 0, 'empty');
  const s = String(raw).trim().toLowerCase();
  for (const [needle, code] of CURRENCY_WORDS) {
    if (s.includes(needle)) return result(code, code !== raw, 0.9, `распознано по вхождению "${needle}"`);
  }
  return result(null, false, 0, 'unrecognized currency');
}

function normalizeBudget(rawAmount, rawCurrency) {
  const currencyGuess = normalizeCurrency(rawCurrency);
  if (isEmpty(rawAmount)) {
    return { value: null, changed: false, confidence: 0, reason: 'empty', currencyCode: currencyGuess.value };
  }

  const steps = [];
  let s = String(rawAmount).trim().toLowerCase();
  let inlineCurrency = null;
  for (const [needle, code] of CURRENCY_WORDS) {
    if (s.includes(needle)) {
      inlineCurrency = code;
      s = s.split(needle).join('');
      steps.push(`валюта распознана прямо в сумме ("${needle}")`);
    }
  }

  let multiplier = 1;
  if (/млн/.test(s)) {
    multiplier = 1e6;
    s = s.replace(/млн\.?/, '');
    steps.push('множитель "млн" (×1 000 000)');
  } else if (/тыс/.test(s)) {
    multiplier = 1e3;
    s = s.replace(/тыс\.?/, '');
    steps.push('множитель "тыс" (×1 000)');
  }

  const beforeCleanup = s;
  s = s.replace(/[^\d.,]/g, '').trim().replace(',', '.');
  if (s !== beforeCleanup) steps.push('убраны пробелы/разделители');

  const dotCount = (s.match(/\./g) || []).length;
  if (dotCount > 1) s = s.replace(/\./g, ''); // "1.967.000" — точки как разделители тысяч, не десятичные

  const num = parseFloat(s);
  if (!Number.isFinite(num) || num <= 0) {
    return {
      value: null, changed: false, confidence: 0, reason: 'unrecognized amount', currencyCode: inlineCurrency || currencyGuess.value,
    };
  }
  const value = Math.round(num * multiplier);
  return {
    value,
    changed: true,
    confidence: 0.85,
    reason: steps.length ? steps.join(' + ') : 'приведено к числу без дополнительных преобразований',
    currencyCode: inlineCurrency || currencyGuess.value,
  };
}

const LEGAL_FORMS = new Set(['ооо', 'зао', 'оао', 'пао', 'ао', 'ип', 'нко']);

function stripLegalForm(s) {
  const cleaned = s.replace(/[«»"']/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  const filtered = words.filter((w) => !LEGAL_FORMS.has(w.toLowerCase().replace(/\.$/, '')));
  return filtered.join(' ').trim();
}

function normalizeCompanyName(raw) {
  if (isEmpty(raw)) return result(null, false, 0, 'empty');
  const original = String(raw);
  const steps = [];

  const collapsed = normalizeWhitespace(original).value || '';
  if (collapsed !== original) steps.push('убраны лишние пробелы');

  const hadQuotes = /[«»"']/.test(collapsed);
  if (hadQuotes) steps.push('убраны кавычки');

  const wordsBefore = collapsed.replace(/[«»"']/g, ' ').split(/\s+/).filter(Boolean);
  const stripped = stripLegalForm(collapsed);
  const wordsAfter = stripped.split(/\s+/).filter(Boolean);
  if (wordsAfter.length < wordsBefore.length) steps.push('снята организационно-правовая форма');

  const value = stripped || collapsed;
  const changed = value !== original;
  const reason = steps.length ? steps.join(' + ') : 'изменений не потребовалось';
  return result(value, changed, value ? 0.7 : 0, reason);
}

/**
 * @param {string} raw
 * @param {string[]} knownCities - собраны в рантайме из справочника Компаний ЭТОГО прогона, не хардкод.
 */
function normalizeCity(raw, knownCities) {
  if (isEmpty(raw)) return result(null, false, 0, 'empty');
  const s = (normalizeWhitespace(raw).value || '').replace(/^г[.\s]+/i, '').trim();
  if (!s) return result(null, false, 0, 'empty after strip');

  const list = knownCities || [];
  const sLower = s.toLowerCase();
  const exact = list.find((c) => c.toLowerCase() === sLower);
  if (exact) return result(exact, exact !== raw, 0.9, 'точное совпадение со справочником городов (после чистки)');

  // Короткие кириллические токены похожи на сокращение (Члб/Нск) — низкоуверенный кандидат,
  // не для авто-применения, только для ручного разбора.
  if (s.length <= 5 && /^[а-яё]+$/i.test(s)) {
    const candidate = list.find((c) => c.toLowerCase().startsWith(sLower[0]));
    if (candidate) return result(candidate, true, 0.4, `похоже на сокращение города, кандидат по первой букве: ${candidate}`);
  }

  return result(s, s !== raw, 0.5, 'нормализован регистр/пробелы, соответствие в справочнике не найдено');
}

function titleCaseToken(p) {
  // Один инициал ("К", "К.") ИЛИ несколько инициалов слитно без пробела ("Ю.Д.", "К.М.") —
  // раньше вторая и последующие буквы такого токена ошибочно приводились к нижнему регистру
  // (например "Ю.Д." -> "Ю.д."), т.к. общая ветка ниже просто лоуеркейсит всё, кроме первой буквы.
  if (/^([a-zа-яё]\.)+$/i.test(p) || /^[a-zа-яё]$/i.test(p)) return p.toUpperCase();
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

function normalizeFio(raw) {
  if (isEmpty(raw)) {
    return {
      lastName: null, firstName: null, middleName: null, changed: false, confidence: 0, reason: 'empty',
    };
  }
  const original = String(raw);
  const steps = [];

  const collapsed = normalizeWhitespace(original).value || '';
  if (collapsed !== original) steps.push('убраны лишние пробелы');

  const parts = collapsed.split(' ').filter(Boolean);
  const titled = parts.map(titleCaseToken);
  const titledJoined = titled.join(' ');
  if (titledJoined !== collapsed) steps.push('нормализован регистр');

  const [lastName = null, firstName = null, middleName = null] = titled;
  const changed = titledJoined !== original;
  const reason = steps.length ? steps.join(' + ') : 'изменений не потребовалось';
  return {
    lastName,
    firstName,
    middleName,
    changed,
    confidence: parts.length >= 2 ? 0.75 : 0.4,
    reason,
  };
}

/**
 * Агрегатор: строит список `Action` (kind:"normalize") для preview-движка (Milestone 4).
 * Ничего не пишет в датасеты — только формирует предложения.
 *
 * @param {Array<object>} applications - "плоские" объекты заявок ({id, ...raw-поля})
 * @param {object} config - CopilotConfig (сейчас не используется напрямую, зарезервировано)
 * @param {{knownCities?: string[]}} runtimeContext
 */
function buildNormalizationSuggestions(applications, config, runtimeContext = {}) {
  const suggestions = [];
  const knownCities = runtimeContext.knownCities || [];

  // ВАЖНО про from/to (см. solution/plan/milestone-04-preview-engine.md): `from` — это ТЕКУЩЕЕ
  // значение поля, которое будет перезаписано (normalized_*, изначально пусто), а не сырое
  // значение-источник (*_raw, которое никогда не перезаписывается). Именно сравнение from===to
  // и есть идемпотентность: после первого прогона normalized_* уже равно to, и предложение
  // на втором прогоне не генерируется повторно. Сырое значение показываем отдельно как
  // displayFrom — исключительно для читаемости preview-таблицы "было -> станет".
  function add(recordId, field, rawValue, currentValue, changed, confidence, reason, to) {
    if (!changed) return;
    if (valuesEqualForIdempotency(currentValue, to)) return; // уже применено в прошлом прогоне
    suggestions.push({
      recordId,
      table: 'applications',
      field,
      from: currentValue,
      displayFrom: rawValue,
      to,
      changed,
      confidence,
      reason,
      kind: 'normalize',
    });
  }

  for (const app of applications) {
    const email = normalizeEmail(app.company_email_raw);
    add(app.id, 'normalized_company_email', app.company_email_raw, app.normalized_company_email, email.changed, email.confidence, email.reason, email.value);

    const reqEmail = normalizeEmail(app.requester_email_raw);
    add(app.id, 'normalized_requester_email', app.requester_email_raw, app.normalized_requester_email, reqEmail.changed, reqEmail.confidence, reqEmail.reason, reqEmail.value);

    const phone = normalizePhone(app.company_phone_raw);
    add(app.id, 'normalized_company_phone', app.company_phone_raw, app.normalized_company_phone, phone.changed, phone.confidence, phone.reason, phone.value);

    const reqPhone = normalizePhone(app.requester_phone_raw);
    add(app.id, 'normalized_requester_phone', app.requester_phone_raw, app.normalized_requester_phone, reqPhone.changed, reqPhone.confidence, reqPhone.reason, reqPhone.value);

    const start = normalizeDate(app.planned_start_raw);
    add(app.id, 'normalized_planned_start', app.planned_start_raw, app.normalized_planned_start, start.changed, start.confidence, start.reason, start.value);

    const end = normalizeDate(app.planned_end_raw);
    add(app.id, 'normalized_planned_end', app.planned_end_raw, app.normalized_planned_end, end.changed, end.confidence, end.reason, end.value);

    const budget = normalizeBudget(app.budget_raw, app.currency_raw);
    add(app.id, 'normalized_budget_amount', app.budget_raw, app.normalized_budget_amount, budget.changed, budget.confidence, budget.reason, budget.value);
    if (budget.currencyCode) {
      // ВАЖНО: пишем normalized_currency_code даже когда currency_raw уже совпадает с итоговым
      // кодом ("RUB" -> "RUB") — это отдельное поле, и без записи оно остаётся пустым навсегда,
      // из-за чего Milestone 7 (CURRENCY_UNKNOWN) ложно считал валюту нераспознанной. Идемпотентность
      // всё равно обеспечивает add() сравнением с ТЕКУЩИМ normalized_currency_code, а не с currency_raw.
      const currencyChanged = budget.currencyCode !== app.currency_raw;
      const currencyReason = currencyChanged ? 'нормализована валюта' : `валюта распознана как ${budget.currencyCode}`;
      add(app.id, 'normalized_currency_code', app.currency_raw, app.normalized_currency_code, true, 0.8, currencyReason, budget.currencyCode);
    }

    const city = normalizeCity(app.company_city_raw, knownCities);
    add(app.id, 'normalized_city', app.company_city_raw, app.normalized_city, city.changed, city.confidence, city.reason, city.value);

    const companyName = normalizeCompanyName(app.company_name_raw);
    add(app.id, 'normalized_company_name', app.company_name_raw, app.normalized_company_name, companyName.changed, companyName.confidence, companyName.reason, companyName.value);

    const fio = normalizeFio(app.requester_fio_raw);
    const fioValue = [fio.lastName, fio.firstName, fio.middleName].filter(Boolean).join(' ');
    add(app.id, 'normalized_requester_fio', app.requester_fio_raw, app.normalized_requester_fio, fio.changed, fio.confidence, fio.reason, fioValue || null);
  }

  return suggestions;
}

function valuesEqualForIdempotency(a, b) {
  if (a === b) return true;
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true;
  return false;
}

const normalizeModule = {
  normalizeWhitespace,
  normalizeYoAndCase,
  normalizeEmail,
  normalizePhone,
  normalizeDate,
  normalizeDuration,
  normalizeCurrency,
  normalizeBudget,
  normalizeCompanyName,
  normalizeCity,
  normalizeFio,
  buildNormalizationSuggestions,
};

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js (тот же паттерн везде).
if (typeof module !== 'undefined') {
  module.exports = normalizeModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.normalize = normalizeModule;
}

})();


/* ---- src/lib/config.js ---- */
;(function () {
'use strict';

// Milestone 2 — мастер конфигурации + выбор scope запуска.
// Контракт и обоснование каждого решения — solution/plan/milestone-02-config-wizard.md.
//
// Локальная эмуляция localStorage: т.к. Script Widget не документирует постоянное хранилище
// (solution/plan/milestone-A-platform-verification.md, вопрос №6), здесь и в реальном браузере
// кэшируется только ID таблицы Config — сам конфиг живёт в самой MWS-таблице, доступной всем.
// В mock-режиме localStorage эмулируется файлом data/derived/local-config-cache.json.

// fs/path — только под Node (локальная разработка); в реальном MWS (браузер) их нет вообще. Но
// важно даже не это: сам текст обращения к встроенным Node-модулям fs/path где-либо в скрипте —
// даже недостижимый за `if (IS_NODE)` — вешает реальный MWS Script Widget на ~минуту без единой
// ошибки (эмпирически проверено, см. solution/docs/PLATFORM-NOTES.md); похоже на статическую
// реакцию платформы на эти конкретные спецификаторы ещё до выполнения кода. Поэтому вся работа с
// fs/path вынесена в solution/src/lib/node-cache.js, который build.js НИКОГДА не включает в
// widget.bundle.js (не в LIB_ORDER) — обращение к node-cache.js ниже недостижимо в браузере/бандле
// точно так же, как раньше был недостижим прямой доступ к fs, но сам этот текст безопасен: это
// обычный относительный require на наш же модуль, как и в остальных lib-файлах.
//
// `&& !globalThis.__COPILOT_BUNDLED__` — потому что в реальном MWS Script Widget `require` тоже
// может существовать как глобальная функция (для разрешённых npm-пакетов); без этой оговорки
// голый `typeof require === 'function'` уходил бы по Node-ветке. Метку выставляет
// solution/build/build.js в самом начале собранного файла.
const IS_NODE = typeof require === 'function' && !globalThis.__COPILOT_BUNDLED__;
const CACHE_KEY = 'copilotConfigCacheV1'; // ключ в localStorage в браузере
let nodeCache = null;


const CONFIG_PAYLOAD_FIELD = 'payload';

const DEFAULT_THRESHOLDS = {
  matchAuto: 0.85,
  matchManualLow: 0.6,
  matchTopK: 3, // сколько вариантов показывать в неоднозначных случаях — US11
  classifyAuto: 0.6,
  classifyManualLow: 0.3, // ниже — классификатор не предлагает вообще (слишком мало сигналов)
};

const TABLE_LABELS = {
  applications: 'Заявки (текущая таблица)',
  companies: 'Компании',
  employees: 'Сотрудники',
  templates: 'Шаблоны задач',
  projects: 'Проекты',
  tasks: 'Задачи',
};

function readCache() {
  try {
    if (IS_NODE) {
      return JSON.parse(nodeCache.readFileSync(nodeCache.cachePath));
    }
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeCache(data) {
  if (IS_NODE) {
    nodeCache.writeFileSync(nodeCache.cachePath, JSON.stringify(data, null, 2));
    return;
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

function clearCache() {
  try {
    if (IS_NODE) {
      nodeCache.unlinkSync(nodeCache.cachePath);
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch (e) { /* нечего чистить */ }
}

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js. Раньше здесь было
// импорт WIZARD_ROLES напрямую, что после сборки в один файл конфликтовало бы с
// собственным `const WIZARD_ROLES` внутри schema.js в общей области видимости — назвал локальную
// переменную иначе (wizardRoles) специально, чтобы не плодить одноимённые объявления.
let schemaLib;

  schemaLib = globalThis.CopilotLib.schema;

const wizardRoles = schemaLib.WIZARD_ROLES;

/**
 * Одноразовый мастер настройки (US1 часть 1 + US2). Спрашивает ID каждой связанной таблицы и
 * маппинг логических ролей полей на реальные Field через input.fieldAsync — без единого
 * хардкода ID. Результат сохраняется в записи датасета "Copilot Config".
 */
async function runWizard(sdk) {
  const { space, input, output } = sdk;
  output.markdown('## Мастер настройки Project Launch Copilot');
  output.text('Отвечайте ID таблиц так, как они называются в вашем пространстве MWS Tables.');

  const configDatasheetId = (await input.textAsync('ID таблицы «Copilot Config»:')).trim();
  const tables = {};

  for (const key of Object.keys(TABLE_LABELS)) {
    const id = (await input.textAsync(`ID таблицы «${TABLE_LABELS[key]}»:`)).trim();
    const datasheet = await space.getDatasheetAsync(id);
    const fields = {};
    for (const role of wizardRoles[key]) {
      const field = await input.fieldAsync(`«${TABLE_LABELS[key]}»: какое поле соответствует роли «${role}»?`, datasheet);
      fields[role] = field.id;
    }
    tables[key] = { datasheetId: id, fields };
  }

  tables.config = { datasheetId: configDatasheetId };

  const runsId = (await input.textAsync('ID таблицы «Copilot Runs»:')).trim();
  tables.runs = { datasheetId: runsId };

  const config = {
    version: 1,
    tables,
    thresholds: { ...DEFAULT_THRESHOLDS },
    assignPointers: {},
  };

  await saveConfig(sdk, config);
  output.text('Настройка сохранена — при следующем запуске мастер не понадобится.');
  return config;
}

async function saveConfig(sdk, config) {
  const { space } = sdk;
  const configDatasheet = await space.getDatasheetAsync(config.tables.config.datasheetId);
  const existing = await configDatasheet.getRecordsAsync();
  const payload = JSON.stringify(config);
  if (existing.length > 0) {
    await configDatasheet.updateRecordAsync(existing[0].id, { [CONFIG_PAYLOAD_FIELD]: payload });
  } else {
    await configDatasheet.createRecordAsync({ [CONFIG_PAYLOAD_FIELD]: payload });
  }
  writeCache({ configDatasheetId: config.tables.config.datasheetId });
}

/**
 * @param {object} sdk
 * @param {object} [opts]
 * @param {boolean} [opts.forceReconfigure] - принудительно запустить мастер заново
 *   (в реальном сценарии эквивалент команды "reconfigure", см. план; здесь — явный флаг,
 *   т.к. перехват произвольного текстового ответа на любом из диалогов усложнил бы
 *   код без выигрыша для локальной разработки).
 */
async function loadOrCreateConfig(sdk, opts = {}) {
  const { space, output } = sdk;
  if (opts.forceReconfigure) clearCache();

  const cache = readCache();
  if (cache && cache.configDatasheetId) {
    try {
      const configDatasheet = await space.getDatasheetAsync(cache.configDatasheetId);
      const records = await configDatasheet.getRecordsAsync();
      if (records.length > 0) {
        const raw = records[0].getCellValue(CONFIG_PAYLOAD_FIELD);
        if (raw) {
          output.text('Конфигурация загружена из кэша — мастер настройки не запускается.');
          return JSON.parse(raw);
        }
      }
    } catch (e) {
      output.text(`Кэш конфигурации устарел (${e.message}) — запускаю мастер заново.`);
    }
  }
  return runWizard(sdk);
}

/**
 * Выбор scope запуска (US1 часть 2) — спрашивается на КАЖДОМ запуске, не кэшируется.
 */
async function selectScope(sdk, config) {
  const { space, input } = sdk;
  const appsDatasheet = await space.getDatasheetAsync(config.tables.applications.datasheetId);
  const view = await input.viewAsync('Какое представление «Заявок» обрабатываем?', appsDatasheet);
  return { view, recordIds: null };
}

const configModule = {
  DEFAULT_THRESHOLDS,
  loadOrCreateConfig,
  saveConfig,
  runWizard,
  selectScope,
  clearCache,
};

if (typeof module !== 'undefined') {
  module.exports = configModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.config = configModule;
}

})();


/* ---- src/lib/match.js ---- */
;(function () {
'use strict';

// Milestone 5 — дедуп и сопоставление со справочниками. Контракт и планка качества —
// solution/plan/milestone-05-match-dedup.md. Блокировка кандидатов вместо O(n^2), маленький
// явный набор весов, средняя зона уверенности — на выбор пользователю (US11), не угадывание.

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js — после сборки (Milestone 11,
// build.js оборачивает КАЖДЫЙ файл в свою IIFE) деструктуризация ниже безопасна: она приватна этому
// файлу и не конфликтует с одноимёнными объявлениями в normalize.js/util.js/других модулях.
let normalizeLib;
let utilLib;

  normalizeLib = globalThis.CopilotLib.normalize;
  utilLib = globalThis.CopilotLib.helpers;

const { normalizeEmail, normalizeCompanyName, normalizeYoAndCase } = normalizeLib;
const { stringSimilarity, addToBucket, UnionFind } = utilLib;

/** "8650089811.0" (Excel-артефакт) -> "8650089811"; "ИНН 6012447316" -> "6012447316". */
function cleanInn(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/\.0+$/, '');
  s = s.replace(/\D/g, '');
  return s || null;
}

function phoneLast10(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function companyLikeKeys({ inn, email, phone, name, city }) {
  return {
    inn: cleanInn(inn),
    email: normalizeEmail(email).value,
    phone: phoneLast10(phone),
    normalizedName: normalizeYoAndCase(normalizeCompanyName(name).value || name || ''),
    normalizedCity: normalizeYoAndCase(city),
  };
}

/** Заявка как "компания" для company-матчинга и application-application дедупа — одни и те же поля. */
function appCompanyKeys(app) {
  return companyLikeKeys({
    inn: app.company_inn_raw,
    email: app.company_email_raw,
    phone: app.company_phone_raw,
    name: app.normalized_company_name || app.company_name_raw,
    city: app.normalized_city || app.company_city_raw,
  });
}

function referenceCompanyKeys(company, fieldsMap) {
  return companyLikeKeys({
    inn: company[fieldsMap.inn],
    email: company[fieldsMap.email],
    phone: company[fieldsMap.phone],
    name: company[fieldsMap.legalName],
    city: company[fieldsMap.city],
  });
}

/** Строит блокирующие индексы (ИНН/email/телефон/имя+город) поверх любого набора "компанийподобных" записей. */
function buildBlockingIndex(items, keysOfFn) {
  const byInn = new Map();
  const byEmail = new Map();
  const byPhone = new Map();
  const byNameCity = new Map();
  const records = new Map();

  for (const item of items) {
    const keys = keysOfFn(item);
    records.set(item.id, keys);
    if (keys.inn) addToBucket(byInn, keys.inn, item.id);
    if (keys.email) addToBucket(byEmail, keys.email, item.id);
    if (keys.phone) addToBucket(byPhone, keys.phone, item.id);
    if (keys.normalizedName && keys.normalizedCity) {
      addToBucket(byNameCity, `${keys.normalizedName}|${keys.normalizedCity}`, item.id);
    }
  }
  return { byInn, byEmail, byPhone, byNameCity, records };
}

function collectCandidates(index, keys, excludeId) {
  const ids = new Set([
    ...(keys.inn ? index.byInn.get(keys.inn) || [] : []),
    ...(keys.email ? index.byEmail.get(keys.email) || [] : []),
    ...(keys.phone ? index.byPhone.get(keys.phone) || [] : []),
    ...(keys.normalizedName && keys.normalizedCity
      ? index.byNameCity.get(`${keys.normalizedName}|${keys.normalizedCity}`) || [] : []),
  ]);
  if (excludeId) ids.delete(excludeId);
  return ids;
}

function scoreCandidate(appKeys, candidateKeys) {
  const signals = { inn: false, email: false, phone: false, city: false, nameSim: 0 };
  let score = 0;
  if (appKeys.inn && candidateKeys.inn && appKeys.inn === candidateKeys.inn) { score += 0.5; signals.inn = true; }
  if (appKeys.email && candidateKeys.email && appKeys.email === candidateKeys.email) { score += 0.3; signals.email = true; }
  if (appKeys.phone && candidateKeys.phone && appKeys.phone === candidateKeys.phone) { score += 0.3; signals.phone = true; }
  const nameSim = stringSimilarity(appKeys.normalizedName, candidateKeys.normalizedName);
  signals.nameSim = Math.round(nameSim * 100) / 100;
  score += nameSim * 0.3;
  if (appKeys.normalizedCity && candidateKeys.normalizedCity && appKeys.normalizedCity === candidateKeys.normalizedCity) {
    score += 0.1;
    signals.city = true;
  }
  return { score: Math.min(score, 1), signals };
}

// Честный reason (см. solution/docs/TEST-RESULTS.md про баг со статичными причинами в normalize.js) —
// сходство названия упоминаем только если оно реально что-то весит в объяснении: либо заметное
// (>0.3), либо это единственный сработавший сигнал вообще.
function describeSignals(signals) {
  const parts = [];
  if (signals.inn) parts.push('точное совпадение ИНН');
  if (signals.email) parts.push('точное совпадение email');
  if (signals.phone) parts.push('точное совпадение телефона');
  if (signals.city) parts.push('совпадение города');
  if (signals.nameSim > 0.3 || parts.length === 0) parts.push(`сходство названия ${signals.nameSim.toFixed(2)}`);
  return parts.join(' + ');
}

function makeLinkAction(recordId, field, currentValue, candidateId, score, reason, bucket, optionIndex, signals) {
  return {
    recordId,
    table: 'applications',
    field,
    from: currentValue ?? null,
    to: candidateId,
    changed: candidateId !== currentValue,
    confidence: Math.round(score * 100) / 100,
    reason,
    kind: 'link',
    bucket,
    optionIndex,
    signals,
  };
}

/** Раскладывает ранжированных кандидатов по корзинам авто/ручной/не показываем — см. план п.3. */
function buildLinkActions(recordId, field, currentValue, scored, config, describeFn) {
  if (scored.length === 0) return [];
  const best = scored[0];
  if (best.score >= config.thresholds.matchAuto) {
    return [makeLinkAction(recordId, field, currentValue, best.id, best.score, describeFn(best.signals), 'auto', 1, best.signals)];
  }
  if (best.score >= config.thresholds.matchManualLow) {
    const topK = scored.slice(0, config.thresholds.matchTopK || 3);
    return topK.map((c, i) => makeLinkAction(recordId, field, currentValue, c.id, c.score, describeFn(c.signals), 'manual', i + 1, c.signals));
  }
  return [];
}

/** @returns {Array} MatchCandidate[] (kind:"link", field:"company_link") — US9. */
function findCompanyMatches(applications, companies, config, fieldsMap) {
  const index = buildBlockingIndex(companies, (c) => referenceCompanyKeys(c, fieldsMap));
  const actions = [];
  for (const app of applications) {
    if (app.company_link) continue; // уже связано — не перетираем без явного rematch (план п.6)
    const keys = appCompanyKeys(app);
    const candidateIds = collectCandidates(index, keys, null);
    if (candidateIds.size === 0) continue;
    const scored = [...candidateIds]
      .map((id) => ({ id, ...scoreCandidate(keys, index.records.get(id)) }))
      .sort((a, b) => b.score - a.score);
    actions.push(...buildLinkActions(app.id, 'company_link', app.company_link, scored, config, describeSignals));
  }
  return actions;
}

function describeEmployeeSignals(signals) {
  const parts = [];
  if (signals.email) parts.push('точное совпадение email');
  if (signals.phone) parts.push('точное совпадение телефона');
  if (signals.nameSim > 0.3 || parts.length === 0) parts.push(`сходство ФИО ${signals.nameSim.toFixed(2)}`);
  return parts.join(' + ');
}

/**
 * @returns {Array} MatchCandidate[] (kind:"link", field:"employee_link") — US10. Тот же алгоритм
 * (блокировка + явные веса), что и для компаний, а не заглушка — источник имени: preferred_assignee_raw
 * (кого хочет видеть исполнителем сам заказчик) приоритетнее requester_fio_raw (это просто контакт,
 * обычно внешний человек, а не сотрудник — но иногда совпадает, поэтому не отбрасываем).
 */
function findEmployeeMatches(applications, employees, config, fieldsMap) {
  const byEmail = new Map();
  const byPhone = new Map();
  const byFirstChar = new Map();
  const records = new Map();

  for (const e of employees) {
    const email = normalizeEmail(e[fieldsMap.email]).value;
    const phone = phoneLast10(e[fieldsMap.phone]);
    const normalizedFio = normalizeYoAndCase(e[fieldsMap.fio] || '');
    records.set(e.id, { email, phone, normalizedFio });
    if (email) addToBucket(byEmail, email, e.id);
    if (phone) addToBucket(byPhone, phone, e.id);
    if (normalizedFio) addToBucket(byFirstChar, normalizedFio[0], e.id);
  }

  const actions = [];
  for (const app of applications) {
    if (app.employee_link) continue;
    const appEmail = normalizeEmail(app.requester_email_raw).value;
    const appPhone = phoneLast10(app.requester_phone_raw);
    const nameForMatch = normalizeYoAndCase(app.preferred_assignee_raw) || normalizeYoAndCase(app.requester_fio_raw);

    const candidateIds = new Set([
      ...(appEmail ? byEmail.get(appEmail) || [] : []),
      ...(appPhone ? byPhone.get(appPhone) || [] : []),
      ...(nameForMatch ? byFirstChar.get(nameForMatch[0]) || [] : []),
    ]);
    if (candidateIds.size === 0) continue;

    const scored = [...candidateIds].map((id) => {
      const c = records.get(id);
      const signals = { email: false, phone: false, nameSim: 0 };
      let score = 0;
      if (appEmail && c.email && appEmail === c.email) { score += 0.3; signals.email = true; }
      if (appPhone && c.phone && appPhone === c.phone) { score += 0.3; signals.phone = true; }
      const nameSim = stringSimilarity(nameForMatch, c.normalizedFio);
      signals.nameSim = Math.round(nameSim * 100) / 100;
      score += nameSim * 0.6;
      return { id, score: Math.min(score, 1), signals };
    }).sort((a, b) => b.score - a.score);

    actions.push(...buildLinkActions(app.id, 'employee_link', app.employee_link, scored, config, describeEmployeeSignals));
  }
  return actions;
}

/**
 * Скоринг дублей ЗАЯВОК — НЕ то же самое, что "та же компания" (scoreCandidate выше). US8 про
 * "не запускать один и тот же проект несколько раз": одна компания может законно прислать много
 * разных заявок (разные проекты), и если мерить дубли только идентичностью компании, все заявки
 * одного клиента слипаются в одну "группу дублей" — это реальный баг, найденный на полном прогоне
 * (кластер из 16 совершенно разных проектов одной компании). Поэтому здесь доминирует сходство
 * самого содержания заявки (название проекта, заявитель), а совпадение компании — лишь подтверждающий,
 * не самостоятельно достаточный сигнал.
 */
function scoreApplicationDuplicate(appA, appB, companySignals) {
  const signals = {
    sameApplicationId: false, requesterEmail: false, requesterPhone: false, sameCompany: false, projectNameSim: 0,
  };

  if (appA.application_id_raw && appA.application_id_raw === appB.application_id_raw) {
    signals.sameApplicationId = true;
    signals.projectNameSim = 1;
    return { score: 0.95, signals }; // тот же application_id_raw — почти наверняка та же заявка (повторная отправка)
  }

  let score = 0;
  const projectNameSim = stringSimilarity(
    normalizeYoAndCase(appA.project_name_raw),
    normalizeYoAndCase(appB.project_name_raw),
  );
  signals.projectNameSim = Math.round(projectNameSim * 100) / 100;
  score += projectNameSim * 0.55;

  const reqEmailA = normalizeEmail(appA.requester_email_raw).value;
  const reqEmailB = normalizeEmail(appB.requester_email_raw).value;
  if (reqEmailA && reqEmailB && reqEmailA === reqEmailB) { score += 0.2; signals.requesterEmail = true; }

  const reqPhoneA = phoneLast10(appA.requester_phone_raw);
  const reqPhoneB = phoneLast10(appB.requester_phone_raw);
  if (reqPhoneA && reqPhoneB && reqPhoneA === reqPhoneB) { score += 0.15; signals.requesterPhone = true; }

  if (companySignals.inn || companySignals.email || companySignals.phone) {
    score += 0.1;
    signals.sameCompany = true;
  }

  return { score: Math.min(score, 1), signals };
}

function describeDuplicateSignals(signals) {
  if (signals.sameApplicationId) return 'совпадает application_id_raw (повторная отправка той же заявки)';
  const parts = [];
  if (signals.requesterEmail) parts.push('тот же email заявителя');
  if (signals.requesterPhone) parts.push('тот же телефон заявителя');
  if (signals.sameCompany) parts.push('та же компания');
  parts.push(`сходство названия проекта ${signals.projectNameSim.toFixed(2)}`);
  return parts.join(' + ');
}

/**
 * Application-application дедуп (US8): блокировка по идентичности компании (быстрое сужение
 * кандидатов), но скоринг — по содержанию самой заявки (см. scoreApplicationDuplicate), не по
 * идентичности компании. Однозначные пары (score >= matchAuto) кластеризуются транзитивно через
 * union-find (A~B, B~C -> одна группа); неоднозначные — в ручной разбор, без объединения в кластер.
 * @returns {{clusters: string[][], candidates: Array}}
 */
function findApplicationDuplicates(applications, config) {
  const index = buildBlockingIndex(applications, (app) => appCompanyKeys(app));
  const appsById = new Map(applications.map((a) => [a.id, a]));
  const uf = new UnionFind(applications.map((a) => a.id));
  const manualCandidates = [];

  for (const app of applications) {
    // План п.6 — не пересканируем уже разрешённые заявки: duplicate_link стоит у НЕканонических
    // членов группы, duplicate_group_id — у всех членов включая каноническую. Без проверки ВТОРОГО
    // поля каноническая заявка группы пересканировалась бы на каждом прогоне и перестраивала бы
    // ту же группу заново (была реальная идемпотентность-регрессия, найдено тестом на 6800 заявках).
    if (app.duplicate_link || app.duplicate_group_id) continue;
    const keys = index.records.get(app.id);
    const candidateIds = collectCandidates(index, keys, app.id);
    if (candidateIds.size === 0) continue;
    const scored = [...candidateIds]
      .map((id) => {
        const candidateApp = appsById.get(id);
        const { signals: companySignals } = scoreCandidate(keys, index.records.get(id));
        return { id, ...scoreApplicationDuplicate(app, candidateApp, companySignals) };
      })
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best.score >= config.thresholds.matchAuto) {
      uf.union(app.id, best.id);
    } else if (best.score >= config.thresholds.matchManualLow) {
      const topK = scored.slice(0, config.thresholds.matchTopK || 3);
      manualCandidates.push(...topK.map((c, i) => makeLinkAction(
        app.id, 'duplicate_link', app.duplicate_link, c.id, c.score, describeDuplicateSignals(c.signals), 'manual', i + 1, c.signals,
      )));
    }
  }

  const clusters = uf.groups().filter((g) => g.length > 1).map((g) => [...g].sort());

  // Однозначные кластеры пишем сразу двумя полями: duplicate_group_id — всем членам группы,
  // duplicate_link — всем, кроме "канонической" (первой по сортировке) заявки в группе.
  const autoCandidates = [];
  for (const cluster of clusters) {
    const [canonical] = cluster;
    const groupId = `dup-${canonical}`;
    for (const memberId of cluster) {
      const memberApp = appsById.get(memberId);
      const currentGroupId = memberApp ? memberApp.duplicate_group_id ?? null : null;
      autoCandidates.push({
        recordId: memberId, table: 'applications', field: 'duplicate_group_id', from: currentGroupId, to: groupId,
        changed: currentGroupId !== groupId, confidence: 0.9, reason: `часть группы дублей из ${cluster.length} заявок`, kind: 'link', bucket: 'auto', optionIndex: 1,
      });
      if (memberId !== canonical) {
        const currentDuplicateLink = memberApp ? memberApp.duplicate_link ?? null : null;
        autoCandidates.push({
          recordId: memberId, table: 'applications', field: 'duplicate_link', from: currentDuplicateLink, to: canonical,
          changed: currentDuplicateLink !== canonical, confidence: 0.9, reason: `дубль заявки ${canonical} (та же группа)`, kind: 'link', bucket: 'auto', optionIndex: 1,
        });
      }
    }
  }

  return { clusters, candidates: [...autoCandidates, ...manualCandidates] };
}

const matchModule = {
  cleanInn,
  phoneLast10,
  findCompanyMatches,
  findEmployeeMatches,
  findApplicationDuplicates,
};

if (typeof module !== 'undefined') {
  module.exports = matchModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.match = matchModule;
}

})();


/* ---- src/lib/classify.js ---- */
;(function () {
'use strict';

// Milestone 6 — классификация типа и приоритета (базовая, не "углублённая", см.
// solution/PLAN.md#контекст). Контракт — solution/plan/milestone-06-classify.md.

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js.
let utilLib;

  utilLib = globalThis.CopilotLib.helpers;

const { stringSimilarity, tokenize } = utilLib;

/**
 * Строит канонический индекс типов проекта из справочника Шаблонов ЭТОГО прогона — не хардкод,
 * см. критерий готовности в плане: если в тестовых Шаблонах 2 типа, классификатор не должен
 * "знать" про остальные из dev-sample.csv.
 * @returns {Map<string, {roles: Set<string>, skills: Set<string>}>}
 */
function buildCanonicalTypeIndex(templateRows, fieldsMap) {
  const index = new Map();
  for (const row of templateRows) {
    const type = row[fieldsMap.projectType];
    if (!type) continue;
    if (!index.has(type)) index.set(type, { roles: new Set(), skills: new Set() });
    const entry = index.get(type);
    tokenize(row[fieldsMap.requiredRole]).forEach((t) => entry.roles.add(t));
    tokenize(row[fieldsMap.requiredSkills]).forEach((t) => entry.skills.add(t));
  }
  return index;
}

/**
 * Доля токенов ЗАЯВКИ (appTokens), покрытых шаблоном (templateTokens) — не симметричный Jaccard.
 * Шаблон описывает весь тип проекта (~30 задач с разными ролями), поэтому его набор ролей/навыков
 * почти всегда ШИРЕ, чем то, что перечислено в одной конкретной заявке — Jaccard за это наказывал
 * даже идеальные совпадения (полное покрытие заявки при большем объединении множеств давало низкий
 * score). "Покрывает ли шаблон то, что просит заявка" — то, что нам реально нужно для классификации.
 */
function coverage(appTokens, templateTokens) {
  if (appTokens.size === 0) return 0;
  let covered = 0;
  for (const t of appTokens) if (templateTokens.has(t)) covered += 1;
  return covered / appTokens.size;
}

function scoreType(app, type, entry) {
  const nameSim = stringSimilarity(
    String(app.project_type_raw || '').toLowerCase(),
    String(type || '').toLowerCase(),
  );
  const appRoles = new Set(tokenize(app.required_roles_raw));
  const appSkills = new Set(tokenize(app.required_skills_raw));
  const roleOverlap = coverage(appRoles, entry.roles);
  const skillOverlap = coverage(appSkills, entry.skills);
  const score = nameSim * 0.5 + roleOverlap * 0.25 + skillOverlap * 0.25;
  return { type, score, nameSim, roleOverlap, skillOverlap };
}

function describeTypeMatch(c) {
  return `совпадение с шаблоном "${c.type}" по названию (${c.nameSim.toFixed(2)}), ролям (${c.roleOverlap.toFixed(2)}) и навыкам (${c.skillOverlap.toFixed(2)})`;
}

const PRIORITY_DICTIONARY = {
  p1: 'Критический', p2: 'Высокий', p3: 'Средний', p4: 'Низкий',
  1: 'Критический', 2: 'Высокий', 3: 'Средний', 4: 'Низкий',
  критический: 'Критический', высокий: 'Высокий', средний: 'Средний', низкий: 'Низкий',
  critical: 'Критический', high: 'Высокий', medium: 'Средний', normal: 'Средний', low: 'Низкий',
};

/** Общеупотребимые обозначения приоритета (P1..P4, рус/eng слова, 1..4) — не список из CSV, см. план. */
function normalizePriority(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { value: null, confidence: 0, reason: 'empty' };
  }
  const key = String(raw).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '');
  const mapped = PRIORITY_DICTIONARY[key];
  if (mapped) return { value: mapped, confidence: 1, reason: `priority_raw="${raw}" -> словарь приоритетов` };
  return { value: null, confidence: 0, reason: `priority_raw="${raw}" не найдено в словаре приоритетов` };
}

function makeClassifyAction(app, field, to, confidence, reason, bucket, optionIndex) {
  const currentValue = app[field] ?? null;
  return {
    recordId: app.id,
    table: 'applications',
    field,
    from: currentValue,
    to,
    changed: to !== currentValue,
    confidence,
    reason,
    kind: 'classify',
    bucket,
    optionIndex,
  };
}

/**
 * @returns {{actions: Array, results: Array}} actions — Action[] для preview-движка (Milestone 4);
 * results — ClassificationResult[] (см. план), пригодится Milestone 7/8/9/10.
 */
function classifyApplications(applications, canonicalTypeIndex, config) {
  const types = [...canonicalTypeIndex.keys()];
  const actions = [];
  const results = [];

  for (const app of applications) {
    const scored = types
      .map((type) => scoreType(app, type, canonicalTypeIndex.get(type)))
      .sort((a, b) => b.score - a.score);
    const best = scored[0] || null;

    let suggestedType = null;
    const typeConfidence = best ? Math.round(best.score * 100) / 100 : 0;
    let typeReason = best ? describeTypeMatch(best) : 'нет доступных шаблонов для классификации';

    if (best) {
      if (best.score >= config.thresholds.classifyAuto) {
        suggestedType = best.type;
        actions.push(makeClassifyAction(app, 'suggested_project_type', best.type, typeConfidence, typeReason, 'auto', 1));
      } else if (best.score >= config.thresholds.classifyManualLow) {
        typeReason = `нет уверенного совпадения (лучший кандидат "${best.type}", ${typeConfidence.toFixed(2)}) — нужен ручной выбор`;
        scored.slice(0, 2).forEach((c, i) => actions.push(
          makeClassifyAction(app, 'suggested_project_type', c.type, Math.round(c.score * 100) / 100, describeTypeMatch(c), 'manual', i + 1),
        ));
      }
    }

    const priorityResult = normalizePriority(app.priority_raw);
    if (priorityResult.value) {
      actions.push(makeClassifyAction(
        app, 'suggested_priority', priorityResult.value, priorityResult.confidence, priorityResult.reason, 'auto', 1,
      ));
    }

    results.push({
      recordId: app.id,
      suggestedType,
      typeConfidence,
      typeReason,
      suggestedPriority: priorityResult.value,
      priorityConfidence: priorityResult.confidence,
      priorityReason: priorityResult.reason,
    });
  }

  return { actions, results };
}

const classifyModule = {
  buildCanonicalTypeIndex,
  classifyApplications,
  normalizePriority,
};

if (typeof module !== 'undefined') {
  module.exports = classifyModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.classify = classifyModule;
}

})();


/* ---- src/lib/anomalies.js ---- */
;(function () {
'use strict';

// Milestone 7 — базовые проверки аномалий. Контракт — solution/plan/milestone-07-anomalies.md.
// Только детерминированные правила, никакой статистики/ML (см. solution/PLAN.md#контекст).

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js.
let normalizeLib;
let utilLib;

  normalizeLib = globalThis.CopilotLib.normalize;
  utilLib = globalThis.CopilotLib.helpers;

const { normalizeDuration } = normalizeLib;
const { valuesEqual } = utilLib;

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

// Общеупотребимые русские/английские варианты статуса заявки — общее доменное знание, не список
// строк, подсмотренных в конкретном CSV (см. solution/PLAN.md#данные про принцип "не переобучаться").
const KNOWN_STATUS_KEYS = new Set(['draft', 'черновик', 'review', 'напроверке', 'new', 'новая']);
function normalizeStatusKey(raw) {
  return String(raw).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '');
}

const RULES = [
  {
    code: 'REQUIRED_FIELD_MISSING',
    severity: 'blocking',
    check(r) {
      const missing = [];
      if (isBlank(r.normalized_company_email) && isBlank(r.company_email_raw)) missing.push('email компании');
      if (isBlank(r.company_inn_raw)) missing.push('ИНН');
      if (isBlank(r.normalized_company_name) && isBlank(r.company_name_raw)) missing.push('название компании');
      return missing.length ? `Не заполнено: ${missing.join(', ')}` : null;
    },
  },
  {
    code: 'EMAIL_INVALID',
    severity: 'info',
    check(r) {
      const v = r.normalized_company_email;
      if (isBlank(v)) return null;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : `Email "${v}" не проходит базовую проверку формата`;
    },
  },
  {
    code: 'PHONE_INVALID',
    severity: 'info',
    check(r) {
      const v = r.normalized_company_phone;
      if (isBlank(v)) return null;
      return /^\+7\d{10}$/.test(v) ? null : `Телефон "${v}" не в формате +7XXXXXXXXXX`;
    },
  },
  {
    code: 'TIMELINE_INVALID',
    severity: 'blocking',
    check(r) {
      if (isBlank(r.normalized_planned_start) || isBlank(r.normalized_planned_end)) return null;
      return r.normalized_planned_end <= r.normalized_planned_start
        ? `Срок окончания (${r.normalized_planned_end}) не позже начала (${r.normalized_planned_start})`
        : null;
    },
  },
  {
    code: 'DURATION_MISMATCH',
    severity: 'info',
    check(r) {
      if (isBlank(r.normalized_planned_start) || isBlank(r.normalized_planned_end) || isBlank(r.duration_raw)) return null;
      const parsedDays = normalizeDuration(r.duration_raw).value;
      if (!parsedDays) return null;
      const start = new Date(r.normalized_planned_start);
      const end = new Date(r.normalized_planned_end);
      const actualDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (actualDays <= 0) return null;
      const diffRatio = Math.abs(actualDays - parsedDays) / actualDays;
      return diffRatio > 0.2
        ? `duration_raw подразумевает ${parsedDays} дн., а по датам получается ${actualDays} дн.`
        : null;
    },
  },
  {
    code: 'BUDGET_INVALID',
    severity: 'info',
    check(r) {
      if (r.normalized_budget_amount === null || r.normalized_budget_amount === undefined) {
        return isBlank(r.budget_raw) ? null : `Бюджет не распознан из значения "${r.budget_raw}"`;
      }
      return r.normalized_budget_amount <= 0 ? `Бюджет ${r.normalized_budget_amount} <= 0` : null;
    },
  },
  {
    code: 'CURRENCY_UNKNOWN',
    severity: 'info',
    check(r) {
      if (isBlank(r.currency_raw)) return null;
      return isBlank(r.normalized_currency_code) ? `Валюта "${r.currency_raw}" не распознана` : null;
    },
  },
  {
    code: 'STATUS_UNRECOGNIZED',
    severity: 'info',
    check(r) {
      if (isBlank(r.project_status_raw)) return null;
      return KNOWN_STATUS_KEYS.has(normalizeStatusKey(r.project_status_raw))
        ? null
        : `Статус "${r.project_status_raw}" не распознан`;
    },
  },
  {
    code: 'NO_COMPANY_MATCH',
    severity: 'blocking',
    check(r) {
      return isBlank(r.company_link) ? 'Компания не найдена/не подтверждена' : null;
    },
  },
  {
    code: 'NO_CLASSIFICATION',
    severity: 'blocking',
    check(r) {
      return isBlank(r.suggested_project_type) ? 'Тип проекта не определён' : null;
    },
  },
];

/** @returns {Array} AnomalyFlag[] для ОДНОЙ заявки — правила из RULES, каждое независимо. */
function detectAnomalies(record) {
  const flags = [];
  for (const rule of RULES) {
    const message = rule.check(record);
    if (message) flags.push({ recordId: record.id, code: rule.code, severity: rule.severity, message });
  }
  return flags;
}

/**
 * DUPLICATE_ID_CONFLICT — единственное правило, которому нужен контекст ВСЕГО батча (та же
 * application_id_raw у другой заявки с другой компанией/бюджетом), поэтому оно не влезает
 * в сигнатуру detectAnomalies(record) и считается отдельно.
 * @returns {Map<string, Array>} recordId -> AnomalyFlag[]
 */
function findDuplicateIdConflicts(applications) {
  const byAppId = new Map();
  for (const app of applications) {
    if (isBlank(app.application_id_raw)) continue;
    if (!byAppId.has(app.application_id_raw)) byAppId.set(app.application_id_raw, []);
    byAppId.get(app.application_id_raw).push(app);
  }

  const flagsByRecord = new Map();
  for (const group of byAppId.values()) {
    if (group.length < 2) continue;
    const distinctCompanies = new Set(group.map((a) => a.normalized_company_name || a.company_name_raw));
    const distinctBudgets = new Set(group.map((a) => a.normalized_budget_amount ?? a.budget_raw));
    if (distinctCompanies.size <= 1 && distinctBudgets.size <= 1) continue;
    for (const app of group) {
      if (!flagsByRecord.has(app.id)) flagsByRecord.set(app.id, []);
      flagsByRecord.get(app.id).push({
        recordId: app.id,
        code: 'DUPLICATE_ID_CONFLICT',
        severity: 'info',
        message: `application_id_raw="${app.application_id_raw}" встречается ${group.length} раз(а) с разными компанией/бюджетом`,
      });
    }
  }
  return flagsByRecord;
}

/** @returns {Map<string, Array>} recordId -> AnomalyFlag[] — все правила разом, на весь батч. */
function detectAnomaliesForBatch(applications) {
  const conflicts = findDuplicateIdConflicts(applications);
  const byRecord = new Map();
  for (const app of applications) {
    const flags = detectAnomalies(app).concat(conflicts.get(app.id) || []);
    byRecord.set(app.id, flags);
  }
  return byRecord;
}

function isBlocking(flags) {
  return flags.some((f) => f.severity === 'blocking');
}

/** Никогда не возвращает "Ready to Launch", если среди флагов есть хоть один blocking. */
function resolveReadinessStatus(flags) {
  return isBlocking(flags) ? 'Needs Review' : 'Ready to Launch';
}

function makeAnomalyAction(app, field, to) {
  const currentValue = app[field] ?? null;
  return {
    recordId: app.id,
    table: 'applications',
    field,
    from: currentValue,
    to,
    changed: !valuesEqual(currentValue, to),
    confidence: 1, // информационная запись, не решение пользователя — всегда в авто-группе (bulk "ack")
    reason: 'итог проверок аномалий (Milestone 7)',
    kind: 'anomaly-ack',
  };
}

/** Строит Action[] на запись флагов/заметок/готовности — идёт в тот же preview-движок Milestone 4. */
function buildAnomalyActions(applications, flagsByRecord) {
  const actions = [];
  for (const app of applications) {
    const flags = flagsByRecord.get(app.id) || [];
    const codes = flags.length ? flags.map((f) => f.code) : null;
    const notes = flags.length ? flags.map((f) => f.message).join('; ') : null;
    const readiness = resolveReadinessStatus(flags);

    actions.push(makeAnomalyAction(app, 'anomaly_flags', codes));
    actions.push(makeAnomalyAction(app, 'anomaly_notes', notes));
    actions.push(makeAnomalyAction(app, 'readiness_status', readiness));
  }
  return actions;
}

const anomaliesModule = {
  detectAnomalies,
  detectAnomaliesForBatch,
  findDuplicateIdConflicts,
  isBlocking,
  resolveReadinessStatus,
  buildAnomalyActions,
};

if (typeof module !== 'undefined') {
  module.exports = anomaliesModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.anomalies = anomaliesModule;
}

})();


/* ---- src/lib/preview.js ---- */
;(function () {
'use strict';

// Milestone 4 — движок preview/apply. Контракт — solution/plan/milestone-04-preview-engine.md.
// Единственный механизм подтверждения изменений во всём решении: normalize/match/classify
// формируют массивы `Action`, а этот модуль их показывает и применяет — своей логики
// подтверждения у остальных модулей нет.

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js.
let utilLib;

  utilLib = globalThis.CopilotLib.helpers;

const { valuesEqual } = utilLib;

// Дефолтный порог для всего, что не "link"/"classify" — сейчас это normalize (детерминированные
// правила, свой порог 0.5 зашит в самих функциях normalize.js) и anomaly-ack (аномалии всегда
// confidence:1, информационная запись — всегда попадает в авто-группу через этот же дефолт).
const DEFAULT_AUTO_THRESHOLD = 0.5;
const DEFAULT_SHOW_FLOOR = 0.2;
const CLASSIFY_SHOW_FLOOR = 0.2;

function fmt(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function getAutoThreshold(action, config) {
  if (action.kind === 'link') return config.thresholds.matchAuto;
  if (action.kind === 'classify') return config.thresholds.classifyAuto;
  return DEFAULT_AUTO_THRESHOLD;
}

function getShowFloor(action, config) {
  if (action.kind === 'link') return config.thresholds.matchManualLow;
  if (action.kind === 'classify') return CLASSIFY_SHOW_FLOOR;
  return DEFAULT_SHOW_FLOOR;
}

/** Делит pending-действия на авто/ручные (сгруппированные по record+field) и отбрасывает то, что ниже "порога показа". */
function splitActions(actions, config) {
  const auto = [];
  const manualGroupsMap = new Map();

  for (const action of actions) {
    const autoThreshold = getAutoThreshold(action, config);
    if (action.confidence >= autoThreshold) {
      auto.push(action);
      continue;
    }
    const showFloor = getShowFloor(action, config);
    if (action.confidence >= showFloor) {
      const key = `${action.table}::${action.recordId}::${action.field}`;
      if (!manualGroupsMap.has(key)) manualGroupsMap.set(key, []);
      manualGroupsMap.get(key).push(action);
    }
    // ниже showFloor — не показываем вовсе
  }

  const manualGroups = [...manualGroupsMap.values()];
  for (const group of manualGroups) group.sort((a, b) => b.confidence - a.confidence);

  return { auto, manualGroups };
}

// Для normalize-действий "Было" в таблице показывает сырое значение-источник (displayFrom),
// а не текущее значение поля-назначения (from) — оно используется только для идемпотентности
// (см. solution/src/lib/normalize.js) и на первом прогоне обычно пусто.
function displayFrom(a) {
  return a.displayFrom !== undefined ? a.displayFrom : a.from;
}

function printAutoTable(output, auto) {
  const rows = auto.map((a, i) => ({
    '#': i + 1,
    Таблица: a.table,
    Поле: a.field,
    Было: fmt(displayFrom(a)),
    Станет: fmt(a.to),
    Причина: a.reason,
    Уверенность: a.confidence.toFixed(2),
  }));
  output.table(rows);
}

function printManualTable(output, manualGroups) {
  const rows = [];
  manualGroups.forEach((group, gi) => {
    group.forEach((a, oi) => {
      const letter = String.fromCharCode(97 + oi); // a, b, c...
      rows.push({
        '№': `${gi + 1}${letter}`,
        Запись: a.recordId,
        Поле: a.field,
        Вариант: fmt(a.to),
        Причина: a.reason,
        Уверенность: a.confidence.toFixed(2),
      });
    });
  });
  output.table(rows);
}

/** "all" / "none" / "1,3,5-8" -> Set индексов (1-based). Пустая строка трактуется как "all". */
function parseIndexList(answer, max) {
  const trimmed = (answer || '').trim().toLowerCase();
  if (trimmed === '' || trimmed === 'all') return new Set(Array.from({ length: max }, (_, i) => i + 1));
  if (trimmed === 'none') return new Set();
  const out = new Set();
  for (const part of trimmed.split(',').map((s) => s.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const [, a, b] = range;
      for (let i = Number(a); i <= Number(b); i += 1) out.add(i);
    } else if (/^\d+$/.test(part)) {
      out.add(Number(part));
    } else {
      throw new Error(`Не могу разобрать "${part}" в списке номеров ('all' / 'none' / '1,3,5-8')`);
    }
  }
  return out;
}

/** "12b,15a" -> Map(номер группы -> индекс буквы). Пустая строка -> пустой Map (ничего не выбрано, US11). */
function parseGroupSelections(answer, groupCount) {
  const trimmed = (answer || '').trim().toLowerCase();
  const selections = new Map();
  if (!trimmed) return selections;
  for (const part of trimmed.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)([a-z]?)$/);
    if (!m) throw new Error(`Не могу разобрать "${part}" — ожидался номер группы с буквой варианта, например "12b"`);
    const groupIndex = Number(m[1]);
    const letter = m[2];
    if (groupIndex < 1 || groupIndex > groupCount) throw new Error(`Группы ${groupIndex} не существует (всего групп: ${groupCount})`);
    if (selections.has(groupIndex)) throw new Error(`Группа ${groupIndex} упомянута дважды с разными вариантами`);
    selections.set(groupIndex, letter ? letter.charCodeAt(0) - 97 : '__single__');
  }
  return selections;
}

/**
 * Не даём одной опечатке уронить весь прогон: переспрашиваем тот же вопрос, пока `parseFn`
 * не примет ответ. Ошибки самого input.textAsync (например, в скриптованном режиме кончилась
 * очередь заготовленных ответов) сюда не попадают и падают наружу как есть — это не "плохой
 * ввод", а "больше нечем отвечать".
 */
async function askUntilValid(input, output, question, parseFn) {
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const answer = await input.textAsync(question);
    try {
      return parseFn(answer);
    } catch (err) {
      output.text(`[!] ${err.message} Попробуйте ещё раз.`);
    }
  }
}

/**
 * Проверяет и разрешает "сырые" выборы из parseGroupSelections в реальный индекс варианта
 * (0-based) внутри каждой группы — включая случаи, которые раньше падали ПОСЛЕ успешного
 * parseGroupSelections (нужна буква при >1 варианте) или вообще молча игнорировались
 * (несуществующая буква варианта, например "12z" при вариантах только a/b).
 */
function resolveGroupSelections(rawSelections, manualGroups) {
  const resolved = new Map();
  for (const [groupIndex, letterIndex] of rawSelections) {
    const group = manualGroups[groupIndex - 1];
    if (letterIndex === '__single__') {
      if (group.length !== 1) {
        throw new Error(`Группа ${groupIndex}: нужно указать букву варианта (в группе ${group.length} вариантов)`);
      }
      resolved.set(groupIndex, 0);
    } else if (letterIndex < 0 || letterIndex >= group.length) {
      const letter = String.fromCharCode(97 + letterIndex);
      throw new Error(`Группа ${groupIndex}: варианта "${letter}" не существует (всего вариантов: ${group.length})`);
    } else {
      resolved.set(groupIndex, letterIndex);
    }
  }
  return resolved;
}

function parseAndResolveGroupSelections(answer, manualGroups) {
  const raw = parseGroupSelections(answer, manualGroups.length);
  return resolveGroupSelections(raw, manualGroups);
}

function resolveFieldId(config, table, fieldRole) {
  const tableConfig = config.tables[table];
  if (tableConfig && tableConfig.fields && tableConfig.fields[fieldRole]) {
    return tableConfig.fields[fieldRole];
  }
  return fieldRole; // системное поле, которым владеет сам виджет (см. schema.js#SYSTEM_APPLICATION_FIELDS)
}

async function applyActions(sdk, config, applied) {
  const { space } = sdk;
  const byTable = new Map();
  for (const a of applied) {
    if (!byTable.has(a.table)) byTable.set(a.table, new Map());
    const perRecord = byTable.get(a.table);
    if (!perRecord.has(a.recordId)) perRecord.set(a.recordId, {});
    perRecord.get(a.recordId)[resolveFieldId(config, a.table, a.field)] = a.to;
  }

  for (const [table, perRecord] of byTable) {
    const tableConfig = config.tables[table];
    if (!tableConfig) throw new Error(`Таблица "${table}" не настроена в конфигурации`);
    const datasheet = await space.getDatasheetAsync(tableConfig.datasheetId);
    const records = [...perRecord.entries()].map(([id, valuesMap]) => ({ id, valuesMap }));
    if (records.length > 0) await datasheet.updateRecordsAsync(records);
  }
}

/**
 * @param {object} sdk - {space, input, output}
 * @param {Array<object>} actions - массив Action (см. solution/plan/milestone-04-preview-engine.md)
 * @param {object} config - CopilotConfig
 * @param {{groupLabel?: string}} [opts]
 * @returns {Promise<{applied: object[], skipped: object[]}>}
 */
async function runPreviewCycle(sdk, actions, config, opts = {}) {
  const { input, output } = sdk;
  const label = opts.groupLabel ? ` (${opts.groupLabel})` : '';
  const applied = [];
  const skipped = [];

  // Идемпотентность: то, что уже применено (from === to), даже не показываем.
  // skipReason на каждом пропущенном действии — чтобы в отчёте (devtools/run-local.js) было видно
  // ПОЧЕМУ оно пропущено, а не просто голую цифру "пропущено: N".
  const pending = [];
  for (const a of actions) {
    if (valuesEqual(a.from, a.to)) skipped.push({ ...a, skipReason: 'already-applied' });
    else pending.push(a);
  }

  const { auto, manualGroups } = splitActions(pending, config);

  if (auto.length > 0) {
    output.markdown(`### Автоматически применяемые изменения${label} (${auto.length})`);
    printAutoTable(output, auto);
    const chosen = await askUntilValid(
      input,
      output,
      "Какие строки применить? 'all' / 'none' / номера через запятую, например 1,3,5-8",
      (answer) => parseIndexList(answer, auto.length),
    );
    auto.forEach((a, i) => { if (chosen.has(i + 1)) applied.push(a); else skipped.push({ ...a, skipReason: 'rejected-by-user' }); });
  }

  if (manualGroups.length > 0) {
    output.markdown(`### Неоднозначные случаи${label} (${manualGroups.length})`);
    printManualTable(output, manualGroups);
    const selections = await askUntilValid(
      input,
      output,
      'Для каждой неоднозначной строки укажите вариант (например 12b,15a) или не упоминайте номер, чтобы пропустить',
      (answer) => parseAndResolveGroupSelections(answer, manualGroups),
    );
    manualGroups.forEach((group, gi) => {
      const groupIndex = gi + 1;
      if (!selections.has(groupIndex)) {
        group.forEach((a) => skipped.push({ ...a, skipReason: 'unresolved-ambiguous' }));
        return;
      }
      const letterIndex = selections.get(groupIndex);
      group.forEach((a, oi) => {
        if (oi === letterIndex) applied.push(a);
        else skipped.push({ ...a, skipReason: 'other-option-chosen' });
      });
    });
  }

  await applyActions(sdk, config, applied);

  return { applied, skipped };
}

const previewModule = {
  runPreviewCycle,
  parseIndexList,
  parseGroupSelections,
  resolveGroupSelections,
  parseAndResolveGroupSelections,
  splitActions,
  valuesEqual,
};

if (typeof module !== 'undefined') {
  module.exports = previewModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.preview = previewModule;
}

})();


/* ---- src/widget/main.js ---- */
;(function () {
'use strict';

// Оркестрация Widget Script. Принимает {space, input, output} параметром (не берёт из глобальных
// переменных) — см. solution/PLAN.md#локальная-разработка-и-тестирование-без-доступа-к-mws.
// Один и тот же run() работает и под mock-SDK (devtools/run-local.js), и под реальным MWS —
// последняя строка файла решает, что вызывать в реальном рантайме.
//
// Реализованы Milestones 1-7: настройка -> выбор scope -> нормализация -> дедуп/сопоставление
// со справочниками -> классификация -> базовые аномалии. Задачи/назначение/запуск/отчёт
// (Milestones 8-10) подключаются сюда по мере готовности.

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js.
let configLib;
let normalizeLib;
let previewLib;
let matchLib;
let classifyLib;
let anomaliesLib;

  configLib = globalThis.CopilotLib.config;
  normalizeLib = globalThis.CopilotLib.normalize;
  previewLib = globalThis.CopilotLib.preview;
  matchLib = globalThis.CopilotLib.match;
  classifyLib = globalThis.CopilotLib.classify;
  anomaliesLib = globalThis.CopilotLib.anomalies;


function recordToPlainObject(record, datasheet) {
  const obj = { id: record.id };
  for (const field of datasheet.fields) {
    obj[field.name] = record.getCellValue(field.id);
  }
  return obj;
}

/** После applied-действий одной фазы — обновляет ЛОКАЛЬНЫЕ объекты заявок, чтобы следующая фаза
 * (например match после normalize) видела свежие normalized_*-значения без лишнего перечитывания
 * датасета. */
function mergeApplied(applications, appliedActions) {
  const byId = new Map(applications.map((a) => [a.id, a]));
  for (const action of appliedActions) {
    if (action.table !== 'applications') continue;
    const app = byId.get(action.recordId);
    if (app) app[action.field] = action.to;
  }
}

async function run(sdk) {
  const { space, output } = sdk;
  output.markdown('# Project Launch Copilot — локальный прогон');

  // "Прогрев" — эмпирически обнаружено на реальном MWS: input.textAsync (первый вызов — в мастере
  // настройки внутри loadOrCreateConfig ниже) не реагирует на ввод пользователя, если до него ни
  // разу не было вызвано ни одного space.*Async. Само возвращаемое значение не используется —
  // важен только факт await. См. solution/docs/PLATFORM-NOTES.md.
  if (typeof space.getActiveDatasheetAsync === 'function') {
    await space.getActiveDatasheetAsync().catch(() => null);
  }

  const config = await configLib.loadOrCreateConfig(sdk);
  const scope = await configLib.selectScope(sdk, config);

  const appsDatasheet = await space.getDatasheetAsync(config.tables.applications.datasheetId);
  const records = await scope.view.getRecordsAsync(scope.recordIds ? { recordIds: scope.recordIds } : undefined);
  output.text(`Заявок в выбранном представлении: ${records.length}`);
  const applications = records.map((r) => recordToPlainObject(r, appsDatasheet));

  const companiesDatasheet = await space.getDatasheetAsync(config.tables.companies.datasheetId);
  const companyFields = config.tables.companies.fields;
  const companies = (await companiesDatasheet.getRecordsAsync()).map((r) => recordToPlainObject(r, companiesDatasheet));
  const knownCities = [...new Set(companies.map((c) => c[companyFields.city]).filter(Boolean))];

  // --- Milestone 3: нормализация ---
  const normalizeSuggestions = normalizeLib.buildNormalizationSuggestions(applications, config, { knownCities });
  output.text(`Нормализация: сформировано предложений ${normalizeSuggestions.length}`);
  const normResult = await previewLib.runPreviewCycle(sdk, normalizeSuggestions, config, { groupLabel: 'нормализация' });
  mergeApplied(applications, normResult.applied);

  // --- Milestone 5: дедуп и сопоставление со справочниками ---
  const employeesDatasheet = await space.getDatasheetAsync(config.tables.employees.datasheetId);
  const employeeFields = config.tables.employees.fields;
  const employees = (await employeesDatasheet.getRecordsAsync()).map((r) => recordToPlainObject(r, employeesDatasheet));

  const companyActions = matchLib.findCompanyMatches(applications, companies, config, companyFields);
  const employeeActions = matchLib.findEmployeeMatches(applications, employees, config, employeeFields);
  const { candidates: duplicateActions } = matchLib.findApplicationDuplicates(applications, config);
  const matchActions = [...companyActions, ...employeeActions, ...duplicateActions];
  output.text(`Сопоставление: компании ${companyActions.length}, сотрудники ${employeeActions.length}, дубли заявок ${duplicateActions.length}`);
  const matchResult = await previewLib.runPreviewCycle(sdk, matchActions, config, { groupLabel: 'сопоставление со справочниками' });
  mergeApplied(applications, matchResult.applied);

  // --- Milestone 6: классификация типа и приоритета ---
  const templatesDatasheet = await space.getDatasheetAsync(config.tables.templates.datasheetId);
  const templates = (await templatesDatasheet.getRecordsAsync()).map((r) => recordToPlainObject(r, templatesDatasheet));
  const typeIndex = classifyLib.buildCanonicalTypeIndex(templates, config.tables.templates.fields);
  const { actions: classifyActions } = classifyLib.classifyApplications(applications, typeIndex, config);
  output.text(`Классификация: предложений ${classifyActions.length} (канонических типов в справочнике: ${typeIndex.size})`);
  const classifyResult = await previewLib.runPreviewCycle(sdk, classifyActions, config, { groupLabel: 'классификация' });
  mergeApplied(applications, classifyResult.applied);

  // --- Milestone 7: базовые проверки аномалий ---
  const flagsByRecord = anomaliesLib.detectAnomaliesForBatch(applications);
  const flaggedCount = [...flagsByRecord.values()].filter((flags) => flags.length > 0).length;
  output.text(`Аномалии: заявок с хотя бы одним флагом ${flaggedCount} из ${applications.length}`);
  const anomalyActions = anomaliesLib.buildAnomalyActions(applications, flagsByRecord);
  const anomalyResult = await previewLib.runPreviewCycle(sdk, anomalyActions, config, { groupLabel: 'аномалии' });
  mergeApplied(applications, anomalyResult.applied);

  const summaryCounts = {
    checked: applications.length,
    normalizeFixed: normResult.applied.length,
    matchLinked: matchResult.applied.length,
    classified: classifyResult.applied.length,
    anomaliesAcked: anomalyResult.applied.length,
  };
  output.markdown(`## Итог\n${Object.entries(summaryCounts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`);

  return {
    ...summaryCounts,
    appliedActions: [
      ...normResult.applied, ...matchResult.applied, ...classifyResult.applied, ...anomalyResult.applied,
    ],
    skippedActions: [
      ...normResult.skipped, ...matchResult.skipped, ...classifyResult.skipped, ...anomalyResult.skipped,
    ],
  };
}

const widgetModule = { run };

if (typeof module !== 'undefined') module.exports = widgetModule;
// eslint-disable-next-line no-undef
if (typeof space !== 'undefined' && typeof input !== 'undefined' && typeof output !== 'undefined') {
  // eslint-disable-next-line no-undef
  run({ space, input, output });
}

})();
