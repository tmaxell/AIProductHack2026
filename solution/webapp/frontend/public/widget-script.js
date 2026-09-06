/* ============================================================
   widget-script.js — АДАПТЕР между реальным движком (engine.js,
   портированным из solution/src/lib/ на ветке feature/add_mvp_solution)
   и плоской строкой данных мок-таблицы (data.js), плюс реальными
   справочниками companies.js/employees.js/templates.js.

   Реальный движок работает с объектами по схеме {*_raw, normalized_*}.
   Этот файл строит "теневые" объекты заявок из плоских полей строки,
   прогоняет через engine.js и переводит результат обратно в контракт,
   который уже понимает app.js: {issues, changes, hasError, ok}.

   Пайплайн — ровно как в src/widget/main.js#run(): фаза за фазой по
   ВСЕМУ набору строк, а не по одной строке изолированно:
     1) normalize (Milestone 3)                — по каждой строке независимо
     2) дедуп заявок (Milestone 5)              — по всему набору разом
     3) сопоставление с Компаниями/Сотрудниками (Milestone 5) — по всему набору разом
     4) классификация типа/приоритета (Milestone 6) — по всему набору разом
     5) аномалии (Milestone 7)                  — по всему набору разом
   ============================================================ */

/** Единственная часть файла, НЕ портированная из mvp-ветки: реальный
 * движок (Milestone 3) вообще не нормализует ИНН — anomalies.js
 * только проверяет, что он не пустой (см. engine.js#RULES).
 * Здесь — простая зачистка формата для UI (не решает, валиден ли ИНН). */
function cleanupInnDisplay(raw) {
  if (!raw) return { value: null, changed: false, confidence: null, reason: 'empty' };
  const original = String(raw);
  const value = original.toUpperCase().replace(/^ИНН\s*/i, '').replace(/\s+/g, '').replace(/\.0+$/, '').trim();
  return {
    value,
    changed: value !== original,
    confidence: null,
    reason: 'очистка формата (не часть портированного движка — Milestone 3 не нормализует ИНН, только проверяет непустоту)',
  };
}

/** knownCities (см. engine.js#normalizeCity) — в реальном коде из справочника Компаний; здесь,
 * за неимением справочника, собираются из уже "чистых" (кириллица, без цифр) значений company_city
 * по всей текущей выборке. Абсолютно так же, как реальный алгоритм собирает их из companies datasheet.
 * Если поле "company_city" отключено чекбоксом (см. app.js#toggleColumn) — справочник пуст: город
 * во всём прогоне для движка как будто отсутствует, а не просто "не показан на экране". */
function collectKnownCities(records, fieldsEnabled) {
  if (fieldsEnabled && fieldsEnabled.company_city === false) return [];
  const clean = records
    .map((r) => (r.company_city || '').replace(/^\s*г[.\s]+/i, '').trim())
    .filter((c) => c && /^[А-ЯЁа-яё\- ]+$/.test(c));
  return [...new Set(clean)];
}

// ------------------------------------------------------------
// Справочники (companies.js/employees.js/templates.js) — реальные записи из
// data/raw/dev-sample.csv, той же выборки, откуда взяты 30 заявок в data.js.
// match.js/классификатору нужно поле `.id` на каждой сущности (в реальном MWS
// его подставляет recordToRoleObject; здесь у справочников только
// company_ref_id/employee_id — добавляем алиас `id` один раз, лениво).
// ------------------------------------------------------------
let _companiesWithId = null;
let _employeesWithId = null;
let _canonicalTypeIndex = null;

function getCompanies() {
  if (!_companiesWithId) {
    _companiesWithId = (window.MVP_COMPANIES || []).map((c) => ({ ...c, id: c.company_ref_id }));
  }
  return _companiesWithId;
}

function getEmployees() {
  if (!_employeesWithId) {
    _employeesWithId = (window.MVP_EMPLOYEES || [])
      .filter((e) => e.employee_active !== '0') // '0'/'1' в этих CSV-полях, не true/false
      .map((e) => ({ ...e, id: e.employee_id }));
  }
  return _employeesWithId;
}

function getCanonicalTypeIndex() {
  if (!_canonicalTypeIndex) {
    _canonicalTypeIndex = window.CopilotEngine.classify.buildCanonicalTypeIndex(window.MVP_TEMPLATES || []);
  }
  return _canonicalTypeIndex;
}

