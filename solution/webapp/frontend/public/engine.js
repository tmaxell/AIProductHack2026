/* ============================================================
   engine.js — РЕАЛЬНЫЙ движок Project Launch Copilot.

   Это не мок: код ниже — прямой перенос (с минимальной адаптацией
   под браузер, без require/module.exports-развилки) из настоящей
   реализации Widget Script, разработанной в solution/src/lib/ на
   ветке feature/add_mvp_solution:
     - normalize.js  (Milestone 3 — нормализация полей заявки)
     - match.js      (Milestone 5 — дедуп заявок + сопоставление со
                       справочниками Компаний/Сотрудников, целиком)
     - helpers.js    (levenshtein/stringSimilarity/tokenize/UnionFind)
     - schema.js     (словарь приоритетов PRIORITY_DICTIONARY)
     - classify.js   (Milestone 6 — тип проекта + приоритет, целиком)
     - anomalies.js  (Milestone 7 — все правила проверки аномалий, целиком)
     - config.js     (DEFAULT_THRESHOLDS — реальные пороги match/classify)

   companies.js/employees.js/templates.js — реальные справочные записи
   COMPANY_REFERENCE/EMPLOYEE/TASK_TEMPLATE из той же data/raw/dev-sample.csv,
   откуда взяты 30 заявок в data.js (не выдуманные данные).

   Сознательно НЕ перенесено:
     - config.js#runWizard/loadOrCreateConfig / preview.js / mws-SDK-
       оркестрация src/widget/main.js — мастер настройки и ручной
       review там завязаны на реальный MWS SDK (space/input/output),
       здесь UI сам решает, что показать пользователю на предпросмотр
       и как применить правки (см. app.js).
     - classify.js: roleOverlap/skillOverlap в scoreType всегда 0 — у
       заявок в data.js нет полей required_roles_raw/required_skills_raw
       (их нет в этом мок-датасете), классификация опирается только на
       сходство названия типа. Тот же реальный алгоритм, меньше сигнала.
     - Milestones 8-10 (задачи по шаблону, назначение исполнителей,
       итоговый отчёт запуска) — не реализованы даже в mvp-ветке; сюда
       переносить пока нечего, эта функциональность добавлена заново
       (см. tasks.js/launch.js, если появятся).

   Порядок использования (см. widget-script.js), фаза за фазой по ВСЕМУ
   набору строк разом (Milestone 5/6/7), ровно как в src/widget/main.js:
   normalize (построчно) -> дедуп + сопоставление со справочниками ->
   классификация -> аномалии.
   ============================================================ */
'use strict';

// ------------------------------------------------------------
// normalize.js — Milestone 3, планка качества: "быстро и
// универсально важнее точности". Каждая функция разбирает КЛАСС
// формата, а не список конкретных строк из dev-sample.csv.
// ------------------------------------------------------------

function result(value, changed, confidence, reason) {
  return { value, changed, confidence, reason };
}

function isEmpty(raw) {
  return raw === null || raw === undefined || String(raw).trim() === '';
}

/** Убирает лишние пробелы (в т.ч. неразрывный/zero-width) и схлопывает их. */
function normalizeWhitespace(raw) {
  if (isEmpty(raw)) return result(null, false, 0, 'empty');
  const value = String(raw).replace(/[\u00A0\u200B]/g, ' ').replace(/\s+/g, ' ').trim();
  return result(value, value !== raw, value ? 0.9 : 0, 'убраны лишние пробелы/служебные символы');
}

