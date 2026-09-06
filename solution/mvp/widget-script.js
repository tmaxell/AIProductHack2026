/* ============================================================
   MOCK Widget Script — "Project Launch Copilot"
   Имитация выполнения в MWS Tables (Script Widget).
   Реализует Этап 2 (валидация и нормализация) + базу Matching.
   ============================================================ */

// --- Логика валидации (та же, что будет в реальном Widget Script) ---

function normalizeEmail(raw) {
  if (!raw) return { value: null, changed: false, issues: [] };
  let v = String(raw).trim().toLowerCase();
  v = v.replace(/^mailto:/i, '').replace(/\s+/g, '').replace(/;$/, '').trim();
  const issues = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) issues.push({ type: 'error', code: 'INVALID_EMAIL', msg: 'Некорректный email' });
  const changed = String(raw).trim() !== v;
  return { value: v, changed, issues };
}

function normalizePhone(raw) {
  if (!raw) return { value: null, changed: false, issues: [] };
  let v = String(raw).replace(/[^\d]/g, '');
  const issues = [];
  if (v.length === 10) v = '7' + v;
  if (v.length === 11 && v[0] === '8') v = '7' + v.slice(1);
  if (/^\*+$/.test(String(raw).replace(/[^\d*]/g, '')) || (String(raw).includes('*'))) {
    issues.push({ type: 'warn', code: 'MASKED_PHONE', msg: 'Номер маскирован (*)' });
  }
  if (v.length < 10 || v.length > 12) issues.push({ type: 'error', code: 'BAD_PHONE', msg: 'Некорректная длина телефона' });
  if (v.length === 11) v = '+' + v;
  const changed = String(raw).trim() !== v;
  return { value: v, changed, issues };
}

function normalizeInn(raw) {
  if (!raw) return { value: null, changed: false, issues: [] };
  let v = String(raw).toUpperCase().replace(/^ИНН\s*/i, '').replace(/\s+/g, '').replace(/\.0$/, '').trim();
  const issues = [];
  if (!/^\d{10}$|^\d{12}$/.test(v) && !/(\d{2})-(\d{2})/.test(v)) {
    if (!/^\d+$/.test(v)) issues.push({ type: 'error', code: 'BAD_INN', msg: 'ИНН не число' });
    else issues.push({ type: 'error', code: 'BAD_INN_LEN', msg: 'ИНН: ожидается 10 или 12 цифр' });
  }
  const changed = String(raw).trim() !== v;
  return { value: v, changed, issues };
}

function normalizeCity(raw) {
  if (!raw) return { value: null, changed: false, issues: [] };
  let v = String(raw).replace(/\s+/g, ' ').trim().replace(/^[Гг]\s*/, '');
  const issues = [];
  // Чиним известные/латинские варианты
  const map = {
    'Vladivostok': 'Владивосток', 'Krasnoyarsk': 'Красноярск', 'Nsk': 'Новосибирск',
    'Екб': 'Екатеринбург', 'Нск': 'Новосибирск', 'Спб': 'Санкт-Петербург',
    'Мск': 'Москва', 'Члб': 'Челябинск', 'Оренб': 'Оренбург', 'Томс': 'Томск'
  };
  const normKey = Object.keys(map).find(k => v.toLowerCase() === k.toLowerCase());
  if (normKey) { v = map[normKey]; }
  if (/[A-Za-z]/.test(v)) issues.push({ type: 'info', code: 'LATIN_CITY', msg: 'Название города латиницей — будет кириллица' });
  const changed = String(raw).trim() !== v;
  return { value: v, changed, issues };
}

function normalizeFio(raw) {
  if (!raw) return { value: null, changed: false, issues: [] };
  const parts = String(raw).replace(/\s+/g, ' ').trim().split(' ');
  const issues = [];
  if (parts.length < 2) issues.push({ type: 'warn', code: 'SHORT_FIO', msg: 'ФИО слишком короткое' });
  const capitalized = parts.map(p => {
    if (!p) return p;
    // Фамилия И.О. формат
    if (/^[А-ЯA-Z]\.$/.test(p)) return p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }).join(' ');
  const changed = String(raw).trim() !== capitalized;
  return { value: capitalized, changed, issues };
}