/**
 * Строит "теневую" заявку по схеме реального движка ({id, *_raw, normalized_*}) из строки мок-таблицы.
 *
 * fieldsEnabled — какие поля сейчас реально участвуют в прогоне (см. app.js#visibleColumns,
 * чекбоксы в меню 👁 "Скрытые поля"). Отключённое поле НЕ просто прячется в интерфейсе — оно здесь
 * подменяется на `null`, ДО того как дойдёт до normalize/match/classify/anomalies. Значит для
 * отключённого поля вся цепочка ниже увидит "пусто" и обработает его как честно отсутствующее
 * значение — не отдельная разводка на каждую фазу.
 */
function buildShadowApplication(row, fieldsEnabled) {
  const en = (key) => !fieldsEnabled || fieldsEnabled[key] !== false;
  const v = (key, value) => (en(key) ? value : null);
  return {
    id: row.row_id,
    application_id_raw: v('application_id', row.application_id),
    project_name_raw: v('project_name', row.project_name),
    project_type_raw: v('project_type', row.project_type),
    company_name_raw: v('company_name', row.company_name),
    company_inn_raw: v('company_inn', row.company_inn),
    company_email_raw: v('company_email', row.company_email),
    company_phone_raw: v('company_phone', row.company_phone),
    company_city_raw: v('company_city', row.company_city),
    requester_fio_raw: v('requester_fio', row.requester_fio),
    requester_email_raw: v('requester_email', row.requester_email),
    requester_phone_raw: v('requester_phone', row.requester_phone),
    priority_raw: v('priority', row.priority),
    budget_raw: v('budget', row.budget),
    currency_raw: v('currency', row.currency),
    planned_start_raw: v('planned_start', row.planned_start),
    planned_end_raw: v('planned_end', row.planned_end),
    project_status_raw: v('status', row.status),
    // Идемпотентность (см. match.js#findApplicationDuplicates/findCompanyMatches/findEmployeeMatches):
    // заявки, уже связанные с прошлого прогона, повторно не сканируются.
    duplicate_link: row.duplicate_link || null,
    duplicate_group_id: row.duplicate_group_id || null,
    company_link: row.company_link || null,
    employee_link: row.employee_link || null,
  };
}

/**
 * Нормализация ОДНОЙ строки (Milestone 3) через реальный движок. Заполняет normalized_* поля
 * на shadow (нужны следующим фазам) и возвращает список предложенных изменений в формате отчёта
 * app.js ({field, from, to, reason, confidence}) — field совпадает с именем поля САМОЙ строки
 * (не normalized_*), т.к. в этом мок-фронте, в отличие от реального MWS, нет отдельной колонки
 * "исходное/нормализованное" — правка применяется поверх той же ячейки, что и в исходном мок-UI.
 */