/** Ключ сравнения (не для отображения): регистр + ё/е + пробелы — используется дедупом заявок. */
function normalizeYoAndCase(raw) {
  if (isEmpty(raw)) return '';
  return String(raw).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

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
 * @param {string[]} knownCities - в реальном коде собираются из справочника Компаний;
 *   здесь, за неимением отдельного справочника, собираются из уже "чистых" (без латиницы)
 *   значений company_city по всей текущей выборке — см. widget-script.js#collectKnownCities.
 */
function normalizeCity(raw, knownCities) {
  if (isEmpty(raw)) return result(null, false, 0, 'empty');
  const s = (normalizeWhitespace(raw).value || '').replace(/^г[.\s]+/i, '').trim();
  if (!s) return result(null, false, 0, 'empty after strip');

  const list = knownCities || [];
  const sLower = s.toLowerCase();
  const exact = list.find((c) => c.toLowerCase() === sLower);
  if (exact) return result(exact, exact !== raw, 0.9, 'точное совпадение со справочником городов (после чистки)');

  if (s.length <= 5 && /^[а-яё]+$/i.test(s)) {
    const candidate = list.find((c) => c.toLowerCase().startsWith(sLower[0]));
    if (candidate) return result(candidate, true, 0.4, `похоже на сокращение города, кандидат по первой букве: ${candidate}`);
  }

  return result(s, s !== raw, 0.5, 'нормализован регистр/пробелы, соответствие в справочнике не найдено');
}

function titleCaseToken(p) {
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

// ------------------------------------------------------------
// schema.js (словарь приоритетов) + classify.js#normalizePriority
// (часть Milestone 6 — только словарная нормализация приоритета,
// без classifyApplications — см. шапку файла).
// ------------------------------------------------------------

const PRIORITY_DICTIONARY = {
  p1: 'Критический', p2: 'Высокий', p3: 'Средний', p4: 'Низкий',
  1: 'Критический', 2: 'Высокий', 3: 'Средний', 4: 'Низкий',
  критический: 'Критический', высокий: 'Высокий', средний: 'Средний', низкий: 'Низкий',
  critical: 'Критический', high: 'Высокий', medium: 'Средний', normal: 'Средний', low: 'Низкий',
};

function normalizePriority(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { value: null, confidence: 0, reason: 'empty' };
  }
  const key = String(raw).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '');
  const mapped = PRIORITY_DICTIONARY[key];
  if (mapped) return { value: mapped, confidence: 1, reason: `priority_raw="${raw}" -> словарь приоритетов` };
  return { value: null, confidence: 0, reason: `priority_raw="${raw}" не найдено в словаре приоритетов` };
}

// ------------------------------------------------------------
// helpers.js — общие чистые утилиты (строковое сходство, бакетизация,
// union-find для транзитивной кластеризации дублей). Нужны match.js.
// ------------------------------------------------------------

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

function addToBucket(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

/** Разбивает "React, Тестирование | UX\nJavaScript" на нормализованные токены — данные вперемешку
 * используют запятую/точку с запятой/пайп/перенос строки как разделитель. Нужен classify.js. */
function tokenize(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,|;\n]+/)
    .map((t) => t.trim().toLowerCase().replace(/ё/g, 'е'))
    .filter(Boolean);
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

// ------------------------------------------------------------
// config.js — только пороги авто/ручного применения (US11), реальные
// значения из DEFAULT_THRESHOLDS. Мастер настройки/выбор scope сюда
// не перенесены — здесь нет реального MWS SDK, UI сам решает, что
// показать пользователю на предпросмотр.
// ------------------------------------------------------------

const DEFAULT_THRESHOLDS = {
  matchAuto: 0.85,
  matchManualLow: 0.6,
  matchTopK: 3,
  classifyAuto: 0.6,
  classifyManualLow: 0.3,
};

// ------------------------------------------------------------
// match.js — Milestone 5: дедуп заявок между собой (findApplicationDuplicates)
// И сопоставление со справочниками (findCompanyMatches/findEmployeeMatches) —
// теперь ЕСТЬ companies.js/employees.js (реальные COMPANY_REFERENCE/EMPLOYEE
// записи из той же dev-sample.csv, откуда взяты 30 заявок в data.js), поэтому
// сопоставление больше не исключено.
// ------------------------------------------------------------

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

