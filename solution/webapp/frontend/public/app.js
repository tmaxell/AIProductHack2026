/* ============================================================
   app.js — presentation layer локального mock MVP:
   рендер таблицы, состояния виджета и отчёт «было → стало».
   Доменная логика — в engine.js (реальный движок, портирован из
   solution/src/lib/) + widget-script.js (адаптер под схему строки
   этого мока).
   ============================================================ */

const records = window.MVP_DATA || [];

let selectedRows = new Set();
let searchQuery = '';
let hasRun = false;          // проверка хотя бы раз выполнена
let isRunning = false;       // проверка выполняется прямо сейчас
let applyMode = false;       // нормализации применены к данным
let reportRules = [];        // правила текущего отчёта
let reportRuleIndex = 0;
let acceptedChanges = new Set(); // подтверждённые пользователем предложения
let lastRunSummary = null;   // {ok, total, duplicateClusters, duplicateMembers} из последнего прогона
let activeChangeSet = null;  // сохранённая backend-версия — источник истины для publish

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

function toApiRecords(rows) {
  return rows.map(row => {
    const values = {};
    FIELD_META.forEach(field => {
      if (visibleColumns[field.key] !== false) values[field.key] = row[field.key] == null ? null : String(row[field.key]);
    });
    values.company_ref_id = row.company_ref_id || row.company_link || null;
    values.duplicate_of = row.duplicate_of || row.duplicate_link || null;
    return { id: row.row_id, values };
  });
}

function applyApiRecords(apiRecords) {
  apiRecords.forEach(apiRecord => {
    const row = records.find(candidate => candidate.row_id === apiRecord.id);
    if (!row) return;
    Object.entries(apiRecord.values).forEach(([field, value]) => {
      if (field === 'company_ref_id') row.company_link = value;
      else if (field === 'duplicate_of') row.duplicate_link = value;
      else row[field] = value;
    });
  });
}

function reportFromChangeSet(changeSet, acceptPending) {
  activeChangeSet = changeSet;
  const grouped = new Map();
  changeSet.actions.forEach(action => {
    const key = action.ruleCode;
    if (!grouped.has(key)) {
      grouped.set(key, {
        meta: { key, field: action.field, name: action.ruleName, reason: action.reason, group: action.group },
        items: []
      });
    }
    const row = records.find(candidate => candidate.row_id === action.recordId);
    grouped.get(key).items.push({
      id: action.id,
      row_id: action.recordId,
      application_id: row ? row.application_id : action.recordId,
      field: action.field,
      from: action.before,
      to: action.editedAfter !== undefined ? action.editedAfter : action.after,
      confidence: action.confidence,
      evidence: action.evidence || [],
      result: action.result
    });
  });
  reportRules = Array.from(grouped.values());
  acceptedChanges = new Set(
    changeSet.actions
      .filter(action => action.decision === 'accepted' || (acceptPending && action.decision === 'pending'))
      .map(action => action.id)
  );
}

/* ---------- область запуска (шаг 1 сценария: "выбрать исходные записи") ---------- */
// Чекбоксы в гриде — тот же selectedRows, что и раньше (только подсвечивали строку), но
// теперь они реально задают, что попадёт в прогон. Пустой выбор = вся таблица. Соответствует
// selectScope/input.viewAsync реального кода (выбор представления «Заявок» перед прогоном) —
// здесь эквивалент попроще, т.к. во фронте нет концепции сохранённых представлений.
let scope = records;

function getScope() {
  return selectedRows.size > 0 ? records.filter(r => selectedRows.has(r.row_id)) : records;
}

/* ---------- поля для анализа (👁 / "Настройки проверки") ---------- */
// Один плоский список полей заявки, которые реально читает движок. `column: true` — у поля
// есть своя колонка в гриде (отключение заодно прячет и её, бонусом); остальные видны только
// в отчёте «Было → Стало». Пользователю эта разница не важна — в UI её не показываем.
//
// ВАЖНО: это не только видимость. visibleColumns передаётся в window.LPC.validateAll, и
// widget-script.js#buildShadowApplication реально подменяет отключённое поле на null ещё до
// того, как оно попадёт в engine.js — для движка оно как будто отсутствует, а не просто скрыто.
const FIELD_META = [
  { key: 'project_name',   label: 'Название проекта', column: true },
  { key: 'company_name',   label: 'Компания',         column: true },
  { key: 'company_city',   label: 'Город',            column: true },
  { key: 'budget',         label: 'Бюджет',           column: true },
  { key: 'currency',       label: 'Валюта',           column: false },
  { key: 'planned_start',  label: 'Дата начала',      column: true },
  { key: 'planned_end',    label: 'Дата окончания',   column: true },
  { key: 'status',         label: 'Статус',           column: true },
  { key: 'company_email',   label: 'Email компании',   column: false },
  { key: 'requester_email', label: 'Email заявителя',  column: false },
  { key: 'company_phone',   label: 'Телефон компании', column: false },
  { key: 'requester_phone', label: 'Телефон заявителя', column: false },
  { key: 'company_inn',     label: 'ИНН компании',     column: false },
  { key: 'requester_fio',   label: 'ФИО заявителя',    column: false },
  { key: 'priority',        label: 'Приоритет',        column: false },
  { key: 'project_type',    label: 'Тип проекта',      column: false },
  { key: 'application_id',  label: 'Номер заявки',     column: false },
];
const visibleColumns = {};
FIELD_META.forEach(c => { visibleColumns[c.key] = true; });

function applyColumnVisibility() {
  FIELD_META.forEach(c => {
    if (!c.column) return;
    const show = visibleColumns[c.key] !== false;
    document.querySelectorAll('[data-col="' + c.key + '"]').forEach(el => {
      el.style.display = show ? '' : 'none';
    });
  });
}