function normalizeRow(row, shadow, knownCities, fieldsEnabled) {
  const E = window.CopilotEngine.normalize;
  const en = (key) => !fieldsEnabled || fieldsEnabled[key] !== false;
  const changes = [];

  function add(field, r, toOverride) {
    const to = toOverride !== undefined ? toOverride : r.value;
    if (!r.changed) return;
    if (to === row[field]) return; // уже применено на прошлом прогоне — идемпотентность
    changes.push({
      field, from: row[field], to, reason: r.reason, confidence: r.confidence,
    });
  }

  // Отключённое поле (см. buildShadowApplication) не обрабатывается вообще: ни изменения для
  // отчёта, ни normalized_*-значения для следующих фаз — как будто поля не существует.
  if (en('company_email')) {
    const companyEmail = E.normalizeEmail(row.company_email);
    add('company_email', companyEmail);
    shadow.normalized_company_email = companyEmail.value;
  }

  if (en('requester_email')) {
    const requesterEmail = E.normalizeEmail(row.requester_email);
    add('requester_email', requesterEmail);
  }

  if (en('company_phone')) {
    const companyPhone = E.normalizePhone(row.company_phone);
    add('company_phone', companyPhone);
    shadow.normalized_company_phone = companyPhone.value;
  }

  if (en('requester_phone')) {
    const requesterPhone = E.normalizePhone(row.requester_phone);
    add('requester_phone', requesterPhone);
  }

  if (en('company_inn')) {
    const inn = cleanupInnDisplay(row.company_inn);
    add('company_inn', inn);
  }

  if (en('company_city')) {
    const city = E.normalizeCity(row.company_city, knownCities);
    add('company_city', city);
    shadow.normalized_city = city.value;
  }

  if (en('company_name')) {
    const companyName = E.normalizeCompanyName(row.company_name);
    add('company_name', companyName);
    shadow.normalized_company_name = companyName.value;
  }

  if (en('requester_fio')) {
    const fio = E.normalizeFio(row.requester_fio);
    const fioValue = [fio.lastName, fio.firstName, fio.middleName].filter(Boolean).join(' ') || null;
    add('requester_fio', { value: fioValue, changed: fio.changed, confidence: fio.confidence, reason: fio.reason });
  }

  if (en('budget')) {
    // normalizeBudget читает и валюту (row.currency) для распознавания инлайн-валюты — но если
    // именно поле "currency" отключено, а "budget" нет, парсинг суммы всё равно должен работать
    // (сумма — самостоятельное поле), поэтому здесь используем row.currency напрямую, а не en('currency').
    const budget = E.normalizeBudget(row.budget, row.currency);
    add('budget', budget, budget.value === null ? null : String(budget.value));
    shadow.normalized_budget_amount = budget.value;

    if (en('currency')) {
      const currencyChanged = budget.currencyCode !== row.currency;
      const currencyReason = budget.currencyCode
        ? (currencyChanged ? 'нормализована валюта' : `валюта распознана как ${budget.currencyCode}`)
        : 'валюта не распознана';
      add('currency', {
        value: budget.currencyCode, changed: Boolean(budget.currencyCode) && currencyChanged, confidence: budget.currencyCode ? 0.8 : 0, reason: currencyReason,
      });
      shadow.normalized_currency_code = budget.currencyCode;
    }
  }

  if (en('planned_start')) {
    const start = E.normalizeDate(row.planned_start);
    add('planned_start', start);
    shadow.normalized_planned_start = start.value;
  }

  if (en('planned_end')) {
    const end = E.normalizeDate(row.planned_end);
    add('planned_end', end);
    shadow.normalized_planned_end = end.value;
  }

  // Приоритет НЕ нормализуется здесь напрямую — он приходит из classify.js#classifyApplications
  // (Milestone 6, фаза классификации), как в реальном пайплайне. См. mergeClassifyActions ниже.

  return changes;
}

/** Фаза 3 (Milestone 5, продолжение): сопоставление со справочниками Компаний/Сотрудников.
 * Возвращает только AUTO-бакет как готовые "changes" (безопасно для массового применения);
 * MANUAL-бакет (неуверенные кандидаты) не применяется автоматически — только считается отдельно,
 * как "требует ручного выбора", ровно как в реальном preview-движке (Milestone 4, US11). */
function mergeMatchActions(row, shadow, companyActionsByRecord, employeeActionsByRecord, stats) {
  const companiesById = new Map(getCompanies().map((c) => [c.id, c]));
  const employeesById = new Map(getEmployees().map((e) => [e.id, e]));

  const companyActions = companyActionsByRecord.get(row.row_id) || [];
  const autoCompany = companyActions.find((a) => a.bucket === 'auto');
  // _matchedCompanyId — уже подтверждённая (auto) ИЛИ ранее применённая связь; читает launch.js
  // (Milestone 8-10) для итогового отчёта запуска — там нужен id компании, а не только текст.
  row._matchedCompanyId = autoCompany ? autoCompany.to : (row.company_link || null);
  if (autoCompany) {
    const company = companiesById.get(autoCompany.to);
    row._validationChanges.push({
      field: 'company_link',
      from: row.company_link ? (companiesById.get(row.company_link) || {}).company_legal_name : null,
      to: autoCompany.to,
      toDisplay: company ? company.company_legal_name : autoCompany.to,
      reason: autoCompany.reason,
      confidence: autoCompany.confidence,
    });
    stats.companiesAutoMatched += 1;
  } else if (companyActions.some((a) => a.bucket === 'manual')) {
    stats.companiesManualReview += 1;
  }

  const employeeActions = employeeActionsByRecord.get(row.row_id) || [];
  const autoEmployee = employeeActions.find((a) => a.bucket === 'auto');
  if (autoEmployee) {
    const employee = employeesById.get(autoEmployee.to);
    row._validationChanges.push({
      field: 'employee_link',
      from: row.employee_link ? (employeesById.get(row.employee_link) || {}).employee_fio : null,
      to: autoEmployee.to,
      toDisplay: employee ? employee.employee_fio : autoEmployee.to,
      reason: autoEmployee.reason,
      confidence: autoEmployee.confidence,
    });
    stats.employeesAutoMatched += 1;
  } else if (employeeActions.some((a) => a.bucket === 'manual')) {
    stats.employeesManualReview += 1;
  }
}