function normalizeBudget(raw) {
  if (!raw) return { value: null, changed: false, issues: [] };
  let v = String(raw).trim();
  const issues = [];
  // Убираем пробелы/неразрывные пробелы и отделяем валюту (`RUB`, `RUR`, `₽`, `руб., рубли`)
  let numMatch = v.replace(/[\s\u00A0]/g, '');
  numMatch = numMatch.replace(/^(RUB|RUR|₽|руб|рубли|РУБ|РУБЛИ|₽)/i, '')
                     .replace(/(RUB|RUR|₽|руб|рубли|РУБ|РУБЛИ|₽)$/i, '')
                     .replace(/[₽]/g, '')
                     .trim();
  let cleaned = numMatch;
  // "2,08 млн" / "4081 тыс." / "1 967 000" / "4 603 000 ₽"
  let num = null;
  const million = numMatch.match(/^([\d.,]+)\s*млн/i);
  const thousand = numMatch.match(/^([\d.,]+)\s*тыс/i);
  const plain = numMatch.match(/^[\d.,]+$/);
  if (million) {
    num = parseFloat(million[1].replace(',', '.')) * 1e6;
    cleaned = String(Math.round(num));
  } else if (thousand) {
    num = parseFloat(thousand[1].replace(',', '.')) * 1e3;
    cleaned = String(Math.round(num));
  } else if (plain) {
    num = parseFloat(plain[0].replace(',', '.'));
    cleaned = String(Math.round(num));
  } else {
    issues.push({ type: 'error', code: 'BAD_BUDGET', msg: 'Формат бюджета не распознан' });
  }
  let anomaly = null;
  if (num !== null) {
    if (num <= 0) issues.push({ type: 'error', code: 'ZERO_BUDGET', msg: 'Бюджет ≤ 0' });
    if (num > 1e8) { issues.push({ type: 'warn', code: 'HUGE_BUDGET', msg: 'Бюджет аномально велик (>100 млн)' }); anomaly = true; }
    if (num < 10000) issues.push({ type: 'warn', code: 'TINY_BUDGET', msg: 'Бюджет подозрительно мал (<10 тыс)' }); 
  }
  const changed = String(raw).trim() !== cleaned;
  return { value: cleaned, changed, issues, anomaly };
}

