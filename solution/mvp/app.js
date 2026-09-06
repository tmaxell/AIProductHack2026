/* ============================================================
   app.js — логика mock MVP: рендер таблицы + результат валидации
   + полный отчёт по правилам с пагинацией (по/после)
   ============================================================ */

let records = window.MVP_DATA || [];
let validationResults = null;
let selectedRows = new Set();
let applyMode = false; // false = «до», true = применены нормализации
let reportRuleIndex = 0; // текущая страница (правило) в полном отчёте

// --- Рендер таблицы ---
function statusData(statusRaw) {
  const s = String(statusRaw || '').trim().toLowerCase();
  if (['новая', 'new'].includes(s)) return { label: 'Новая', cls: 'b-ok' };
  if (['на проверке', 'review'].includes(s)) return { label: 'На проверке', cls: 'b-review' };
  if (['черновик', 'draft'].includes(s)) return { label: 'Черновик', cls: 'b-info' };
  return { label: statusRaw || '—', cls: 'b-info' };
}

function qualityInfo(row) {
  const issues = [];
  if (row._issuesEmail) issues.push(...row._issuesEmail);
  if (row._issuesPhone) issues.push(...row._issuesPhone);
  if (row._issuesInn) issues.push(...row._issuesInn);
  if (row._issuesCity) issues.push(...row._issuesCity);
  if (row._issuesFio) issues.push(...row._issuesFio);
  if (row._issuesBudget) issues.push(...row._issuesBudget);
  if (row._issuesStart) issues.push(...row._issuesStart);
  if (row._issuesEnd) issues.push(...row._issuesEnd);
  if (row._issuesDates) issues.push(...row._issuesDates);
  row._allIssues = issues;
  const err = issues.filter(i => i.type === 'error').length;
  const warn = issues.filter(i => i.type === 'warn').length;
  const info = issues.filter(i => i.type === 'info').length;
  if (err > 0) return { label: err + ' ошиб.', cls: 'b-error' };
  if (warn > 0) return { label: warn + ' предупр.', cls: 'b-review' };
  if (info > 0) return { label: info + ' замечаний', cls: 'b-info' };
  return { label: 'ОК', cls: 'b-ok' };
}

function renderTable(filtered) {
  const tbody = document.getElementById('gridBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  (filtered || records).forEach((row, idx) => {
    const st = statusData(row.status);
    const q = qualityInfo(row);
    const tr = document.createElement('tr');
    if (row._validationError) tr.classList.add('flagged');
    if (selectedRows.has(row.row_id)) tr.classList.add('selected');
    const shortId = String(row.application_id || '').slice(0, 8);
    tr.innerHTML =
      '<td><input type="checkbox" ' + (selectedRows.has(row.row_id) ? 'checked' : '') + ' onclick="toggleRow(event,\'' + row.row_id + '\')"></td>' +
      '<td class="row-num">' + (idx + 1) + '</td>' +
      '<td title="' + (row.application_id || '') + '">' + escapeHtml(shortId) + '</td>' +
      '<td title="' + escapeHtml(row.project_name || '') + '"><div class="cell">' + escapeHtml(row.project_name || '') + '</div></td>' +
      '<td title="' + escapeHtml(row.company_name || '') + '"><div class="cell">' + escapeHtml(row.company_name || '') + '</div></td>' +
      '<td>' + escapeHtml(row.company_city || '') + '</td>' +
      '<td>' + escapeHtml(row.budget || '') + '</td>' +
      '<td>' + escapeHtml(row.planned_start || '') + '</td>' +
      '<td>' + escapeHtml(row.planned_end || '') + '</td>' +
      '<td><span class="badge ' + st.cls + '"><span class="dot"></span>' + st.label + '</span></td>' +
      '<td><span class="badge ' + q.cls + '"><span class="dot"></span>' + q.label + '</span></td>' +
      '<td>' + (row._validationOk ? '<span class="badge b-ok">✓ OK</span>' : (row._validationError ? '<span class="badge b-error">✗ Ошибки</span>' : '<span class="badge b-info">Не проверено</span>')) + '</td>';
    tbody.appendChild(tr);
  });
  document.getElementById('rowCount').textContent = (filtered || records).length + ' записи(-ей)';
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function toggleRow(e, id) {
  e.stopPropagation();
  if (selectedRows.has(id)) selectedRows.delete(id);
  else selectedRows.add(id);
  renderTable();
}

