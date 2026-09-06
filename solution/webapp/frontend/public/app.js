/* ============================================================
   app.js — presentation layer веб-приложения.
   Правила нормализации живут в backend: здесь только показ данных,
   решения пользователя по отдельным действиям и вызовы API.
   ============================================================ */

const rows = window.MVP_DATA || [];

let selectedRows = new Set();   // scope проверки: пусто = все записи
let searchQuery = '';
let state = 'initial';          // initial | loading | result | applied | error
let errorText = '';

let changeSet = null;           // черновик от backend
let accepted = new Set();       // подтверждённые пользователем действия
let issuesByRecord = new Map(); // recordId → замечания текущего набора
let checkedIds = new Set();     // записи, попавшие в последнюю проверку

let lastApply = null;           // итог применения
let snapshot = null;            // значения до применения, для отката

let reportRules = [];
let reportRuleIndex = 0;

/* ---------- утилиты ---------- */

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function pluralRu(n, one, few, many) {
  const n10 = Math.abs(n) % 10;
  const n100 = Math.abs(n) % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

const recordsWord = (n) => pluralRu(n, 'запись', 'записи', 'записей');
const changesWord = (n) => pluralRu(n, 'изменение', 'изменения', 'изменений');

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
  }, 3600);
}

/* ---------- scope и DTO ---------- */

function scopeRecords() {
  return selectedRows.size ? rows.filter((row) => selectedRows.has(row.row_id)) : rows;
}

/* Служебные поля представления наружу не отправляются. Список полей backend
   определяет сам — фронтенд не повторяет серверные правила. */
function toDto(row) {
  const values = {};
  Object.keys(row).forEach((key) => {
    if (key.startsWith('_') || key === 'row_id') return;
    const value = row[key];
    values[key] = value === undefined || value === null ? null : String(value);
  });
  return { id: row.row_id, values };
}

function mergeBack(updated) {
  const byId = new Map(rows.map((row) => [row.row_id, row]));
  updated.forEach((record) => {
    const row = byId.get(record.id);
    if (!row) return;
    Object.keys(record.values).forEach((field) => { row[field] = record.values[field]; });
  });
}

/* ---------- таблица ---------- */

function statusData(statusRaw) {
  const s = String(statusRaw || '').trim().toLowerCase();
  if (['новая', 'new'].includes(s)) return { label: 'Новая', cls: 'b-ok' };
  if (['на проверке', 'review'].includes(s)) return { label: 'На проверке', cls: 'b-review' };
  if (['черновик', 'draft'].includes(s)) return { label: 'Черновик', cls: 'b-info' };
  return { label: statusRaw || '—', cls: 'b-info' };
}

function checkInfo(row) {
  if (!checkedIds.has(row.row_id)) return { label: 'Не проверено', cls: 'b-neutral' };
  const issues = issuesByRecord.get(row.row_id) || [];
  const err = issues.filter((i) => i.severity === 'error').length;
  const warn = issues.filter((i) => i.severity === 'warning').length;
  const info = issues.filter((i) => i.severity === 'info').length;
  if (err) return { label: err + ' ' + pluralRu(err, 'ошибка', 'ошибки', 'ошибок'), cls: 'b-error' };
  if (warn) return { label: warn + ' ' + pluralRu(warn, 'предупреждение', 'предупреждения', 'предупреждений'), cls: 'b-review' };
  if (info) return { label: info + ' ' + pluralRu(info, 'замечание', 'замечания', 'замечаний'), cls: 'b-info' };
  return { label: 'Без замечаний', cls: 'b-ok' };
}

function visibleRecords() {
  if (!searchQuery) return rows;
  const q = searchQuery.toLowerCase();
  return rows.filter((r) => [r.project_name, r.company_name, r.company_city, r.company_inn, r.application_id, r.requester_email]
    .some((v) => String(v || '').toLowerCase().includes(q)));
}