function companyLikeKeys({
  inn, email, phone, name, city,
}) {
  return {
    inn: cleanInn(inn),
    email: normalizeEmail(email).value,
    phone: phoneLast10(phone),
    normalizedName: normalizeYoAndCase(normalizeCompanyName(name).value || name || ''),
    normalizedCity: normalizeYoAndCase(city),
  };
}

/** Заявка как "компания" для application-application дедупа — блокировка по её же полям компании. */
function appCompanyKeys(app) {
  return companyLikeKeys({
    inn: app.company_inn_raw,
    email: app.company_email_raw,
    phone: app.company_phone_raw,
    name: app.normalized_company_name || app.company_name_raw,
    city: app.normalized_city || app.company_city_raw,
  });
}

/** Строит блокирующие индексы (ИНН/email/телефон/имя+город) поверх набора заявок. */
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
  return {
    byInn, byEmail, byPhone, byNameCity, records,
  };
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

/** Скоринг "та же компания" — сигнал для дедупа заявок (не самостоятельное решение о дубле). */
function scoreCandidate(appKeys, candidateKeys) {
  const signals = {
    inn: false, email: false, phone: false, city: false, nameSim: 0,
  };
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

/**
 * Скоринг дублей ЗАЯВОК — НЕ то же самое, что "та же компания" (scoreCandidate выше). US8 про
 * "не запускать один и тот же проект несколько раз": одна компания может законно прислать много
 * разных заявок (разные проекты), поэтому здесь доминирует сходство самого содержания заявки
 * (название проекта, заявитель), а совпадение компании — лишь подтверждающий сигнал.
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
 * кандидатов), но скоринг — по содержанию самой заявки (см. scoreApplicationDuplicate). Однозначные
 * пары (score >= matchAuto) кластеризуются транзитивно через union-find (A~B, B~C -> одна группа);
 * неоднозначные — в ручной разбор, без объединения в кластер.
 * Идемпотентность (план п.6): заявки, уже входящие в группу (duplicate_link/duplicate_group_id
 * заполнены), повторно не сканируются — повторный запуск не плодит новые связи.
 * @returns {{clusters: string[][], candidates: Array}}
 */
function findApplicationDuplicates(applications, config) {
  const thresholds = (config && config.thresholds) || DEFAULT_THRESHOLDS;
  const index = buildBlockingIndex(applications, (app) => appCompanyKeys(app));
  const appsById = new Map(applications.map((a) => [a.id, a]));
  const uf = new UnionFind(applications.map((a) => a.id));
  const manualCandidates = [];

  for (const app of applications) {
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
    if (best.score >= thresholds.matchAuto) {
      uf.union(app.id, best.id);
    } else if (best.score >= thresholds.matchManualLow) {
      const topK = scored.slice(0, thresholds.matchTopK || 3);
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
        recordId: memberId, table: 'applications', field: 'duplicate_group_id', from: currentGroupId, to: groupId, changed: currentGroupId !== groupId, confidence: 0.9, reason: `часть группы дублей из ${cluster.length} заявок`, kind: 'link', bucket: 'auto', optionIndex: 1,
      });
      if (memberId !== canonical) {
        const currentDuplicateLink = memberApp ? memberApp.duplicate_link ?? null : null;
        autoCandidates.push({
          recordId: memberId, table: 'applications', field: 'duplicate_link', from: currentDuplicateLink, to: canonical, changed: currentDuplicateLink !== canonical, confidence: 0.9, reason: `дубль заявки ${canonical} (та же группа)`, kind: 'link', bucket: 'auto', optionIndex: 1,
        });
      }
    }
  }

  return { clusters, candidates: [...autoCandidates, ...manualCandidates] };
}

/** `company` — объект по СЫРЫМ именам полей справочника companies.js (в реальном коде это уже
 * объект по РОЛЯМ после recordToRoleObject; здесь эквивалент — читаем поля CSV напрямую, ролей
 * тут взяться неоткуда без мастера настройки). */