function toggleAll(cb) {
  records.forEach(r => { if (cb.checked) selectedRows.add(r.row_id); else selectedRows.delete(r.row_id); });
  renderTable();
}

function onSearch(q) {
  const str = (q || '').toLowerCase();
  if (!str) { renderTable(); return; }
  const filtered = records.filter(r => {
    return [r.project_name, r.company_name, r.company_city, r.company_inn, r.application_id, r.requester_email]
      .some(v => String(v || '').toLowerCase().includes(str));
  });
  renderTable(filtered);
}

// --- Виджет панель ---
function toggleWidget() { document.getElementById('widgetPanel').style.display = document.getElementById('widgetPanel').style.display === 'none' ? 'flex' : 'none'; }
function toggleConsole() { document.getElementById('consoleBlock').classList.toggle('open'); }
function openScriptModal() { document.getElementById('scriptModal').classList.add('show'); }
function closeScriptModal() { document.getElementById('scriptModal').classList.remove('show'); }

// --- Валидация ---
function validateAll() {
  records.forEach(row => {
    const res = window.LPC.validateRow(row);
    row._validationOk = res.ok;
    row._validationError = res.hasError;
    row._validationIssues = res.issues;
    row._validationChanges = res.changes;
  });
  validationResults = { ok: records.filter(r => r._validationOk).length, total: records.length };
}

/* Метаданные правил (критериев) валидации — для полного отчёта.
   Порядок = порядок показа в отчёте. */
const RULE_META = [
  { key: 'company_email',   field: 'company_email',   name: 'Email компании',      reason: 'Приведение email к нижнему регистру и удаление пробелов', group: 'Email' },
  { key: 'company_phone',   field: 'company_phone',   name: 'Телефон компании',    reason: 'Приведение телефона к единому формату',                    group: 'Телефон' },
  { key: 'company_inn',     field: 'company_inn',     name: 'ИНН компании',         reason: 'Удаление префикса «ИНН» и пробелов',                        group: 'ИНН' },
  { key: 'company_city',    field: 'company_city',    name: 'Город',                reason: 'Нормализация названия города / транслитерация',             group: 'География' },
  { key: 'requester_fio',   field: 'requester_fio',   name: 'ФИО заявителя',        reason: 'Приведение ФИО к единому регистру',                         group: 'ФИО' },
  { key: 'budget',          field: 'budget',          name: 'Бюджет',               reason: 'Очистка валюты и приведение к числовому виду',              group: 'Бюджет' },
  { key: 'planned_start',   field: 'planned_start',   name: 'Дата начала',          reason: 'Приведение даты к формату ГГГГ-ММ-ДД',                     group: 'Даты' },
  { key: 'planned_end',     field: 'planned_end',     name: 'Дата окончания',       reason: 'Приведение даты к формату ГГГГ-ММ-ДД',                     group: 'Даты' }
];

/* Собрать преобразования, сгруппированные по правилу. */
function collectRuleChanges() {
  // Правило -> [ {row_id, application_id, field, from, to, reason} ]
  const ruleMap = {};
  RULE_META.forEach(r => ruleMap[r.key] = { meta: r, items: [] });

  records.forEach(row => {
    (row._validationChanges || []).forEach(c => {
      const meta = RULE_META.find(r => r.field === c.field);
      if (meta) {
        ruleMap[meta.key].items.push({
          row_id: row.row_id,
          application_id: row.application_id,
          field: c.field,
          from: c.from,
          to: c.to,
          reason: c.reason
        });
      }
    });
  });

  // Только правила, где есть изменения, плюс порядок из RULE_META
  return RULE_META.map(r => ruleMap[r.key]).filter(r => r.items.length > 0);
}