function renderTable() {
  const tbody = document.getElementById('gridBody');
  if (!tbody) return;
  const list = visibleRecords();
  tbody.innerHTML = '';

  if (!list.length) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    tr.innerHTML = '<td colspan="11">' +
      (rows.length ? 'По запросу «' + escapeHtml(searchQuery) + '» ничего не найдено'
                   : 'В представлении нет записей') + '</td>';
    tbody.appendChild(tr);
    document.getElementById('rowCount').textContent = '0 записей';
    return;
  }

  list.forEach((row, idx) => {
    const st = statusData(row.status);
    const chk = checkInfo(row);
    const issues = issuesByRecord.get(row.row_id) || [];
    const tr = document.createElement('tr');
    if (issues.some((i) => i.severity === 'error')) tr.classList.add('flagged');
    if (selectedRows.has(row.row_id)) tr.classList.add('selected');
    tr.innerHTML =
      '<td class="col-check"><input type="checkbox" aria-label="Выбрать заявку ' + escapeHtml(row.application_id) + '" ' +
        (selectedRows.has(row.row_id) ? 'checked' : '') + ' onclick="toggleRow(event,\'' + row.row_id + '\')"></td>' +
      '<td class="col-num">' + (idx + 1) + '</td>' +
      '<td class="col-primary" title="' + escapeHtml(row.application_id) + ' · ' + escapeHtml(row.project_name) + '"><span class="cell">' + escapeHtml(row.project_name) + '</span></td>' +
      '<td title="' + escapeHtml(row.company_name) + '"><span class="cell">' + escapeHtml(row.company_name) + '</span></td>' +
      '<td>' + escapeHtml(row.company_city) + '</td>' +
      '<td>' + escapeHtml(row.budget) + '</td>' +
      '<td>' + escapeHtml(row.planned_start) + '</td>' +
      '<td>' + escapeHtml(row.planned_end) + '</td>' +
      '<td><span class="badge ' + st.cls + '"><span class="dot"></span>' + escapeHtml(st.label) + '</span></td>' +
      '<td class="col-ref">' + (row.company_ref_id ? escapeHtml(row.company_ref_id) : '<span class="muted">—</span>') + '</td>' +
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
  renderWidget();
}

function toggleAll(cb) {
  visibleRecords().forEach((r) => { if (cb.checked) selectedRows.add(r.row_id); else selectedRows.delete(r.row_id); });
  renderTable();
  renderWidget();
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
  if (collapsed) reopen.focus();
  else panel.querySelector('.wp-header .icon-btn').focus();
}

function setActions(primary, secondary) {
  const p = document.getElementById('primaryBtn');
  const s = document.getElementById('secondaryBtn');

  if (primary) {
    p.hidden = false;
    p.textContent = primary.label;
    p.disabled = !!primary.disabled;
    p.onclick = primary.disabled ? null : primary.onClick;
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

const CONFIDENCE = {
  high: { label: 'высокая', cls: 'b-ok' },
  medium: { label: 'средняя', cls: 'b-review' },
  low: { label: 'низкая', cls: 'b-info' },
};

function confidenceBadge(level) {
  const meta = CONFIDENCE[level] || CONFIDENCE.low;
  return '<span class="badge ' + meta.cls + '"><span class="dot"></span>' + meta.label + '</span>';
}

function statusRow(label, value, tone) {
  return '<div class="status-row' + (tone ? ' tone-' + tone : '') + '">' +
    '<span class="sr-label">' + escapeHtml(label) + '</span>' +
    '<span class="sr-value">' + value + '</span></div>';
}

function ruleList(entries) {
  if (!entries.length) return '';
  return '<div class="rule-list">' + entries.map((entry) =>
    '<div class="rule-row"><span class="rr-name">' + escapeHtml(entry.name) + '</span>' +
    '<span class="rr-count">' + entry.count + '</span></div>').join('') + '</div>';
}

function groupActions(actions) {
  const order = [];
  const byRule = new Map();
  actions.forEach((action) => {
    if (!byRule.has(action.ruleCode)) {
      byRule.set(action.ruleCode, { code: action.ruleCode, name: action.ruleName, reason: action.reason, items: [] });
      order.push(action.ruleCode);
    }
    byRule.get(action.ruleCode).items.push(action);
  });
  return order.map((code) => byRule.get(code));
}

/* ---------- состояния виджета ---------- */

const SECTIONS = ['widgetIntro', 'widgetLoading', 'widgetError', 'validationSection'];

function showSection(id) {
  SECTIONS.forEach((key) => { document.getElementById(key).hidden = key !== id; });
}

function renderWidget() {
  if (state === 'loading') {
    showSection('widgetLoading');
    const n = scopeRecords().length;
    document.getElementById('loadingSub').textContent = 'Обрабатываем ' + n + ' ' + recordsWord(n) + '.';
    setActions({ label: 'Проверяем…', disabled: true }, null);
    return;
  }

  if (state === 'error') {
    showSection('widgetError');
    document.getElementById('errorText').textContent = errorText;
    setActions({ label: 'Повторить', onClick: runCheck }, null);
    return;
  }

  if (state === 'initial') {
    showSection('widgetIntro');
    const n = scopeRecords().length;
    document.getElementById('sourceLabel').textContent = selectedRows.size ? 'Выбранные записи' : 'Источник';
    document.getElementById('sourceCount').textContent = n + ' ' + recordsWord(n);
    setActions(
      { label: 'Проверить данные', onClick: runCheck, disabled: !n },
      { label: 'Настройки проверки', disabled: true, title: 'Экран настроек появится на следующей итерации' },
    );
    return;
  }

  showSection('validationSection');
  const title = document.getElementById('resultTitle');
  const sub = document.getElementById('resultSub');
  const body = document.getElementById('statusRows');

  if (state === 'applied') {
    const appliedCount = lastApply.applied.length;
    const touched = new Set(lastApply.applied.map((a) => a.recordId)).size;
    title.textContent = 'Изменения применены';
    sub.textContent = appliedCount + ' ' + changesWord(appliedCount) + ' в ' +
      touched + ' ' + pluralRu(touched, 'записи', 'записях', 'записях');

    const groups = groupActions(lastApply.applied).map((g) => ({ name: g.name, count: g.items.length }));
    let html = '<div class="block-label">Что изменено</div>' + ruleList(groups);
    if (lastApply.skipped.length) {
      html += '<div class="block-label">Пропущено: ' + lastApply.skipped.length +
        ' — значение уже совпадало с целевым</div>';
    }
    if (changeSet && changeSet.actions.length === 0) {
      html += '<div class="block-label">Повторная проверка не нашла новых изменений</div>';
    }
    body.innerHTML = html;
    setActions(null, { label: 'Отменить изменения', variant: 'ghost', onClick: undoApply });
    return;
  }

  const summary = changeSet.summary;
  title.textContent = 'Проверка завершена';
  sub.textContent = summary.records + ' ' + recordsWord(summary.records) + ' · ' +
    summary.actions + ' ' + pluralRu(summary.actions, 'предложение', 'предложения', 'предложений');

  let html =
    statusRow('Безопасные исправления', summary.normalizations, summary.normalizations ? 'accent' : null) +
    statusRow('Связи со справочником', summary.matches, summary.matches ? 'accent' : null) +
    statusRow('Требуют внимания', summary.attention, summary.attention ? 'amber' : null) +
    statusRow('Блокирующие ошибки', summary.blocking, summary.blocking ? 'red' : null);

  if (summary.actions) {
    html += '<div class="block-label">Подтверждено ' + accepted.size + ' из ' + summary.actions + '</div>';
  }
  body.innerHTML = html;

  if (summary.actions) {
    setActions(
      { label: 'Посмотреть изменения', onClick: openReport },
      { label: 'Проверить снова', onClick: runCheck },
    );
  } else {
    setActions({ label: 'Проверить снова', onClick: runCheck }, null);
  }
}

/* ---------- сценарии ---------- */

function indexIssues() {
  issuesByRecord = new Map();
  (changeSet ? changeSet.issues : []).forEach((issue) => {
    const bucket = issuesByRecord.get(issue.recordId) || [];
    bucket.push(issue);
    issuesByRecord.set(issue.recordId, bucket);
  });
}

async function runCheck() {
  const scope = scopeRecords();
  if (!scope.length) return;

  state = 'loading';
  renderWidget();

  try {
    changeSet = await window.API.createChangeSet(scope.map(toDto));
    accepted = new Set(changeSet.actions.map((a) => a.id));
    checkedIds = new Set(scope.map((r) => r.row_id));
    lastApply = null;
    indexIssues();
    state = 'result';
  } catch (error) {
    errorText = error.message;
    state = 'error';
  }

  renderTable();
  renderWidget();
}

async function applySelected() {
  if (!changeSet || !accepted.size) return;
  const scope = scopeRecords();

  state = 'loading';
  renderWidget();

  try {
    snapshot = scope.map((row) => ({ id: row.row_id, values: toDto(row).values }));
    const result = await window.API.applyChangeSet(
      scope.map(toDto), changeSet.sourceFingerprint, [...accepted],
    );
    mergeBack(result.records);
    lastApply = result;

    // Повторный расчёт на применённых данных: показывает, что сценарий идемпотентен.
    changeSet = await window.API.createChangeSet(scopeRecords().map(toDto));
    accepted = new Set(changeSet.actions.map((a) => a.id));
    indexIssues();
    state = 'applied';
    showToast('Применено ' + result.applied.length + ' ' + changesWord(result.applied.length));
  } catch (error) {
    errorText = error.status === 409
      ? 'Данные изменились после проверки. Запустите проверку заново.'
      : error.message;
    state = 'error';
  }

  renderTable();
  renderWidget();
}

function undoApply() {
  if (snapshot) mergeBack(snapshot);
  snapshot = null;
  lastApply = null;
  changeSet = null;
  accepted = new Set();
  checkedIds = new Set();
  issuesByRecord = new Map();
  state = 'initial';
  renderTable();
  renderWidget();
  showToast('Изменения отменены, значения возвращены к исходным');
}

/* ---------- отчёт и решения по действиям ---------- */

function openReport() {
  reportRules = groupActions(changeSet.actions);
  if (!reportRules.length) return;
  reportRuleIndex = 0;
  document.getElementById('reportModal').classList.add('show');
  renderReportPage();
  document.getElementById('reportApplyBtn').focus();
}

function closeReport() {
  document.getElementById('reportModal').classList.remove('show');
  renderWidget();
  const primary = document.getElementById('primaryBtn');
  const secondary = document.getElementById('secondaryBtn');
  if (!primary.hidden) primary.focus();
  else if (!secondary.hidden && !secondary.disabled) secondary.focus();
}

function isReportOpen() {
  return document.getElementById('reportModal').classList.contains('show');
}

function toggleAction(id) {
  if (accepted.has(id)) accepted.delete(id);
  else accepted.add(id);
  renderReportFooter();
  renderRuleCheckAll();
}

function toggleRuleActions(cb) {
  const rule = reportRules[reportRuleIndex];
  rule.items.forEach((action) => {
    if (cb.checked) accepted.add(action.id);
    else accepted.delete(action.id);
  });
  renderReportPage();
}

function renderRuleCheckAll() {
  const rule = reportRules[reportRuleIndex];
  const total = rule.items.length;
  const on = rule.items.filter((a) => accepted.has(a.id)).length;
  const cb = document.getElementById('ruleCheckAll');
  cb.checked = on === total;
  cb.indeterminate = on > 0 && on < total;
}

function renderReportFooter() {
  const total = changeSet.actions.length;
  document.getElementById('reportSelection').textContent =
    'Подтверждено ' + accepted.size + ' из ' + total;
  const btn = document.getElementById('reportApplyBtn');
  btn.textContent = accepted.size ? 'Применить ' + accepted.size : 'Применить';
  btn.disabled = accepted.size === 0;
}

function renderReportPage() {
  const rule = reportRules[reportRuleIndex];
  if (!rule) return;
  const page = reportRuleIndex + 1;
  const total = reportRules.length;
  const count = rule.items.length;
  const isMatch = rule.items[0].kind === 'match';

  document.getElementById('reportTitle').textContent = 'Изменения: ' + rule.name;
  document.getElementById('reportPageInfo').textContent = page + ' из ' + total;
  document.getElementById('reportRuleBody').innerHTML =
    '<p class="report-reason">' + escapeHtml(rule.reason) + '</p>' +
    '<p class="report-count">' + count + ' ' + recordsWord(count) + '</p>';

  // У сопоставлений другой состав колонок, поэтому шапка строится здесь.
  document.getElementById('reportHead').innerHTML =
    '<tr>' +
    '<th class="col-check"><input type="checkbox" id="ruleCheckAll"' +
      ' aria-label="Подтвердить все изменения этого правила" onchange="toggleRuleActions(this)"></th>' +
    '<th class="col-app">Заявка</th>' +
    (isMatch
      ? '<th>Компания справочника</th><th class="col-conf">Уверенность</th><th>Совпало по</th>'
      : '<th>Было</th><th>Стало</th>') +
    '</tr>';

  const tbody = document.getElementById('reportTableBody');
  tbody.innerHTML = '';
  rule.items.forEach((action) => {
    const tr = document.createElement('tr');
    if (!accepted.has(action.id)) tr.classList.add('declined');

    const head =
      '<td class="col-check"><input type="checkbox" ' + (accepted.has(action.id) ? 'checked' : '') +
        ' aria-label="Подтвердить изменение поля ' + escapeHtml(action.field) + ' для заявки ' + escapeHtml(action.recordId) + '"' +
        ' onchange="toggleAction(\'' + action.id + '\')"></td>' +
      '<td class="col-app" title="' + escapeHtml(action.recordId) + '">' + escapeHtml(action.recordId) + '</td>';

    tr.innerHTML = isMatch
      ? head +
        '<td class="cell-to">' + escapeHtml(action.after) + '</td>' +
        '<td class="col-conf">' + confidenceBadge(action.confidence) + '</td>' +
        '<td class="cell-evidence">' + escapeHtml((action.evidence || []).join(', ')) + '</td>'
      : head +
        '<td class="cell-from" title="' + escapeHtml(action.before) + '">' + escapeHtml(action.before || '—') + '</td>' +
        '<td class="cell-to" title="' + escapeHtml(action.after) + '">' + escapeHtml(action.after || '—') + '</td>';

    tbody.appendChild(tr);
  });

  document.getElementById('reportPrev').disabled = page <= 1;
  document.getElementById('reportNext').disabled = page >= total;
  renderRuleCheckAll();
  renderReportFooter();
}

function reportPrev() { if (reportRuleIndex > 0) { reportRuleIndex--; renderReportPage(); } }
function reportNext() { if (reportRuleIndex < reportRules.length - 1) { reportRuleIndex++; renderReportPage(); } }

function applyFromReport() {
  document.getElementById('reportModal').classList.remove('show');
  applySelected();
}

/* ---------- инициализация ---------- */

const FOCUSABLE = 'button:not([disabled]):not([hidden]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function trapFocus(e) {
  const modal = document.querySelector('#reportModal .modal');
  const items = Array.from(modal.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  } else if (!modal.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderTable();
  renderWidget();
});

document.addEventListener('keydown', (e) => {
  if (!isReportOpen()) return;
  if (e.key === 'Escape') closeReport();
  else if (e.key === 'Tab') trapFocus(e);
});
