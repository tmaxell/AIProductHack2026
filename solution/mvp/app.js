/* ============================================================
   app.js — presentation layer локального mock MVP:
   рендер таблицы, состояния виджета и отчёт «было → стало».
   Доменная логика нормализации живёт в widget-script.js.
   ============================================================ */

const records = window.MVP_DATA || [];

let selectedRows = new Set();
let searchQuery = '';
let hasRun = false;          // проверка хотя бы раз выполнена
let applyMode = false;       // нормализации применены к данным
let reportRules = [];        // правила текущего отчёта
let reportRuleIndex = 0;

// Снимок фактически применённых изменений: нужен, чтобы состояние
// «применено» показывало реальные числа, а не результат повторной проверки.
let appliedSnapshot = [];
let appliedChangeCount = 0;
let appliedRecordCount = 0;

/* ---------- утилиты ---------- */

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function pluralRu(n, one, few, many) {
  const n10 = Math.abs(n) % 10;
  const n100 = Math.abs(n) % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

function recordsWord(n) { return pluralRu(n, 'запись', 'записи', 'записей'); }
function changesWord(n) { return pluralRu(n, 'изменение', 'изменения', 'изменений'); }

let toastTimer = null;
function showToast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 200);
  }, 3200);
}

/* ---------- таблица ---------- */

function statusData(statusRaw) {
  const s = String(statusRaw || '').trim().toLowerCase();
  if (['новая', 'new'].includes(s)) return { label: 'Новая', cls: 'b-ok' };
  if (['на проверке', 'review'].includes(s)) return { label: 'На проверке', cls: 'b-review' };
  if (['черновик', 'draft'].includes(s)) return { label: 'Черновик', cls: 'b-info' };
  return { label: statusRaw || '—', cls: 'b-info' };
}

/* Единая колонка «Проверка»: до запуска — нейтральное «Не проверено». */
function checkInfo(row) {
  if (!hasRun) return { label: 'Не проверено', cls: 'b-neutral' };
  const issues = row._validationIssues || [];
  const err = issues.filter(i => i.type === 'error').length;
  const warn = issues.filter(i => i.type === 'warn').length;
  const info = issues.filter(i => i.type === 'info').length;
  if (err) return { label: err + ' ' + pluralRu(err, 'ошибка', 'ошибки', 'ошибок'), cls: 'b-error' };
  if (warn) return { label: warn + ' ' + pluralRu(warn, 'предупреждение', 'предупреждения', 'предупреждений'), cls: 'b-review' };
  if (info) return { label: info + ' ' + pluralRu(info, 'замечание', 'замечания', 'замечаний'), cls: 'b-info' };
  return { label: 'Без замечаний', cls: 'b-ok' };
}

function visibleRecords() {
  if (!searchQuery) return records;
  const s = searchQuery.toLowerCase();
  return records.filter(r => [r.project_name, r.company_name, r.company_city, r.company_inn, r.application_id, r.requester_email]
    .some(v => String(v || '').toLowerCase().includes(s)));
}

function renderTable() {
  const tbody = document.getElementById('gridBody');
  if (!tbody) return;
  const list = visibleRecords();
  tbody.innerHTML = '';
  list.forEach((row, idx) => {
    const st = statusData(row.status);
    const chk = checkInfo(row);
    const tr = document.createElement('tr');
    if (hasRun && row._validationError) tr.classList.add('flagged');
    if (selectedRows.has(row.row_id)) tr.classList.add('selected');
    const shortId = String(row.application_id || '').slice(0, 12);
    tr.innerHTML =
      '<td class="col-check"><input type="checkbox" aria-label="Выбрать заявку ' + escapeHtml(row.application_id) + '" ' +
        (selectedRows.has(row.row_id) ? 'checked' : '') + ' onclick="toggleRow(event,\'' + row.row_id + '\')"></td>' +
      '<td class="col-num">' + (idx + 1) + '</td>' +
      '<td class="col-id" title="' + escapeHtml(row.application_id) + '">' + escapeHtml(shortId) + '</td>' +
      '<td class="col-primary" title="' + escapeHtml(row.project_name) + '"><span class="cell">' + escapeHtml(row.project_name) + '</span></td>' +
      '<td title="' + escapeHtml(row.company_name) + '"><span class="cell">' + escapeHtml(row.company_name) + '</span></td>' +
      '<td>' + escapeHtml(row.company_city) + '</td>' +
      '<td>' + escapeHtml(row.budget) + '</td>' +
      '<td>' + escapeHtml(row.planned_start) + '</td>' +
      '<td>' + escapeHtml(row.planned_end) + '</td>' +
      '<td><span class="badge ' + st.cls + '"><span class="dot"></span>' + escapeHtml(st.label) + '</span></td>' +
      '<td><span class="badge ' + chk.cls + '"><span class="dot"></span>' + escapeHtml(chk.label) + '</span></td>';
    tbody.appendChild(tr);
  });
  document.getElementById('rowCount').textContent = list.length + ' ' + recordsWord(list.length);
}