function toggleColumn(key, visible) {
  visibleColumns[key] = visible;
  applyColumnVisibility();
}

function resetFields() {
  FIELD_META.forEach(c => { visibleColumns[c.key] = true; });
  applyColumnVisibility();
  renderSettingsModal(); // безопасно, даже если модалка сейчас закрыта — просто обновит скрытый DOM
  renderWidget(); // сразу убрать баннер "Исключено из анализа", если он был виден
}

/* ---------- настройки проверки (область запуска + поля) ---------- */

function fieldRow(c) {
  return '<label class="field-row"><input type="checkbox" ' + (visibleColumns[c.key] !== false ? 'checked' : '') +
    ' onchange="toggleColumn(\'' + c.key + '\', this.checked)"> <span>' + escapeHtml(c.label) + '</span></label>';
}

function renderSettingsModal() {
  const n = selectedRows.size;
  document.getElementById('settingsScope').innerHTML = n === 0
    ? 'Область запуска: <b>вся таблица</b> (' + records.length + ' ' + recordsWord(records.length) + ')'
    : 'Область запуска: <b>выбрано ' + n + '</b> из ' + records.length +
      ' <span class="text-muted">— обработаны будут только отмеченные строки в таблице</span>';

  document.getElementById('settingsFields').innerHTML = FIELD_META.map(fieldRow).join('');
}

function openSettings() {
  renderSettingsModal();
  document.getElementById('settingsModal').classList.add('show');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('show');
  applyColumnVisibility();
  renderTable();
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
  if (!hasRun) return { label: 'Не проверено', cls: 'b-neutral', title: '' };
  const issues = row._validationIssues || [];
  const err = issues.filter(i => i.type === 'error').length;
  const warn = issues.filter(i => i.type === 'warn').length;
  const info = issues.filter(i => i.type === 'info').length;
  // Причины — во всплывающей подсказке: без этого непонятно, почему запись осталась
  // красной даже после применения всех предложенных исправлений (нормализация чинит
  // только формат, а не восстанавливает отсутствующие обязательные значения).
  const title = issues.map(i => i.msg).join('\n');
  if (err) return { label: err + ' ' + pluralRu(err, 'ошибка', 'ошибки', 'ошибок'), cls: 'b-error', title };
  if (warn) return { label: warn + ' ' + pluralRu(warn, 'предупреждение', 'предупреждения', 'предупреждений'), cls: 'b-review', title };
  if (info) return { label: info + ' ' + pluralRu(info, 'замечание', 'замечания', 'замечаний'), cls: 'b-info', title };
  return { label: 'Без замечаний', cls: 'b-ok', title: '' };
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

  if (!list.length) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    tr.innerHTML = '<td colspan="10">' +
      (records.length ? 'По запросу «' + escapeHtml(searchQuery) + '» ничего не найдено'
                      : 'В представлении нет записей') + '</td>';
    tbody.appendChild(tr);
    document.getElementById('rowCount').textContent = '0 записей';
    applyColumnVisibility();
    return;
  }

  list.forEach((row, idx) => {
    const st = statusData(row.status);
    const chk = checkInfo(row);
    const tr = document.createElement('tr');
    if (hasRun && row._validationError) tr.classList.add('flagged');
    if (selectedRows.has(row.row_id)) tr.classList.add('selected');
    tr.innerHTML =
      '<td class="col-check"><input type="checkbox" aria-label="Выбрать заявку ' + escapeHtml(row.application_id) + '" ' +
        (selectedRows.has(row.row_id) ? 'checked' : '') + ' onclick="toggleRow(event,\'' + row.row_id + '\')"></td>' +
      '<td class="col-num">' + (idx + 1) + '</td>' +
      '<td class="col-primary" data-col="project_name" title="' + escapeHtml(row.application_id) + ' · ' + escapeHtml(row.project_name) + '"><span class="cell">' + escapeHtml(row.project_name) + '</span></td>' +
      '<td data-col="company_name" title="' + escapeHtml(row.company_name) + '"><span class="cell">' + escapeHtml(row.company_name) + '</span></td>' +
      '<td data-col="company_city">' + escapeHtml(row.company_city) + '</td>' +
      '<td data-col="budget">' + escapeHtml(row.budget) + '</td>' +
      '<td data-col="planned_start">' + escapeHtml(row.planned_start) + '</td>' +
      '<td data-col="planned_end">' + escapeHtml(row.planned_end) + '</td>' +
      '<td data-col="status"><span class="badge ' + st.cls + '"><span class="dot"></span>' + escapeHtml(st.label) + '</span></td>' +
      '<td data-col="validation"><span class="badge ' + chk.cls + '"><span class="dot"></span>' + escapeHtml(chk.label) + '</span></td>';
    tbody.appendChild(tr);
  });
  document.getElementById('rowCount').textContent = list.length + ' ' + recordsWord(list.length);
  applyColumnVisibility();
}

function toggleRow(e, id) {
  e.stopPropagation();
  if (selectedRows.has(id)) selectedRows.delete(id);
  else selectedRows.add(id);
  renderTable();
  if (!hasRun) renderWidget(); // обновить счётчик источника, пока не запущена проверка
}