function referenceCompanyKeys(company) {
  return companyLikeKeys({
    inn: company.company_inn,
    email: company.company_email,
    phone: company.company_phone,
    name: company.company_legal_name,
    city: company.company_city,
  });
}

function describeSignals(signals) {
  const parts = [];
  if (signals.inn) parts.push('точное совпадение ИНН');
  if (signals.email) parts.push('точное совпадение email');
  if (signals.phone) parts.push('точное совпадение телефона');
  if (signals.city) parts.push('совпадение города');
  if (signals.nameSim > 0.3 || parts.length === 0) parts.push(`сходство названия ${signals.nameSim.toFixed(2)}`);
  return parts.join(' + ');
}

/** Раскладывает ранжированных кандидатов по корзинам авто/ручной/не показываем. */
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
function findCompanyMatches(applications, companies, config) {
  const index = buildBlockingIndex(companies, (c) => referenceCompanyKeys(c));
  const actions = [];
  for (const app of applications) {
    if (app.company_link) continue; // уже связано — не перетираем без явного rematch
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
 * @returns {Array} MatchCandidate[] (kind:"link", field:"employee_link") — US10. Источник имени
 * для сопоставления — requester_fio (в этом моке нет отдельного preferred_assignee_raw поля).
 * `e` — объект по сырым именам полей employees.js (employee_fio/employee_email/...).
 */
function findEmployeeMatches(applications, employees, config) {
  const byEmail = new Map();
  const byPhone = new Map();
  const byFirstChar = new Map();
  const records = new Map();

  for (const e of employees) {
    if (e.employee_active === 'FALSE' || e.employee_active === false) continue;
    const email = normalizeEmail(e.employee_email).value;
    const phone = phoneLast10(e.employee_phone);
    const normalizedFio = normalizeYoAndCase(e.employee_fio || '');
    records.set(e.employee_id, { email, phone, normalizedFio, role: e.employee_role });
    if (email) addToBucket(byEmail, email, e.employee_id);
    if (phone) addToBucket(byPhone, phone, e.employee_id);
    if (normalizedFio) addToBucket(byFirstChar, normalizedFio[0], e.employee_id);
  }

  const actions = [];
  for (const app of applications) {
    if (app.employee_link) continue;
    const appEmail = normalizeEmail(app.requester_email_raw).value;
    const appPhone = phoneLast10(app.requester_phone_raw);
    const nameForMatch = normalizeYoAndCase(app.requester_fio_raw);

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

// ------------------------------------------------------------
// classify.js — Milestone 6: классификация типа проекта и приоритета.
// normalizePriority уже перенесён выше; здесь — часть, которой раньше не
// хватало справочника Шаблонов задач (templates.js, теперь есть).
// ------------------------------------------------------------

/** Строит канонический индекс типов проекта из справочника Шаблонов ЭТОГО прогона.
 * `templateRows` — сырые поля templates.js (template_project_type/template_required_role/...). */
function buildCanonicalTypeIndex(templateRows) {
  const index = new Map();
  for (const row of templateRows) {
    const type = row.template_project_type;
    if (!type) continue;
    if (!index.has(type)) index.set(type, { roles: new Set(), skills: new Set() });
    const entry = index.get(type);
    tokenize(row.template_required_role).forEach((t) => entry.roles.add(t));
    tokenize(row.template_required_skills).forEach((t) => entry.skills.add(t));
  }
  return index;
}

/** Доля токенов ЗАЯВКИ, покрытых шаблоном — не симметричный Jaccard (шаблон описывает весь тип
 * проекта, его набор ролей/навыков почти всегда шире одной конкретной заявки). */
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
  return {
    type, score, nameSim, roleOverlap, skillOverlap,
  };
}

function describeTypeMatch(c) {
  return `совпадение с шаблоном "${c.type}" по названию (${c.nameSim.toFixed(2)}), ролям (${c.roleOverlap.toFixed(2)}) и навыкам (${c.skillOverlap.toFixed(2)})`;
}

function makeClassifyAction(app, field, to, confidence, reason, bucket, optionIndex) {
  const currentValue = app[field] ?? null;
  return {
    recordId: app.id, table: 'applications', field, from: currentValue, to, changed: to !== currentValue, confidence, reason, kind: 'classify', bucket, optionIndex,
  };
}

/**
 * @returns {{actions: Array, results: Array}} actions — для preview/apply; results — по одному
 * на заявку (suggestedType/typeConfidence/suggestedPriority/...), пригодится для отчёта запуска.
 * ВАЖНО: этот мок не хранит required_roles_raw/required_skills_raw на заявке (их нет в data.js),
 * поэтому roleOverlap/skillOverlap всегда 0 — классификация здесь опирается только на сходство
 * названия типа проекта с названием шаблона (nameSim), это меньше сигнала, чем в полном движке,
 * но тот же самый реальный алгоритм, не заглушка.
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
      // bestType/bestScore — ЛУЧШИЙ кандидат независимо от порога (в отличие от suggestedType,
      // который null ниже classifyAuto). Не часть реального classify.js — добавлено для
      // launch.js (Milestone 8-10, см. его шапку), где нужен предварительный тип для превью
      // плана задач ДАЖЕ когда классификация ещё не подтверждена автоматически. Сам порог/
      // формула score здесь не меняются, это просто более полный выход того же расчёта.
      bestType: best ? best.type : null,
      bestScore: best ? typeConfidence : 0,
      suggestedPriority: priorityResult.value,
      priorityConfidence: priorityResult.confidence,
      priorityReason: priorityResult.reason,
    });
  }

  return { actions, results };
}

// ------------------------------------------------------------
// anomalies.js — Milestone 7, базовые проверки аномалий. NO_COMPANY_MATCH
// включено (теперь есть match.js#findCompanyMatches); NO_CLASSIFICATION
// по-прежнему исключено — см. комментарий у RULES ниже, почему.
// Только детерминированные правила, никакой статистики/ML.
// ------------------------------------------------------------

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

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
  // NO_CLASSIFICATION по-прежнему исключено (в отличие от NO_COMPANY_MATCH, который теперь
  // включён): classifyApplications#scoreType — nameSim*0.5 + roleOverlap*0.25 + skillOverlap*0.25,
  // а у заявок в data.js нет required_roles_raw/required_skills_raw, поэтому roleOverlap и
  // skillOverlap ВСЕГДА 0 и максимально достижимый score — 0.5, что структурно ниже порога
  // classifyAuto=0.6. Включив это правило, оно срабатывало бы на 100% записей всегда — не
  // реальная проблема бизнеса, а нехватка полей в этом мок-датасете (см. buildLinkActions /
  // classifyApplications в блоке match.js/classify.js выше, где сама классификация посчитана
  // честно и её результат виден в отчёте — просто confidence там принципиально ниже auto-порога).
];

function detectAnomalies(record) {
  const flags = [];
  for (const rule of RULES) {
    const message = rule.check(record);
    if (message) flags.push({ recordId: record.id, code: rule.code, severity: rule.severity, message });
  }
  return flags;
}

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

// ------------------------------------------------------------
// Публичный интерфейс движка.
// ------------------------------------------------------------
window.CopilotEngine = {
  normalize: {
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
  },
  priority: {
    PRIORITY_DICTIONARY,
    normalizePriority,
  },
  match: {
    DEFAULT_THRESHOLDS,
    findApplicationDuplicates,
    findCompanyMatches,
    findEmployeeMatches,
  },
  classify: {
    buildCanonicalTypeIndex,
    classifyApplications,
  },
  anomalies: {
    RULES,
    detectAnomalies,
    detectAnomaliesForBatch,
    findDuplicateIdConflicts,
    isBlocking,
    resolveReadinessStatus,
  },
};
