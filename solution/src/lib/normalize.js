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
  const value = String(raw).replace(/[ ​]/g, ' ').replace(/\s+/g, ' ').trim();
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