function toggleRow(e, id) {
  e.stopPropagation();
  if (selectedRows.has(id)) selectedRows.delete(id);
  else selectedRows.add(id);
  renderTable();
}

function toggleAll(cb) {
  visibleRecords().forEach(r => { if (cb.checked) selectedRows.add(r.row_id); else selectedRows.delete(r.row_id); });
  renderTable();
}

function onSearch(q) {
  searchQuery = (q || '').trim();
  renderTable();
}

/* ---------- панель виджета ---------- */

function toggleWidget() {
  const panel = document.getElementById('widgetPanel');
  const reopen = document.getElementById('widgetReopen');
  const collapsed = panel.classList.toggle('collapsed');
  panel.hidden = collapsed;
  reopen.hidden = !collapsed;
  if (!collapsed) panel.querySelector('.wp-header .icon-btn').focus();
  else reopen.focus();
}

/* Настройка нижней панели действий: не более одной primary-кнопки. */
function setActions(primary, secondary) {
  const p = document.getElementById('primaryBtn');
  const s = document.getElementById('secondaryBtn');

  if (primary) {
    p.hidden = false;
    p.textContent = primary.label;
    p.onclick = primary.onClick;
  } else {
    p.hidden = true;
    p.onclick = null;
  }

  if (secondary) {
    s.hidden = false;
    s.textContent = secondary.label;
    s.disabled = !!secondary.disabled;
    s.className = secondary.variant === 'ghost' ? 'btn-ghost block' : 'btn-link';
    s.onclick = secondary.disabled ? null : secondary.onClick;
    s.title = secondary.title || '';
  } else {
    s.hidden = true;
    s.onclick = null;
  }
}

/* ---------- проверка ---------- */

// validateRow агрегирует issues из полей самой строки и не очищает их,
// поэтому перед повторным запуском сбрасываем результат прошлой проверки.
const ISSUE_KEYS = ['_issuesEmail', '_issuesPhone', '_issuesInn', '_issuesCity',
  '_issuesFio', '_issuesBudget', '_issuesStart', '_issuesEnd', '_issuesDates'];

function validateAll() {
  records.forEach(row => {
    ISSUE_KEYS.forEach(k => { delete row[k]; });
    const res = window.LPC.validateRow(row);
    row._validationOk = res.ok;
    row._validationError = res.hasError;
    row._validationIssues = res.issues;
    row._validationChanges = res.changes;
  });
}

/* Метаданные правил валидации — порядок совпадает с порядком страниц отчёта. */
const RULE_META = [
  { key: 'company_email', field: 'company_email', name: 'Email компании', reason: 'Приведение email к нижнему регистру и удаление пробелов', group: 'Контакты' },
  { key: 'company_phone', field: 'company_phone', name: 'Телефон компании', reason: 'Приведение телефона к единому формату', group: 'Контакты' },
  { key: 'company_inn', field: 'company_inn', name: 'ИНН компании', reason: 'Удаление префикса «ИНН» и пробелов', group: 'Реквизиты' },
  { key: 'company_city', field: 'company_city', name: 'Город', reason: 'Нормализация названия города и транслитерация', group: 'География' },
  { key: 'requester_fio', field: 'requester_fio', name: 'ФИО заявителя', reason: 'Приведение ФИО к единому регистру', group: 'Контакты' },
  { key: 'budget', field: 'budget', name: 'Бюджет', reason: 'Очистка валюты и приведение к числовому виду', group: 'Финансы' },
  { key: 'planned_start', field: 'planned_start', name: 'Дата начала', reason: 'Приведение даты к формату ГГГГ-ММ-ДД', group: 'Сроки' },
  { key: 'planned_end', field: 'planned_end', name: 'Дата окончания', reason: 'Приведение даты к формату ГГГГ-ММ-ДД', group: 'Сроки' }
];

