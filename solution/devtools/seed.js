'use strict';

// Milestone 1 — читает data/raw/dev-sample.csv (только на чтение, см. data/AGENTS.md) и раскладывает
// его по 5 логическим таблицам + пустые Config/Runs, в форме, описанной в
// solution/plan/milestone-01-mock-sdk-seed.md. Результат — воспроизводимый data/derived/local-seed.json.
//
// Использование: node solution/devtools/seed.js

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  APPLICATION_RAW_FIELDS, COMPANY_FIELDS, EMPLOYEE_FIELDS, TEMPLATE_FIELDS, TASK_FIELDS,
  PROJECT_TARGET_FIELDS, TASK_TARGET_EXTRA_FIELDS, SYSTEM_APPLICATION_FIELDS,
} = require('../src/lib/schema');

const REPO_ROOT = path.join(__dirname, '..', '..');
const RAW_CSV_PATH = path.join(REPO_ROOT, 'data', 'raw', 'dev-sample.csv');
const OUT_PATH = path.join(REPO_ROOT, 'data', 'derived', 'local-seed.json');

/**
 * Простой RFC4180-совместимый CSV-парсер с посимвольным разбором — обязателен, т.к. в
 * dev-sample.csv встречаются многострочные quoted-поля (например required_skills_raw
 * с переносами строк внутри значения). Обычный split('\n') такие строки ломает.
 */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // снять BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  function pushField() { row.push(field); field = ''; }
  function pushRow() { pushField(); rows.push(row); row = []; }

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { pushField(); i += 1; continue; }
    if (ch === '\r') { if (text[i + 1] === '\n') i += 1; pushRow(); i += 1; continue; }
    if (ch === '\n') { pushRow(); i += 1; continue; }
    field += ch; i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();

  const headers = rows[0] || [];
  const dataRows = rows.slice(1).filter((r) => !(r.length === 1 && r[0] === ''));
  return { headers, rows: dataRows };
}

function pick(row, keys) {
  const cells = {};
  for (const k of keys) cells[k] = row[k] !== undefined ? row[k] : '';
  return cells;
}

function fieldsFor(keys) {
  return keys.map((k) => ({ id: k, name: k, type: 'SingleText' }));
}

function buildSeed() {
  const raw = fs.readFileSync(RAW_CSV_PATH, 'utf8');
  const sourceSha256 = crypto.createHash('sha256').update(raw).digest('hex');
  const { headers, rows } = parseCsv(raw);

  const records = rows
    .filter((cols) => cols.length === headers.length)
    .map((cols) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = cols[i]; });
      return obj;
    });

  const byType = (type) => records.filter((r) => r.record_type === type);

  const companies = byType('COMPANY_REFERENCE').map((r) => ({ id: r.row_id, cells: pick(r, COMPANY_FIELDS) }));
  const employees = byType('EMPLOYEE').map((r) => ({ id: r.row_id, cells: pick(r, EMPLOYEE_FIELDS) }));
  const templates = byType('TASK_TEMPLATE').map((r) => ({ id: r.row_id, cells: pick(r, TEMPLATE_FIELDS) }));
  // Заявки: raw-поля из CSV + пустые системные поля, которые заполнит виджет (Milestones 3-10).
  // Объявлены заранее (значениями null), а не появляются "из ниоткуда" при первой записи — так же,
  // как в реальной MWS они будут созданы один раз в Milestone C и с тех пор существуют в схеме таблицы.
  const applications = byType('APPLICATION').map((r) => {
    const cells = pick(r, APPLICATION_RAW_FIELDS);
    for (const f of SYSTEM_APPLICATION_FIELDS) cells[f] = null;
    return { id: r.row_id, cells };
  });

  // Задачи: raw-поля из EXISTING_TASK + пустые системные поля, которыми управляет виджет
  // (Link-варианты + идемпотентность) — их ещё предстоит заполнить в Milestone 5/8/9.
  const tasks = byType('EXISTING_TASK').map((r) => ({
    id: r.row_id,
    cells: {
      ...pick(r, TASK_FIELDS),
      project_link: null,
      assignee_link: null,
      source_key: null,
      blocked_by_link: null,
    },
  }));

  // Заглушки существующих проектов — по уникальным task_project_id из задач и parent_project_raw заявок,
  // чтобы у launch.js (Milestone 10) было на что линковаться, не создавая дублей. Проекты не приходят
  // отдельными строками в dev-sample.csv, поэтому поля целевой схемы (PROJECT_TARGET_FIELDS) заводим
  // пустыми — их заполняет виджет при реальном запуске.
  const legacyProjectIds = new Set();
  for (const t of tasks) if (t.cells.task_project_id) legacyProjectIds.add(t.cells.task_project_id);
  for (const a of applications) if (a.cells.parent_project_raw) legacyProjectIds.add(a.cells.parent_project_raw);
  const projects = [...legacyProjectIds].sort().map((id) => {
    const cells = { legacy: true };
    for (const f of PROJECT_TARGET_FIELDS) cells[f] = f === 'status' ? 'legacy' : null;
    return { id, cells };
  });

  const datasheets = {
    companies: { id: 'dst_companies', name: 'Компании', fields: fieldsFor(COMPANY_FIELDS), records: companies },
    employees: { id: 'dst_employees', name: 'Сотрудники', fields: fieldsFor(EMPLOYEE_FIELDS), records: employees },
    templates: { id: 'dst_templates', name: 'Шаблоны задач', fields: fieldsFor(TEMPLATE_FIELDS), records: templates },
    projects: {
      id: 'dst_projects',
      name: 'Проекты',
      fields: fieldsFor([...PROJECT_TARGET_FIELDS, 'legacy']),
      records: projects,
    },
    tasks: {
      id: 'dst_tasks',
      name: 'Задачи',
      fields: fieldsFor([...TASK_FIELDS, ...TASK_TARGET_EXTRA_FIELDS]),
      records: tasks,
    },
    applications: {
      id: 'dst_applications',
      name: 'Заявки',
      fields: fieldsFor([...APPLICATION_RAW_FIELDS, ...SYSTEM_APPLICATION_FIELDS]),
      records: applications,
    },
    config: {
      id: 'dst_config',
      name: '⚙️ Copilot Config',
      fields: [{ id: 'payload', name: 'payload', type: 'Text' }],
      records: [],
    },
    runs: {
      id: 'dst_runs',
      name: 'Copilot Runs',
      fields: [{ id: 'payload', name: 'payload', type: 'Text' }],
      records: [],
    },
  };

  return {
    meta: { sourceFile: 'data/raw/dev-sample.csv', sourceSha256, generatedAt: new Date().toISOString() },
    datasheets,
  };
}

function main() {
  const seed = buildSeed();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(seed, null, 2));
  const counts = Object.fromEntries(Object.entries(seed.datasheets).map(([k, v]) => [k, v.records.length]));
  console.log('Seed записан в', OUT_PATH);
  console.log(counts);
  return seed;
}

if (require.main === module) main();

module.exports = { main, buildSeed, parseCsv };