function normalizeDate(raw) {
  if (!raw) return { value: null, changed: false, issues: [] };
  let v = String(raw).trim();
  const issues = [];
  let d = null;
  // ISO
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  // DD.MM.YYYY or DD/MM/YYYY
  const ru = v.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
  // DD Month YYYY (Russian)
  const months = { 'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4, 'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8, 'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12 };
  const ruLong = v.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  const slashDDMMYY = v.match(/^(\d{2})[./](\d{2})[./](\d{2})(\d{2})$/);
  const ddmmYY = v.match(/^(\d{2})[./](\d{2})[./](\d{2})$/); // 06.02.27
  if (iso) d = new Date(iso[1], iso[2]-1, iso[3]);
  else if (ru) d = new Date(ru[3], ru[2]-1, ru[1]);
  else if (slashDDMMYY) d = new Date(slashDDMMYY[3], slashDDMMYY[2]-1, slashDDMMYY[1]);
  else if (ddmmYY) d = new Date(Number('20' + ddmmYY[3]), ddmmYY[2]-1, ddmmYY[1]);
  else if (ruLong) { const m = months[ruLong[2].toLowerCase()]; if (m) d = new Date(ruLong[3], m-1, ruLong[1]); }
  if (!d || isNaN(d)) { issues.push({ type: 'error', code: 'BAD_DATE', msg: 'Дата не распознана' }); return { value: v, changed: false, issues }; }
  if (d.getFullYear() < 2020 || d.getFullYear() > 2035) issues.push({ type: 'warn', code: 'ODD_DATE', msg: 'Дата вне разумного диапазона' });
  const out = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const changed = out !== String(raw).trim().slice(0,10);
  return { value: out, changed, issues };
}

function normalizeCompany(raw) {
  if (!raw) return { value: null, changed: false, issues: [] };
  let v = String(raw).replace(/\s+/g, ' ').trim();
  const issues = [];
  // Убрать ОПФ
  v = v.replace(/^(ООО|ОАО|ЗАО|АО|ИП|ПАО)\s*[«"]?\s*/i, '').replace(/[»"]\s*$/g, '').replace(/\s*[«"]/g, '');
  // Generic name (после "/")
  v = v.replace(/^.*\/\s*/, '');
  v = v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  if (/[A-Za-z]/.test(String(raw))) issues.push({ type: 'info', code: 'LATIN_COMPANY', msg: 'Название латиницей' });
  const changed = true;
  return { value: v, changed, issues };
}

function normalizeProjectName(raw) {
  if (!raw) return { value: null, changed: false, issues: [] };
  let v = String(raw).replace(/\s+/g, ' ').trim();
  v = v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return { value: v, changed: true, issues: [] };
}

// --- Валидация строки целиком ---
function validateRow(row) {
  const issues = [];
  const changes = [];

  // Email компании
  const em = normalizeEmail(row.company_email);
  if (em.value !== null) {
    row._companyEmailOk = !em.issues.some(i => i.type === 'error');
    if (em.changed) changes.push({ field: 'company_email', from: row.company_email, to: em.value, reason: 'Нормализация email' });
    if (em.issues.length) row._issuesEmail = em.issues;
  }

  // Телефон компании
  const ph = normalizePhone(row.company_phone);
  if (ph.value !== null) {
    row._companyPhoneOk = !ph.issues.some(i => i.type === 'error');
    if (ph.changed) changes.push({ field: 'company_phone', from: row.company_phone, to: ph.value, reason: 'Нормализация телефона' });
    if (ph.issues.length) row._issuesPhone = ph.issues;
  }

  // ИНН
  const inn = normalizeInn(row.company_inn);
  if (inn.value !== null) {
    row._innOk = !inn.issues.some(i => i.type === 'error');
    if (inn.changed) changes.push({ field: 'company_inn', from: row.company_inn, to: inn.value, reason: 'Нормализация ИНН' });
    if (inn.issues.length) row._issuesInn = inn.issues;
  }

  // Город
  const city = normalizeCity(row.company_city);
  if (city.value !== null) {
    row._cityOk = !city.issues.some(i => i.type === 'error');
    if (city.changed) changes.push({ field: 'company_city', from: row.company_city, to: city.value, reason: 'Нормализация города' });
    if (city.issues.length) row._issuesCity = city.issues;
  }

  // ФИО
  const fio = normalizeFio(row.requester_fio);
  if (fio.value !== null) {
    row._fioOk = !fio.issues.some(i => i.type === 'error');
    if (fio.changed) changes.push({ field: 'requester_fio', from: row.requester_fio, to: fio.value, reason: 'Нормализация ФИО' });
    if (fio.issues.length) row._issuesFio = fio.issues;
  }

  // Бюджет
  const bud = normalizeBudget(row.budget);
  if (bud.value !== null) {
    row._budgetOk = !bud.issues.some(i => i.type === 'error');
    row._budgetAnomaly = bud.anomaly || false;
    if (bud.changed) changes.push({ field: 'budget', from: row.budget, to: bud.value, reason: 'Нормализация бюджета' });
    if (bud.issues.length) row._issuesBudget = bud.issues;
  }

  // Даты
  const ds = normalizeDate(row.planned_start);
  const de = normalizeDate(row.planned_end);
  if (ds.value !== null) {
    row._startOk = !ds.issues.some(i => i.type === 'error');
    if (ds.changed) changes.push({ field: 'planned_start', from: row.planned_start, to: ds.value, reason: 'Нормализация даты начала' });
    if (ds.issues.length) row._issuesStart = ds.issues;
  }
  if (de.value !== null) {
    row._endOk = !de.issues.some(i => i.type === 'error');
    if (de.changed) changes.push({ field: 'planned_end', from: row.planned_end, to: de.value, reason: 'Нормализация даты окончания' });
    if (de.issues.length) row._issuesEnd = de.issues;
  }
  // Проверка start <= end
  if (ds.value && de.value && /^\d{4}-\d{2}-\d{2}/.test(ds.value) && /^\d{4}-\d{2}-\d{2}/.test(de.value)) {
    if (ds.value > de.value) {
      issues.push({ type: 'error', code: 'REVERSED_DATES', msg: 'Дата окончания раньше даты начала' });
      row._issuesDates = [{ type: 'error', code: 'REVERSED_DATES', msg: 'Дата окончания раньше даты начала' }];
    }
  }

  // Агрегация общих issues
  const allIssueGroups = [row._issuesEmail, row._issuesPhone, row._issuesInn, row._issuesCity, row._issuesFio, row._issuesBudget, row._issuesStart, row._issuesEnd, row._issuesDates];
  const aggregated = [];
  allIssueGroups.forEach(g => { if (g) g.forEach(i => aggregated.push(i)); });

  return {
    issues: aggregated,
    changes,
    hasError: aggregated.some(i => i.type === 'error'),
    hasWarn: aggregated.some(i => i.type === 'warn'),
    ok: !aggregated.some(i => i.type === 'error')
  };
}

// --- Консольный лог виджета (имитация) ---
function widgetConsoleLog(lines) {
  const buf = [];
  buf.push('/* Project Launch Copilot — Widget Script */');
  buf.push('Запуск: ' + new Date().toLocaleString('ru-RU'));
  buf.push('---');
  lines.forEach(l => buf.push(l));
  return buf.join('\n');
}

// Экспорт для использования из HTML
window.LPC = {
  normalizeEmail, normalizePhone, normalizeInn, normalizeCity, normalizeFio, normalizeBudget, normalizeDate, normalizeCompany, normalizeProjectName,
  validateRow, widgetConsoleLog
};