function collectRuleChanges() {
  const ruleMap = {};
  RULE_META.forEach(r => { ruleMap[r.key] = { meta: r, items: [] }; });

  records.forEach(row => {
    (row._validationChanges || []).forEach(c => {
      const meta = RULE_META.find(r => r.field === c.field);
      if (!meta) return;
      ruleMap[meta.key].items.push({
        row_id: row.row_id,
        application_id: row.application_id,
        field: c.field,
        from: c.from,
        to: c.to
      });
    });
  });

  return RULE_META.map(r => ruleMap[r.key]).filter(r => r.items.length > 0);
}

function computeSummary() {
  const issues = records.reduce((acc, r) => acc.concat(r._validationIssues || []), []);
  return {
    total: records.length,
    changes: records.reduce((a, r) => a + (r._validationChanges || []).length, 0),
    attention: issues.filter(i => i.type !== 'error').length,
    blocking: issues.filter(i => i.type === 'error').length
  };
}

function statusRow(label, value, tone) {
  return '<div class="status-row' + (tone ? ' tone-' + tone : '') + '">' +
    '<span class="sr-label">' + escapeHtml(label) + '</span>' +
    '<span class="sr-value">' + value + '</span></div>';
}

function ruleList(rules) {
  if (!rules.length) return '';
  return '<div class="rule-list">' + rules.map(r =>
    '<div class="rule-row"><span class="rr-name">' + escapeHtml(r.meta.name) + '</span>' +
    '<span class="rr-count">' + r.items.length + '</span></div>').join('') + '</div>';
}

/* ---------- состояния виджета ---------- */

function renderWidget() {
  const intro = document.getElementById('widgetIntro');
  const result = document.getElementById('validationSection');

  if (!hasRun) {
    intro.hidden = false;
    result.hidden = true;
    document.getElementById('sourceCount').textContent = records.length + ' ' + recordsWord(records.length);
    setActions(
      { label: 'Проверить данные', onClick: runValidation },
      { label: 'Настройки проверки', disabled: true, title: 'Экран настроек появится на следующей итерации' }
    );
    return;
  }

  intro.hidden = true;
  result.hidden = false;

  const title = document.getElementById('resultTitle');
  const sub = document.getElementById('resultSub');
  const rows = document.getElementById('statusRows');

  if (applyMode) {
    title.textContent = 'Изменения применены';
    sub.textContent = appliedChangeCount + ' ' + changesWord(appliedChangeCount) + ' в ' +
      appliedRecordCount + ' ' + pluralRu(appliedRecordCount, 'записи', 'записях', 'записях');
    rows.innerHTML = '<div class="block-label">Что изменено</div>' + ruleList(appliedSnapshot);
    setActions(null, { label: 'Отменить изменения', variant: 'ghost', onClick: resetNormalizations });
    return;
  }

  const s = computeSummary();
  title.textContent = 'Проверка завершена';
  sub.textContent = s.total + ' ' + recordsWord(s.total) + ' · ' +
    s.changes + ' ' + pluralRu(s.changes, 'предложение', 'предложения', 'предложений');
  rows.innerHTML =
    statusRow('Безопасные исправления', s.changes, s.changes ? 'accent' : null) +
    statusRow('Требуют внимания', s.attention, s.attention ? 'amber' : null) +
    statusRow('Блокирующие ошибки', s.blocking, s.blocking ? 'red' : null);

  if (s.changes) {
    setActions(
      { label: 'Посмотреть изменения', onClick: openReport },
      { label: 'Проверить снова', onClick: runValidation }
    );
  } else {
    setActions({ label: 'Проверить снова', onClick: runValidation }, null);
  }
}

function runValidation() {
  applyMode = false;
  hasRun = true;
  validateAll();
  reportRules = collectRuleChanges();
  renderTable();
  renderWidget();
}