/** Фаза 4 (Milestone 6): классификация типа проекта + приоритет. Идемпотентность здесь считаем
 * вручную (сравнение с ТЕКУЩИМ значением поля строки), т.к. classifyApplications сравнивает
 * с полем suggested_* на shadow, которое в этом мок-фронте не хранится отдельно от самого поля. */
function mergeClassifyActions(row, classifyActionsByRecord, classifyResultByRecord, stats) {
  const actions = classifyActionsByRecord.get(row.row_id) || [];
  const result = classifyResultByRecord.get(row.row_id);
  row._classifyResult = result || null; // читает launch.js (Milestone 8-10) для превью плана задач

  const typeAction = actions.find((a) => a.field === 'suggested_project_type' && a.bucket === 'auto');
  if (typeAction && typeAction.to !== row.project_type) {
    row._validationChanges.push({
      field: 'project_type', from: row.project_type, to: typeAction.to, reason: typeAction.reason, confidence: typeAction.confidence,
    });
    stats.typesAutoClassified += 1;
  } else if (result && result.suggestedType === null && result.typeConfidence >= 0.3) {
    stats.typesManualReview += 1;
  }

  const priorityAction = actions.find((a) => a.field === 'suggested_priority');
  if (priorityAction && priorityAction.to !== row.priority) {
    row._validationChanges.push({
      field: 'priority', from: row.priority, to: priorityAction.to, reason: priorityAction.reason, confidence: priorityAction.confidence,
    });
  }
}

/**
 * Полный прогон (Milestones 3 + 5 + 6 + 7) по ВСЕМУ набору строк — мутирует каждую строку теми же
 * полями, что раньше заполнял mock (_validationOk/_validationError/_validationIssues/_validationChanges),
 * так что app.js не нужно менять контракт рендера, только источник данных.
 *
 * @param {object} [fieldsEnabled] - {fieldKey: false} для полей, отключённых чекбоксом в меню
 *   👁 "Скрытые поля" (app.js#visibleColumns) — отсутствующий ключ или true = поле участвует.
 *   Отключение реально убирает поле из ВСЕХ фаз (не только из отчёта) — см. buildShadowApplication.
 */