/* --- Рендер результата в правую панель (компактные метрики + типы преобразований) --- */
function renderValidation() {
  validateAll();
  renderTable();

  const ok = validationResults.ok;
  const total = validationResults.total;
  const pct = (ok / total * 100).toFixed(1);
  const ready = pct >= 70;
  const errs = records.reduce((a, r) => a + (r._validationError ? 1 : 0), 0);
  const warns = records.reduce((a, r) => a + (r._validationIssues || []).filter(i => i.type === 'warn').length, 0);
  const changes = records.reduce((a, r) => a + (r._validationChanges || []).length, 0);
  // При applyMode используем сохранённый снимок применённых преобразований,
  // иначе — только что рассчитанные
  const ruleChanges = applyMode ? (window.__lastAppliedRules || []) : collectRuleChanges();

  const banner = document.getElementById('valBanner');
  banner.innerHTML =
    '<div class="vb-title">' + (ready ? '✅ ' : '⚠️ ') + 'Валидация завершена</div>' +
    '<div class="val-stats">' +
      '<div class="val-stat ' + (ready ? 'ok' : (pct >= 50 ? 'warn' : 'err')) + '"><div class="vs-num">' + pct + '%</div><div class="vs-label">готово к запуску (порог 70%)</div></div>' +
      '<div class="val-stat ' + (errs ? 'err' : 'ok') + '"><div class="vs-num">' + errs + '</div><div class="vs-label">записей с ошибками</div></div>' +
      '<div class="val-stat ' + (warns ? 'warn' : 'ok') + '"><div class="vs-num">' + warns + '</div><div class="vs-label">предупреждений</div></div>' +
      '<div class="val-stat"><div class="vs-num">' + changes + '</div><div class="vs-label">преобразований</div></div>' +
    '</div>' +
    '<div style="margin-top:10px;font-size:12.5px;color:var(--text-muted)">Порог 70%: <b style="color:' + (ready ? 'var(--green)' : 'var(--red)') + '">' + (ready ? 'ДОСТИГНУТ ✓' : 'не достигнут') + '</b></div>';

  // Сводка выполненных преобразований по типам / статус применения
  const summaryWrap = document.getElementById('summaryList');
  const moreWrap = document.getElementById('moreBtnWrap');
  if (summaryWrap) {
    if (applyMode) {
      // После применения — показываем выполненные преобразования с пометкой "применено"
      const totalApplied = records.reduce((a, r) => a + ((r._prevValues && Object.keys(r._prevValues).length) || 0), 0);
      summaryWrap.innerHTML =
        '<div style="background:var(--green-light);border:1px solid #bceccd;border-radius:8px;padding:10px 12px;font-size:12.5px;color:#1a8a3d;margin-bottom:8px">' +
          '✓ Все <b>' + changes + '</b> преобразований применены. Данные нормализованы.' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin:6px 0 8px">Выполненные преобразования (' + totalApplied + ')</div>';
    } else {
      summaryWrap.innerHTML = '<div style="font-size:12px;color:var(--text-muted);margin:4px 0 8px">Выполненные преобразования</div>';
    }
    // Список правил (и до, и после применения — показываем по типам)
    if (ruleChanges.length) {
      let html = '';
      ruleChanges.forEach(r => {
        html += '<div class="rule-chip" style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-gray);border-radius:8px;padding:9px 11px;margin-bottom:6px;font-size:12.5px">' +
          '<span>' + escapeHtml(r.meta.group) + ' · <b>' + escapeHtml(r.meta.name) + '</b></span>' +
          '<span class="pill" style="margin:0">' + r.items.length + '</span>' +
          '</div>';
      });
      summaryWrap.innerHTML += html;
    }
  }

  // Кнопка «Подробнее» / «Отменить»
  if (moreWrap) {
    if (applyMode) {
      moreWrap.innerHTML = '<button class="btn-ghost" style="width:100%" onclick="resetNormalizations()">↩ Отменить применение</button>';
    } else if (ruleChanges.length) {
      moreWrap.innerHTML = '<button class="btn-primary" style="width:100%" onclick="openReport()">Подробнее → полный отчёт</button>';
    } else {
      moreWrap.innerHTML = '';
    }
  }

  document.getElementById('validationSection').style.display = 'block';

  // Консоль (кратко)
  const lines = [
    'Готово к запуску: ' + ok + '/' + total + ' (' + pct + '%)',
    'Порог 70%: ' + (ready ? 'ДОСТИГНУТ ✓' : 'не достигнут'),
    'Ошибок записей: ' + errs + ', предупреждений: ' + warns,
    'Преобразований предложено: ' + changes,
    'Идемпотентность: повторный запуск безопасен',
    '---',
    'Следующий шаг: Этап 3 (поиск дублей и matching со справочниками)'
  ];
  document.getElementById('consoleBody').textContent = window.LPC.widgetConsoleLog(lines);
  document.getElementById('consoleBlock').classList.add('open');
}

function runValidation() {
  applyMode = false;
  renderValidation();
  requestAnimationFrame(() => {
    const btn = document.getElementById('runBtn');
    btn.disabled = false;
    btn.textContent = '▶ Выполнить';
  });
}