/* ---------- применение и откат ---------- */

function applyNormalizations() {
  appliedSnapshot = collectRuleChanges();
  const touched = new Set();
  let applied = 0;

  records.forEach(row => {
    (row._validationChanges || []).forEach(c => {
      if (row[c.field] === c.to) return;
      row._prevValues = row._prevValues || {};
      if (!(c.field in row._prevValues)) row._prevValues[c.field] = c.from;
      row[c.field] = c.to;
      touched.add(row.row_id);
      applied++;
    });
  });

  appliedChangeCount = applied;
  appliedRecordCount = touched.size;
  applyMode = true;

  // Пересчёт после применения показывает, что повторный запуск идемпотентен.
  validateAll();
  reportRules = appliedSnapshot;
  renderTable();
  renderWidget();
  showToast('Применено ' + applied + ' ' + changesWord(applied) + ' в ' + touched.size + ' ' + recordsWord(touched.size));
}

function resetNormalizations() {
  records.forEach(row => {
    if (!row._prevValues) return;
    Object.keys(row._prevValues).forEach(f => { row[f] = row._prevValues[f]; });
    delete row._prevValues;
  });
  applyMode = false;
  appliedSnapshot = [];
  appliedChangeCount = 0;
  appliedRecordCount = 0;
  validateAll();
  reportRules = collectRuleChanges();
  renderTable();
  renderWidget();
  showToast('Изменения отменены, значения возвращены к исходным');
}

/* ---------- отчёт «было → стало» ---------- */

function openReport() {
  if (!reportRules.length) return;
  reportRuleIndex = 0;
  document.getElementById('reportModal').classList.add('show');
  renderReportPage();
  document.getElementById('reportApplyBtn').focus();
}

function closeReport() {
  document.getElementById('reportModal').classList.remove('show');
  const primary = document.getElementById('primaryBtn');
  if (!primary.hidden) primary.focus();
}

function isReportOpen() {
  return document.getElementById('reportModal').classList.contains('show');
}

function renderReportPage() {
  const rules = reportRules;
  if (!rules.length) return;
  const rule = rules[reportRuleIndex];
  const meta = rule.meta;
  const page = reportRuleIndex + 1;
  const total = rules.length;
  const count = rule.items.length;

  document.getElementById('reportTitle').textContent = 'Изменения: ' + meta.name;
  document.getElementById('reportPageInfo').textContent = page + ' из ' + total;
  document.getElementById('reportRuleBody').innerHTML =
    '<p class="report-reason">' + escapeHtml(meta.reason) + '</p>' +
    '<p class="report-count">' + count + ' ' + recordsWord(count) + '</p>';

  const tbody = document.getElementById('reportTableBody');
  tbody.innerHTML = '';
  rule.items.forEach(ch => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="col-app" title="' + escapeHtml(ch.application_id || ch.row_id) + '">' + escapeHtml(ch.application_id || ch.row_id) + '</td>' +
      '<td class="cell-from" title="' + escapeHtml(ch.from) + '">' + escapeHtml(ch.from || '—') + '</td>' +
      '<td class="cell-to" title="' + escapeHtml(ch.to) + '">' + escapeHtml(ch.to || '—') + '</td>';
    tbody.appendChild(tr);
  });

  document.getElementById('reportPrev').disabled = page <= 1;
  document.getElementById('reportNext').disabled = page >= total;

  const applyBtn = document.getElementById('reportApplyBtn');
  const totalChanges = rules.reduce((a, r) => a + r.items.length, 0);
  applyBtn.hidden = applyMode;
  applyBtn.textContent = 'Применить все ' + totalChanges;
}

function reportPrev() { if (reportRuleIndex > 0) { reportRuleIndex--; renderReportPage(); } }
function reportNext() { if (reportRuleIndex < reportRules.length - 1) { reportRuleIndex++; renderReportPage(); } }

function applyFromReport() {
  closeReport();
  applyNormalizations();
}

/* ---------- инициализация ---------- */

document.addEventListener('DOMContentLoaded', () => {
  records.forEach(r => { r._validationIssues = []; r._validationChanges = []; });
  renderTable();
  renderWidget();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isReportOpen()) closeReport();
});