function validateAll(records, fieldsEnabled) {
  const knownCities = collectKnownCities(records, fieldsEnabled);
  const shadows = [];

  // --- Фаза 1: нормализация, построчно (Milestone 3) ---
  records.forEach((row) => {
    const shadow = buildShadowApplication(row, fieldsEnabled);
    const changes = normalizeRow(row, shadow, knownCities, fieldsEnabled);
    row._validationChanges = changes;
    shadows.push(shadow);
  });

  const thresholds = window.CopilotEngine.match.DEFAULT_THRESHOLDS;

  // --- Фаза 2: дедуп заявок, батчем по всей выборке (Milestone 5) ---
  const dedup = window.CopilotEngine.match.findApplicationDuplicates(shadows, { thresholds });
  const dedupByRecord = new Map();
  dedup.candidates
    .filter((c) => c.changed && c.bucket === 'auto' && c.field === 'duplicate_link')
    .forEach((c) => {
      if (!dedupByRecord.has(c.recordId)) dedupByRecord.set(c.recordId, []);
      dedupByRecord.get(c.recordId).push(c);
    });
  const groupIdActions = new Map(dedup.candidates.filter((c) => c.changed && c.bucket === 'auto' && c.field === 'duplicate_group_id').map((c) => [c.recordId, c]));

  // --- Фаза 3: сопоставление со справочниками Компаний/Сотрудников (Milestone 5) ---
  const companyActions = window.CopilotEngine.match.findCompanyMatches(shadows, getCompanies(), { thresholds });
  const employeeActions = window.CopilotEngine.match.findEmployeeMatches(shadows, getEmployees(), { thresholds });
  const companyActionsByRecord = new Map();
  companyActions.forEach((a) => {
    if (!companyActionsByRecord.has(a.recordId)) companyActionsByRecord.set(a.recordId, []);
    companyActionsByRecord.get(a.recordId).push(a);
  });
  const employeeActionsByRecord = new Map();
  employeeActions.forEach((a) => {
    if (!employeeActionsByRecord.has(a.recordId)) employeeActionsByRecord.set(a.recordId, []);
    employeeActionsByRecord.get(a.recordId).push(a);
  });

  // Прежде чем считать аномалии — обновляем shadow.company_link авто-совпадениями этого прогона
  // (не только тем, что уже было применено раньше), иначе NO_COMPANY_MATCH не увидит их вовремя.
  const shadowsById = new Map(shadows.map((s) => [s.id, s]));
  companyActionsByRecord.forEach((actions, recordId) => {
    const auto = actions.find((a) => a.bucket === 'auto');
    if (auto) shadowsById.get(recordId).company_link = auto.to;
  });

  // --- Фаза 4: классификация типа проекта + приоритет (Milestone 6) ---
  const typeIndex = getCanonicalTypeIndex();
  const { actions: classifyActionsRaw, results: classifyResults } = window.CopilotEngine.classify.classifyApplications(shadows, typeIndex, { thresholds });
  const classifyActionsByRecord = new Map();
  classifyActionsRaw.forEach((a) => {
    if (!classifyActionsByRecord.has(a.recordId)) classifyActionsByRecord.set(a.recordId, []);
    classifyActionsByRecord.get(a.recordId).push(a);
  });
  const classifyResultByRecord = new Map(classifyResults.map((r) => [r.recordId, r]));

  // --- Фаза 5: аномалии, батчем по всей выборке (Milestone 7) ---
  const anomaliesByRecord = window.CopilotEngine.anomalies.detectAnomaliesForBatch(shadows);

  const stats = {
    companiesAutoMatched: 0, companiesManualReview: 0, employeesAutoMatched: 0, employeesManualReview: 0, typesAutoClassified: 0, typesManualReview: 0,
  };

  records.forEach((row) => {
    const linkActions = dedupByRecord.get(row.row_id) || [];
    linkActions.forEach((c) => {
      row._validationChanges.push({
        field: 'duplicate_link', from: null, to: c.to, reason: c.reason, confidence: c.confidence, bucket: c.bucket,
      });
    });
    const groupAction = groupIdActions.get(row.row_id);
    if (groupAction) {
      // Применяется вместе с остальными правками (см. app.js#applyNormalizations), но не показывается
      // отдельной страницей отчёта — это служебное поле для идемпотентности, не для "было -> стало".
      row._validationChanges.push({
        field: 'duplicate_group_id', from: null, to: groupAction.to, reason: groupAction.reason, confidence: groupAction.confidence, hidden: true,
      });
    }

    mergeMatchActions(row, shadowsById.get(row.row_id), companyActionsByRecord, employeeActionsByRecord, stats);
    mergeClassifyActions(row, classifyActionsByRecord, classifyResultByRecord, stats);

    const flags = anomaliesByRecord.get(row.row_id) || [];
    row._validationIssues = flags.map((f) => ({ type: f.severity === 'blocking' ? 'error' : 'info', code: f.code, msg: f.message }));
    row._validationError = window.CopilotEngine.anomalies.isBlocking(flags);
    row._validationOk = !row._validationError;
  });

  return {
    ok: records.filter((r) => r._validationOk).length,
    total: records.length,
    duplicateClusters: dedup.clusters.length,
    duplicateMembers: dedup.clusters.reduce((a, g) => a + g.length, 0),
    ...stats,
  };
}

function widgetConsoleLog(lines) {
  const buf = [];
  buf.push('/* Project Launch Copilot — Widget Script (реальный движок, engine.js) */');
  buf.push('Запуск: ' + new Date().toLocaleString('ru-RU'));
  buf.push('---');
  lines.forEach((l) => buf.push(l));
  return buf.join('\n');
}

// Экспорт для использования из app.js — тот же неймспейс, что был у мока, чтобы не переписывать
// все вызовы: window.LPC.
window.LPC = {
  validateAll,
  widgetConsoleLog,
  // Переиспользуются launch.js (Milestone 8-10) — те же справочники с тем же id-алиасом,
  // без повторной загрузки/сопоставления.
  getCompanies,
  getEmployees,
};