// --- Инициализация ---
document.addEventListener('DOMContentLoaded', () => {
  records.forEach(r => { r._validationOk = false; r._validationError = false; r._validationIssues = []; r._validationChanges = []; });
  renderTable();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeScriptModal(); });

// ============================================================
// Применение нормализаций (имитация «было → станет» из ФТ)
// ============================================================
function applyNormalizations() {
  // Сохраняем снимок преобразований ДО применения (для отчёта после apply)
  window.__lastAppliedRules = collectRuleChanges();
  let applied = 0;
  records.forEach(row => {
    if (!row._validationChanges || !row._validationChanges.length) return;
    row._validationChanges.forEach(c => {
      if (row[c.field] !== c.to) {
        row._prevValues = row._prevValues || {};
        row._prevValues[c.field] = c.from;
        row[c.field] = c.to;
        applied++;
      }
    });
  });
  applyMode = true;
  renderValidation();
  alert('Применено исправлений: ' + applied);
}

function resetNormalizations() {
  records.forEach(row => {
    if (row._prevValues) {
      Object.keys(row._prevValues).forEach(f => { row[f] = row._prevValues[f]; });
      delete row._prevValues;
    }
  });
  applyMode = false;
  window.__lastAppliedRules = [];
  renderValidation();
  alert('Нормализации отменены, значения возвращены к исходным.');
}

// ============================================================
// ПОЛНЫЙ ОТЧЁТ — пагинация по правилу/критерию валидации
// ============================================================
function openReport() {
  const rules = applyMode ? (window.__lastAppliedRules || []) : collectRuleChanges();
  if (!rules.length) { alert('Нет преобразований для отчёта.'); return; }
  window.__reportRules = rules;
  reportRuleIndex = 0;
  document.getElementById('reportModal').classList.add('show');
  renderReportPage();
}

function closeReport() {
  document.getElementById('reportModal').classList.remove('show');
}

function renderReportPage() {
  const rules = window.__reportRules || [];
  if (!rules.length) return;
  const rule = rules[reportRuleIndex];
  const meta = rule.meta;
  const page = reportRuleIndex + 1;
  const total = rules.length;

  // Заголовок
  document.getElementById('reportTitle').textContent = 'Отчёт по валидации — ' + meta.name;
  document.getElementById('reportPageInfo').textContent = page + ' / ' + total;

  // Блок правила
  document.getElementById('reportRuleBody').innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
      '<span class="badge b-info">' + escapeHtml(meta.group) + '</span>' +
      '<span style="font-weight:700">' + escapeHtml(meta.name) + '</span>' +
    '</div>' +
    '<div style="color:var(--text-muted);font-size:12.5px;margin-bottom:12px">' + escapeHtml(meta.reason) + '</div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Затронуто записей: <b>' + rule.items.length + '</b></div>';

  // Таблица до/после
  const tbody = document.getElementById('reportTableBody');
  tbody.innerHTML = '';
  rule.items.forEach(ch => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escapeHtml(String(ch.application_id || ch.row_id)) + '</td>' +
      '<td class="cell-from" title="' + escapeHtml(ch.from || '') + '">' + escapeHtml(ch.from || '—') + '</td>' +
      '<td class="cell-arrow">→</td>' +
      '<td class="cell-to" title="' + escapeHtml(ch.to || '') + '">' + escapeHtml(ch.to || '—') + '</td>' +
      '<td style="color:var(--text-muted);font-size:12px">' + escapeHtml(ch.reason || '') + '</td>';
    tbody.appendChild(tr);
  });

  // Пагинация
  document.getElementById('reportPrev').disabled = page <= 1;
  document.getElementById('reportNext').disabled = page >= total;
  document.getElementById('reportPrev').textContent = '← ' + (reportRuleIndex > 0 ? rules[reportRuleIndex-1].meta.name : '');
  document.getElementById('reportNext').textContent = (reportRuleIndex < total-1 ? rules[reportRuleIndex+1].meta.name : '') + ' →';
}

function reportPrev() { if (reportRuleIndex > 0) { reportRuleIndex--; renderReportPage(); } }
function reportNext() { const r = window.__reportRules || []; if (reportRuleIndex < r.length-1) { reportRuleIndex++; renderReportPage(); } }

/* Применение нормализаций из полного отчёта */
function applyFromReport() {
  closeReport();
  applyNormalizations();
}