function toggleAll(cb) {
  visibleRecords().forEach(r => { if (cb.checked) selectedRows.add(r.row_id); else selectedRows.delete(r.row_id); });
  renderTable();
  if (!hasRun) renderWidget();
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

/* ---------- проверка ---------- */

// Вся доменная логика (нормализация + дедуп заявок + аномалии) — в widget-script.js#validateAll,
// которая прогоняет РЕАЛЬНЫЙ движок (engine.js) по текущей области запуска (scope) и с учётом
// текущего набора включённых полей (visibleColumns). Здесь только запуск и сводка.
function validateAll() {
  lastRunSummary = window.LPC.validateAll(scope, visibleColumns);
}

/* Метаданные правил валидации — порядок совпадает с порядком страниц отчёта.
   13 нормализаций (Milestone 3) + дедуп заявок (Milestone 5, findApplicationDuplicates). */
const RULE_META = [
  { key: 'company_email', field: 'company_email', name: 'Email компании', reason: 'Приведение email к нижнему регистру и удаление пробелов', group: 'Контакты' },
  { key: 'requester_email', field: 'requester_email', name: 'Email заявителя', reason: 'Приведение email к нижнему регистру и удаление пробелов', group: 'Контакты' },
  { key: 'company_phone', field: 'company_phone', name: 'Телефон компании', reason: 'Приведение телефона к единому формату', group: 'Контакты' },
  { key: 'requester_phone', field: 'requester_phone', name: 'Телефон заявителя', reason: 'Приведение телефона к единому формату', group: 'Контакты' },
  { key: 'company_inn', field: 'company_inn', name: 'ИНН компании', reason: 'Удаление префикса «ИНН» и пробелов', group: 'Реквизиты' },
  { key: 'company_city', field: 'company_city', name: 'Город', reason: 'Нормализация названия города и сверка со справочником выборки', group: 'География' },
  { key: 'company_name', field: 'company_name', name: 'Название компании', reason: 'Снятие организационно-правовой формы и кавычек', group: 'Компания' },
  { key: 'requester_fio', field: 'requester_fio', name: 'ФИО заявителя', reason: 'Приведение ФИО к единому регистру', group: 'Контакты' },
  { key: 'budget', field: 'budget', name: 'Бюджет', reason: 'Очистка валюты и приведение к числовому виду', group: 'Финансы' },
  { key: 'currency', field: 'currency', name: 'Валюта', reason: 'Приведение к коду валюты (RUB/USD/EUR)', group: 'Финансы' },
  { key: 'planned_start', field: 'planned_start', name: 'Дата начала', reason: 'Приведение даты к формату ГГГГ-ММ-ДД', group: 'Сроки' },
  { key: 'planned_end', field: 'planned_end', name: 'Дата окончания', reason: 'Приведение даты к формату ГГГГ-ММ-ДД', group: 'Сроки' },
  { key: 'priority', field: 'priority', name: 'Приоритет', reason: 'Приведение к единому словарю приоритетов', group: 'Приоритет' },
  { key: 'duplicate_link', field: 'duplicate_link', name: 'Дубли заявок', reason: 'Поиск повторных заявок по компании, контактам и содержанию проекта', group: 'Дедуп' },
  { key: 'company_link', field: 'company_link', name: 'Сопоставление с компанией', reason: 'Поиск компании в справочнике по ИНН, email, телефону, названию и городу', group: 'Справочники' },
  { key: 'employee_link', field: 'employee_link', name: 'Сопоставление с сотрудником', reason: 'Поиск сотрудника в справочнике по email, телефону и ФИО заявителя', group: 'Справочники' },
  { key: 'project_type', field: 'project_type', name: 'Тип проекта', reason: 'Классификация по сходству с каноническими типами из справочника шаблонов', group: 'Классификация' },
];

function collectRuleChanges() {
  const ruleMap = {};
  RULE_META.forEach(r => { ruleMap[r.key] = { meta: r, items: [] }; });

  scope.forEach(row => {
    (row._validationChanges || []).forEach(c => {
      if (c.hidden) return; // служебные поля идемпотентности (напр. duplicate_group_id) — не для отчёта
      const meta = RULE_META.find(r => r.field === c.field);
      if (!meta) return;
      ruleMap[meta.key].items.push({
        id: row.row_id + '::' + c.field,
        row_id: row.row_id,
        application_id: row.application_id,
        field: c.field,
        from: c.from,
        to: c.to,
        toDisplay: c.toDisplay, // человекочитаемое значение (напр. название компании вместо её ID)
        confidence: c.confidence
      });
    });
  });

  return RULE_META.map(r => ruleMap[r.key]).filter(r => r.items.length > 0);
}

function computeSummary() {
  const issues = scope.reduce((acc, r) => acc.concat(r._validationIssues || []), []);
  return {
    total: scope.length,
    changes: scope.reduce((a, r) => a + (r._validationChanges || []).filter(c => !c.hidden).length, 0),
    attention: issues.filter(i => i.type !== 'error').length,
    blocking: issues.filter(i => i.type === 'error').length,
    ready: lastRunSummary ? lastRunSummary.ok : 0,
    duplicateClusters: lastRunSummary ? lastRunSummary.duplicateClusters : 0,
    duplicateMembers: lastRunSummary ? lastRunSummary.duplicateMembers : 0,
    companiesAutoMatched: lastRunSummary ? lastRunSummary.companiesAutoMatched : 0,
    companiesManualReview: lastRunSummary ? lastRunSummary.companiesManualReview : 0,
    employeesAutoMatched: lastRunSummary ? lastRunSummary.employeesAutoMatched : 0,
    typesManualReview: lastRunSummary ? lastRunSummary.typesManualReview : 0,
  };
}

/* Показывается во ВСЕХ состояниях виджета (до запуска, результат, применено), пока хоть одно
   поле отключено в "Настройках проверки" — состояние отключения живёт в памяти страницы (не
   сбрасывается между прогонами), поэтому предупреждение должно быть видно всегда, а не только
   на экране "Проверка завершена" (иначе после "Применить" непонятно, откуда взялись ошибки). */
function disabledFieldsBanner() {
  const disabledFields = FIELD_META.filter(c => visibleColumns[c.key] === false).map(c => c.label);
  if (!disabledFields.length) return '';
  return '<p class="settings-hint warn">⛔ Исключено из анализа: ' + escapeHtml(disabledFields.join(', ')) +
    '. <a href="#" onclick="event.preventDefault(); resetFields();">Включить все поля</a></p>';
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

function launchReportLink() {
  return '<p style="margin-top:10px"><a href="#" onclick="event.preventDefault(); openLaunchReport();">Итоговый отчёт запуска →</a></p>';
}

/* ============================================================
   ИТОГОВЫЙ ОТЧЁТ ЗАПУСКА (Milestones 8-10) — план задач по шаблону +
   назначенные исполнители (round-robin) на текущую область запуска.
   Строится поверх последнего прогона (window.LPC.validateAll уже
   проставил row._classifyResult/_matchedCompanyId) — см. launch.js.
   ============================================================ */
let launchPlan = null;

function launchTaskRows(app) {
  if (!app.tasks.length) return '';
  return '<table class="grid launch-tasks"><thead><tr>' +
    '<th>Этап</th><th>Задача</th><th>Роль</th><th>Исполнитель</th><th>Часы</th>' +
    '</tr></thead><tbody>' +
    app.tasks.map(t => '<tr>' +
      '<td>' + escapeHtml(t.stage) + '</td>' +
      '<td>' + escapeHtml(t.name) + '</td>' +
      '<td>' + escapeHtml(t.requiredRole) + '</td>' +
      '<td>' + (t.assignee ? escapeHtml(t.assignee.employee_fio) : '<span class="text-muted">нет кандидата</span>') + '</td>' +
      '<td>' + t.durationHours + '</td>' +
      '</tr>').join('') +
    '</tbody></table>';
}

function renderLaunchReport() {
  launchPlan = window.CopilotLaunch.buildLaunchPlan(scope, window.MVP_TEMPLATES, window.LPC.getCompanies(), window.LPC.getEmployees());
  const p = launchPlan;

  document.getElementById('launchSummary').innerHTML =
    statusRow('Готовы к запуску', p.readyCount + ' из ' + p.total, p.readyCount === p.total ? 'accent' : 'amber') +
    statusRow('Есть план задач (тип определён хотя бы предварительно)', p.withPlanCount + ' из ' + p.total, p.withPlanCount ? 'accent' : null) +
    statusRow('Задач сгенерировано', p.totalTasks, null) +
    statusRow('Исполнителей назначено', p.totalAssigned + ' из ' + p.totalTasks, p.totalAssigned < p.totalTasks ? 'amber' : 'accent');

  const tbody = document.getElementById('launchTableBody');
  tbody.innerHTML = '';
  p.apps.forEach((app, idx) => {
    const rowId = 'launch-' + idx;
    const typeLabel = app.type
      ? escapeHtml(app.type) + (app.typeConfirmed
        ? ''
        : ' <span class="badge b-review" title="Классификация ниже авто-порога — предварительно, не подтверждено">черновик</span>')
      : '<span class="text-muted">не определён</span>';
    const readyBadge = app.ready
      ? '<span class="badge b-ok"><span class="dot"></span>Готова</span>'
      : '<span class="badge b-error" title="' + escapeHtml(app.blockingIssues.join('; ')) + '"><span class="dot"></span>Не готова</span>';

    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + (app.tasks.length ? '<button class="icon-btn" style="width:22px;height:22px" onclick="toggleLaunchTasks(\'' + rowId + '\')" aria-label="Показать задачи"><svg class="ic"><use href="#i-chevron"/></svg></button>' : '') + '</td>' +
      '<td class="col-app" title="' + escapeHtml(app.applicationId) + '">' + escapeHtml(app.applicationId) + '</td>' +
      '<td>' + escapeHtml(app.company ? app.company.company_legal_name : '—') + '</td>' +
      '<td>' + typeLabel + '</td>' +
      '<td>' + readyBadge + '</td>' +
      '<td>' + (app.tasks.length ? app.tasksAssigned + ' / ' + app.tasks.length : '—') + '</td>';
    tbody.appendChild(tr);

    if (app.tasks.length) {
      const detailTr = document.createElement('tr');
      detailTr.id = rowId;
      detailTr.hidden = true;
      detailTr.innerHTML = '<td></td><td colspan="5">' + launchTaskRows(app) + '</td>';
      tbody.appendChild(detailTr);
    }
  });
}

function toggleLaunchTasks(rowId) {
  const el = document.getElementById(rowId);
  if (el) el.hidden = !el.hidden;
}

function openLaunchReport() {
  renderLaunchReport();
  document.getElementById('launchModal').classList.add('show');
}

function closeLaunchReport() {
  document.getElementById('launchModal').classList.remove('show');
}

/* ---------- состояния виджета ---------- */

function renderWidget() {
  const intro = document.getElementById('widgetIntro');
  const loading = document.getElementById('widgetLoading');
  const result = document.getElementById('validationSection');

  if (isRunning) {
    intro.hidden = true;
    loading.hidden = false;
    result.hidden = true;
    document.getElementById('loadingSub').textContent =
      'Обрабатываем ' + getScope().length + ' ' + recordsWord(getScope().length) + '.';
    setActions({ label: 'Проверяем…', disabled: true }, null);
    return;
  }

  if (!hasRun) {
    intro.hidden = false;
    loading.hidden = true;
    result.hidden = true;
    const scopeNow = getScope();
    document.getElementById('sourceCount').textContent = scopeNow.length === records.length
      ? records.length + ' ' + recordsWord(records.length)
      : 'выбрано ' + scopeNow.length + ' из ' + records.length;
    document.getElementById('introDisabledFields').innerHTML = disabledFieldsBanner();
    setActions(
      { label: 'Проверить данные', onClick: runValidation, disabled: !records.length },
      { label: 'Настройки проверки', onClick: openSettings }
    );
    return;
  }

  intro.hidden = true;
  loading.hidden = true;
  result.hidden = false;

  const title = document.getElementById('resultTitle');
  const sub = document.getElementById('resultSub');
  const rows = document.getElementById('statusRows');

  if (applyMode) {
    title.textContent = 'Версия опубликована';
    sub.textContent = appliedChangeCount + ' ' + changesWord(appliedChangeCount) + ' в ' +
      appliedRecordCount + ' ' + pluralRu(appliedRecordCount, 'записи', 'записях', 'записях');
    rows.innerHTML = '<div class="block-label">Что изменено</div>' + ruleList(appliedSnapshot) + disabledFieldsBanner() + launchReportLink();
    setActions(null, { label: 'Подготовить откат', variant: 'ghost', onClick: prepareRollback });
    return;
  }

  const s = computeSummary();
  const pct = s.total ? Math.round((s.ready / s.total) * 100) : 0;
  title.textContent = 'Проверка завершена';
  sub.textContent = s.total + ' ' + recordsWord(s.total) + ' · ' +
    s.changes + ' ' + pluralRu(s.changes, 'предложение', 'предложения', 'предложений');

  rows.innerHTML =
    statusRow('Готовы к запуску (порог 70%)', pct + '% (' + s.ready + ' из ' + s.total + ')', pct >= 70 ? 'accent' : 'amber') +
    statusRow('Безопасные исправления', s.changes, s.changes ? 'accent' : null) +
    statusRow('Требуют внимания', s.attention, s.attention ? 'amber' : null) +
    statusRow('Блокирующие ошибки', s.blocking, s.blocking ? 'red' : null) +
    statusRow('Сопоставлено с компанией', s.companiesAutoMatched + ' из ' + s.total, s.companiesAutoMatched < s.total ? 'amber' : 'accent') +
    (s.companiesManualReview ? statusRow('Компания — нужен ручной выбор', s.companiesManualReview, 'amber') : '') +
    (s.typesManualReview ? statusRow('Тип проекта — нужен ручной выбор', s.typesManualReview, 'amber') : '') +
    (s.duplicateClusters ? statusRow('Найдено дублей', s.duplicateClusters + ' групп / ' + s.duplicateMembers + ' заявок', 'amber') : '') +
    disabledFieldsBanner() + launchReportLink();

  if (s.changes) {
    setActions(
      { label: 'Посмотреть изменения', onClick: openReport },
      { label: 'Проверить снова', onClick: runValidation }
    );
  } else {
    setActions({ label: 'Проверить снова', onClick: runValidation }, null);
  }
}

/* Проверка синхронная и быстрая; короткая задержка нужна только чтобы
   состояние «выполняется» успело отрисоваться и не мигало. */
const RUN_MIN_MS = 400;

async function runValidation() {
  if (isRunning) return;
  scope = getScope(); // фиксируем область именно на момент запуска
  isRunning = true;
  renderWidget();
  try {
    const parentId = activeChangeSet ? activeChangeSet.id : undefined;
    const draftPromise = window.API.createChangeSet(toApiRecords(scope), parentId);
    await Promise.all([
      draftPromise.then(draft => { reportFromChangeSet(draft, true); }),
      new Promise(resolve => setTimeout(resolve, RUN_MIN_MS))
    ]);
    applyMode = false;
    hasRun = true;
    validateAll();
  } catch (error) {
    reportRules = [];
    showToast(error.message || 'Не удалось сохранить draft');
  } finally {
    isRunning = false;
    renderTable();
    renderWidget();
  }
}

/* ---------- применение и откат ---------- */

async function applyNormalizations() {
  if (!activeChangeSet || activeChangeSet.status !== 'draft') return;
  const decisions = activeChangeSet.actions.map(action => ({
    actionId: action.id,
    decision: acceptedChanges.has(action.id) ? 'accepted' : 'rejected'
  }));
  const button = document.getElementById('reportApplyBtn');
  button.disabled = true;
  button.textContent = 'Публикуем…';

  try {
    activeChangeSet = await window.API.saveDecisions(activeChangeSet.id, decisions);
    const outcome = await window.API.publishChangeSet(activeChangeSet.id, toApiRecords(scope));
    activeChangeSet = outcome.changeSet;
    applyApiRecords(outcome.records);

  appliedSnapshot = reportRules
    .map(rule => ({ ...rule, items: rule.items.filter(change => acceptedChanges.has(change.id)) }))
    .filter(rule => rule.items.length > 0);
    const appliedActions = activeChangeSet.actions.filter(action => action.result === 'applied');
    appliedChangeCount = appliedActions.length;
    appliedRecordCount = new Set(appliedActions.map(action => action.recordId)).size;
  applyMode = true;

    validateAll();
    reportRules = appliedSnapshot;
    closeReport();
    renderTable();
    renderWidget();
    showToast(
      (outcome.idempotent ? 'Версия уже была опубликована: ' : 'Опубликовано ') +
      appliedChangeCount + ' ' + changesWord(appliedChangeCount)
    );
  } catch (error) {
    activeChangeSet = await window.API.getChangeSet(activeChangeSet.id).catch(() => activeChangeSet);
    showToast(error.message || 'Не удалось опубликовать версию');
    renderReportPage();
  } finally {
    button.disabled = false;
  }
}

async function prepareRollback() {
  if (!activeChangeSet || !['published', 'superseded'].includes(activeChangeSet.status)) return;
  try {
    const rollback = await window.API.createRollback(activeChangeSet.id, toApiRecords(scope));
    reportFromChangeSet(rollback, true);
    applyMode = false;
    openReport();
    showToast('Rollback сохранён как Draft #' + rollback.sequence + ' и требует подтверждения');
  } catch (error) {
    showToast(error.message || 'Не удалось подготовить откат');
  }
}

/* ---------- отчёт «было → стало» ---------- */

function openReport() {
  if (!reportRules.length) return;
  reportRuleIndex = 0;
  document.getElementById('reportModal').classList.add('show');
  renderReportPage();
  document.getElementById('reportApplyBtn').focus();
}

function toggleAction(id) {
  if (acceptedChanges.has(id)) acceptedChanges.delete(id);
  else acceptedChanges.add(id);
  renderReportPage();
}

function toggleRuleActions(checkbox) {
  const rule = reportRules[reportRuleIndex];
  rule.items.forEach(change => {
    if (checkbox.checked) acceptedChanges.add(change.id);
    else acceptedChanges.delete(change.id);
  });
  renderReportPage();
}

function renderReportFooter() {
  const total = reportRules.reduce((sum, rule) => sum + rule.items.length, 0);
  const selected = reportRules.reduce(
    (sum, rule) => sum + rule.items.filter(change => acceptedChanges.has(change.id)).length,
    0
  );
  document.getElementById('reportSelection').textContent =
    applyMode ? '' : 'Подтверждено ' + selected + ' из ' + total;
  const button = document.getElementById('reportApplyBtn');
  button.hidden = applyMode;
  button.disabled = selected === 0;
  button.textContent = selected ? 'Опубликовать ' + selected : 'Опубликовать';
}

function closeReport() {
  document.getElementById('reportModal').classList.remove('show');
  const primary = document.getElementById('primaryBtn');
  const secondary = document.getElementById('secondaryBtn');
  if (!primary.hidden) primary.focus();
  else if (!secondary.hidden && !secondary.disabled) secondary.focus();
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

  const selectedInRule = rule.items.filter(change => acceptedChanges.has(change.id)).length;
  document.getElementById('reportHead').innerHTML =
    '<tr>' +
    '<th class="col-check"><input type="checkbox" id="ruleCheckAll" ' +
      (selectedInRule === count ? 'checked ' : '') +
      (applyMode ? 'disabled ' : '') +
      'aria-label="Подтвердить все изменения этого правила" onchange="toggleRuleActions(this)"></th>' +
    '<th class="col-app">Заявка</th><th>Было</th><th>Стало</th></tr>';
  const ruleCheckAll = document.getElementById('ruleCheckAll');
  ruleCheckAll.indeterminate = selectedInRule > 0 && selectedInRule < count;

  const tbody = document.getElementById('reportTableBody');
  tbody.innerHTML = '';
  rule.items.forEach(ch => {
    const tr = document.createElement('tr');
    if (!acceptedChanges.has(ch.id)) tr.classList.add('declined');
    const confidenceLabels = { high: 'высокая', medium: 'средняя', low: 'низкая' };
    const confTitle = (ch.confidence === null || ch.confidence === undefined)
      ? ''
      : typeof ch.confidence === 'number'
        ? ' (уверенность движка ' + Math.round(ch.confidence * 100) + '%)'
        : ' (уверенность: ' + (confidenceLabels[ch.confidence] || ch.confidence) + ')';
    const toShown = ch.toDisplay || ch.to;
    tr.innerHTML =
      '<td class="col-check"><input type="checkbox" ' + (acceptedChanges.has(ch.id) ? 'checked ' : '') +
        (applyMode ? 'disabled ' : '') +
        'aria-label="Подтвердить изменение поля ' + escapeHtml(ch.field) + ' для заявки ' + escapeHtml(ch.application_id || ch.row_id) + '" ' +
        'onchange="toggleAction(\'' + ch.id + '\')"></td>' +
      '<td class="col-app" title="' + escapeHtml(ch.application_id || ch.row_id) + '">' + escapeHtml(ch.application_id || ch.row_id) + '</td>' +
      '<td class="cell-from" title="' + escapeHtml(ch.from) + '">' + escapeHtml(ch.from || '—') + '</td>' +
      '<td class="cell-to" title="' + escapeHtml(toShown) + confTitle + '">' + escapeHtml(toShown || '—') + '</td>';
    tbody.appendChild(tr);
  });

  document.getElementById('reportPrev').disabled = page <= 1;
  document.getElementById('reportNext').disabled = page >= total;

  renderReportFooter();
}

function reportPrev() { if (reportRuleIndex > 0) { reportRuleIndex--; renderReportPage(); } }
function reportNext() { if (reportRuleIndex < reportRules.length - 1) { reportRuleIndex++; renderReportPage(); } }

function applyFromReport() {
  void applyNormalizations();
}

/* ---------- версии, история и diff ---------- */

let versionItems = [];
let selectedVersionId = null;
let explanationActionIds = [];

const VERSION_STATUS = {
  draft: 'Draft',
  published: 'Опубликована',
  superseded: 'Заменена',
  discarded: 'Отброшена'
};

function versionTitle(version) {
  if (version.rollbackOfId) {
    return (version.status === 'draft' ? 'Rollback Draft #' : 'Rollback #') + version.sequence;
  }
  return (version.status === 'draft' ? 'Draft #' : 'Версия #') + version.sequence;
}

async function openVersions() {
  document.getElementById('versionsModal').classList.add('show');
  document.getElementById('versionsList').innerHTML = '<p class="text-muted">Загружаем историю…</p>';
  try {
    const response = await window.API.listChangeSets();
    versionItems = response.items;
    selectedVersionId = activeChangeSet ? activeChangeSet.id : (versionItems[0] && versionItems[0].id);
    await renderVersions();
  } catch (error) {
    document.getElementById('versionsList').innerHTML = '<p class="settings-hint warn">' + escapeHtml(error.message) + '</p>';
  }
}

function closeVersions() {
  document.getElementById('versionsModal').classList.remove('show');
}

async function selectVersion(id) {
  selectedVersionId = id;
  await renderVersions();
}

async function renderVersions() {
  const list = document.getElementById('versionsList');
  if (!versionItems.length) {
    list.innerHTML = '<p class="text-muted">Версий пока нет. Запустите проверку данных.</p>';
    document.getElementById('versionDetails').innerHTML = '';
    return;
  }
  list.innerHTML = versionItems.map(version =>
    '<button type="button" class="version-item ' + (version.id === selectedVersionId ? 'active' : '') + '" ' +
      'onclick="selectVersion(\'' + version.id + '\')">' +
      '<span><b>' + escapeHtml(versionTitle(version)) + '</b><small>' +
        new Date(version.createdAt).toLocaleString('ru-RU') + '</small></span>' +
      '<span class="version-status status-' + version.status + '">' + escapeHtml(VERSION_STATUS[version.status]) + '</span>' +
    '</button>'
  ).join('');

  const version = versionItems.find(item => item.id === selectedVersionId) || versionItems[0];
  selectedVersionId = version.id;
  const history = await window.API.getChangeSetHistory(version.id);
  const others = versionItems.filter(item => item.id !== version.id);
  const actions = version.actions.slice(0, 12).map(action =>
    '<tr><td>' + escapeHtml(action.recordId) + '</td><td>' + escapeHtml(action.ruleName) + '</td>' +
    '<td class="cell-from">' + escapeHtml(action.before || '—') + '</td>' +
    '<td class="cell-to">' + escapeHtml(action.editedAfter !== undefined ? action.editedAfter : (action.after || '—')) + '</td>' +
    '<td>' + escapeHtml(action.decision) + ' / ' + escapeHtml(action.result) + '</td></tr>'
  ).join('');
  const aiButton = version.actions.length
    ? '<button class="btn-ghost ai-button" onclick="openAiExplanation(\'' + version.id + '\')">AI-объяснение</button>'
    : '';
  const buttons = aiButton + (version.status === 'draft'
    ? '<button class="btn-ghost" onclick="discardVersion(\'' + version.id + '\')">Отбросить</button>' +
      '<button class="btn-primary" onclick="continueVersion(\'' + version.id + '\')">Продолжить draft</button>'
    : (version.status === 'published' || version.status === 'superseded')
      ? '<button class="btn-primary" onclick="rollbackVersion(\'' + version.id + '\')">Подготовить откат</button>'
      : '');

  document.getElementById('versionDetails').innerHTML =
    '<div class="version-detail-head"><div><h3>' + escapeHtml(versionTitle(version)) + '</h3>' +
      '<p class="text-muted">' + escapeHtml(VERSION_STATUS[version.status]) + ' · ' + version.summary.actions + ' ' + changesWord(version.summary.actions) + '</p></div>' +
      '<div class="version-actions">' + buttons + '</div></div>' +
    (others.length ? '<label class="compare-control">Сравнить с <select id="compareVersionSelect">' +
      '<option value="">Выберите версию</option>' + others.map(item => '<option value="' + item.id + '">#' + item.sequence + ' · ' + VERSION_STATUS[item.status] + '</option>').join('') +
      '</select><button class="btn-ghost" onclick="compareSelectedVersion()">Сравнить</button></label>' : '') +
    '<div id="versionDiff"></div>' +
    '<div class="report-table-wrap"><table class="grid report-grid version-grid"><thead><tr><th>Запись</th><th>Правило</th><th>Было</th><th>Стало</th><th>Решение / результат</th></tr></thead>' +
      '<tbody>' + (actions || '<tr><td colspan="5">Действий нет</td></tr>') + '</tbody></table></div>' +
    (version.actions.length > 12 ? '<p class="settings-hint">Показаны первые 12 действий из ' + version.actions.length + '.</p>' : '') +
    '<div class="block-label version-history-title">История</div><div class="version-events">' +
      history.items.map(event => '<div><b>' + escapeHtml(event.type) + '</b><span>' + new Date(event.createdAt).toLocaleString('ru-RU') + '</span></div>').join('') +
    '</div>';
}

async function compareSelectedVersion() {
  const against = document.getElementById('compareVersionSelect').value;
  if (!against || !selectedVersionId) return;
  try {
    const diff = await window.API.compareChangeSets(selectedVersionId, against);
    document.getElementById('versionDiff').innerHTML =
      '<div class="diff-summary"><span>Добавлено <b>' + diff.added.length + '</b></span>' +
      '<span>Удалено <b>' + diff.removed.length + '</b></span>' +
      '<span>Изменено <b>' + diff.changed.length + '</b></span></div>';
  } catch (error) {
    showToast(error.message || 'Не удалось сравнить версии');
  }
}

async function continueVersion(id) {
  try {
    const version = await window.API.getChangeSet(id);
    reportFromChangeSet(version, false);
    applyMode = false;
    closeVersions();
    openReport();
  } catch (error) {
    showToast(error.message || 'Не удалось открыть draft');
  }
}

async function discardVersion(id) {
  try {
    await window.API.discardChangeSet(id);
    const response = await window.API.listChangeSets();
    versionItems = response.items;
    await renderVersions();
    showToast('Draft отброшен, история сохранена');
  } catch (error) {
    showToast(error.message || 'Не удалось отбросить draft');
  }
}

async function rollbackVersion(id) {
  try {
    scope = getScope();
    const rollback = await window.API.createRollback(id, toApiRecords(scope));
    reportFromChangeSet(rollback, true);
    applyMode = false;
    closeVersions();
    openReport();
    showToast('Rollback сохранён как Draft #' + rollback.sequence);
  } catch (error) {
    showToast(error.message || 'Не удалось подготовить откат');
  }
}

function renderExplanationList(title, items) {
  if (!items.length) return '';
  return '<section class="ai-section"><h3>' + escapeHtml(title) + '</h3><ul>' +
    items.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul></section>';
}

function renderExplanationResult(attempt) {
  if (!attempt) return '<p class="text-muted">Для этой версии объяснений ещё нет.</p>';
  if (attempt.status === 'failed') {
    return '<div class="ai-error"><b>Последняя попытка не удалась</b><p>' +
      escapeHtml(attempt.errorMessage || 'Groq недоступен') + '</p></div>';
  }
  if (!attempt.response) return '<p class="text-muted">Объяснение готовится…</p>';
  const output = attempt.response;
  return '<article class="ai-result"><div class="ai-result-meta">' + escapeHtml(attempt.model) +
    ' · ' + escapeHtml(attempt.promptVersion) + '</div><p class="ai-summary">' + escapeHtml(output.summary) + '</p>' +
    renderExplanationList('Основания', output.evidence) +
    renderExplanationList('Риски и противоречия', output.risks) +
    renderExplanationList('Открытые вопросы', output.openQuestions) +
    renderExplanationList('Рекомендуемые действия', output.recommendedActions) + '</article>';
}

async function openAiExplanation(id) {
  const version = versionItems.find(item => item.id === id);
  if (!version) return;
  const accepted = version.actions.filter(action => action.decision === 'accepted');
  const selected = accepted.length ? accepted : version.actions.filter(action => action.decision !== 'rejected');
  explanationActionIds = selected.map(action => action.id);
  if (!explanationActionIds.length) {
    showToast('Нет выбранных действий для объяснения');
    return;
  }

  document.getElementById('aiModal').classList.add('show');
  document.getElementById('aiTitle').textContent = 'AI-объяснение · ' + versionTitle(version);
  document.getElementById('aiBody').innerHTML = '<div class="ai-loading"><div class="spinner" aria-hidden="true"></div><p>Groq объясняет выбранные изменения…</p></div>';
  try {
    const attempt = await window.API.createExplanation(id, explanationActionIds);
    const sample = attempt.requestPayload.actions.slice(0, 4).map(action =>
      '<tr><td>' + escapeHtml(action.recordRef) + '</td><td>' + escapeHtml(action.field) + '</td>' +
      '<td>' + escapeHtml(action.before == null ? '—' : action.before) + '</td><td>' +
      escapeHtml(action.after == null ? '—' : action.after) + '</td></tr>'
    ).join('');
    document.getElementById('aiBody').innerHTML =
      '<div class="ai-consent"><b>Что было передано в Groq</b>' +
      '<p>Нажатие «AI-объяснение» запускает анализ выбранных действий. Передано ' + attempt.actionIds.length + ' ' +
      pluralRu(attempt.actionIds.length, 'выбранное действие', 'выбранных действия', 'выбранных действий') + ' сохранённой backend-версии. ' +
      'Исходные строки и их идентификаторы не отправляются; персональные значения маскируются.</p>' +
      '<div class="ai-disclosure"><span>Поля</span><b>' + escapeHtml(attempt.disclosedFields.join(', ')) + '</b></div>' +
      '<div class="ai-disclosure"><span>Модель</span><b>' + escapeHtml(attempt.model) + '</b></div>' +
      '<div class="report-table-wrap"><table class="grid report-grid ai-preview-table"><thead><tr><th>Запись</th><th>Поле</th><th>Было</th><th>Стало</th></tr></thead><tbody>' + sample + '</tbody></table></div>' +
      (attempt.requestPayload.actions.length > 4 ? '<p class="settings-hint">Показаны 4 действия из ' + attempt.requestPayload.actions.length + '.</p>' : '') +
      '</div><div class="block-label ai-history-title">Объяснение</div>' +
      renderExplanationResult(attempt);
  } catch (error) {
    document.getElementById('aiBody').innerHTML = '<p class="settings-hint warn">' + escapeHtml(error.message) + '</p>';
  }
}

function closeAiExplanation() {
  document.getElementById('aiModal').classList.remove('show');
  explanationActionIds = [];
  if (document.getElementById('versionsModal').classList.contains('show')) void renderVersions();
}

/* ---------- инициализация ---------- */

document.addEventListener('DOMContentLoaded', () => {
  records.forEach(r => { r._validationIssues = []; r._validationChanges = []; });
  renderTable();
  renderWidget();
});

/* Модалка удерживает фокус, пока открыта. */
const FOCUSABLE = 'button:not([disabled]):not([hidden]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function trapFocus(e) {
  const modals = document.querySelectorAll('.modal-overlay.show .modal');
  const openModal = modals[modals.length - 1];
  if (!openModal) return;
  const items = Array.from(openModal.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  } else if (!openModal.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
  }
}

document.addEventListener('keydown', e => {
  const modals = document.querySelectorAll('.modal-overlay.show');
  const openModal = modals[modals.length - 1];
  if (!openModal) return;
  if (e.key === 'Escape') {
    if (openModal.id === 'reportModal') closeReport();
    else if (openModal.id === 'settingsModal') closeSettings();
    else if (openModal.id === 'launchModal') closeLaunchReport();
    else if (openModal.id === 'versionsModal') closeVersions();
    else if (openModal.id === 'aiModal') closeAiExplanation();
  } else if (e.key === 'Tab') {
    trapFocus(e);
  }
});
