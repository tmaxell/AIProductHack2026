'use strict';

// Milestone 1 — локальная реализация Script API MWS Tables (Space/Datasheet/View/Field/Record + input/output)
// поверх обычных JS-объектов в памяти. Формы объектов — см. таблицу в
// solution/plan/milestone-01-mock-sdk-seed.md. Реальные расхождения с этим API фиксируются
// в Milestone A (solution/docs/PLATFORM-NOTES.md, появится когда будет доступ к MWS) и сворачиваются сюда в Milestone B.

const readline = require('node:readline');

class Field {
  constructor(id, name, type) {
    this.id = id;
    this.name = name;
    this.type = type;
  }
}

class Record {
  constructor(id, cells) {
    this.id = id;
    this._cells = cells;
  }

  getCellValue(fieldId) {
    return this._cells[fieldId] !== undefined ? this._cells[fieldId] : null;
  }

  getCellValueString(fieldId) {
    const v = this.getCellValue(fieldId);
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  }
}

class View {
  constructor(id, name, datasheet, recordIds) {
    this.id = id;
    this.name = name;
    this._datasheet = datasheet;
    this._recordIds = recordIds; // null = все записи датасета
  }

  async getRecordsAsync(opts) {
    const merged = { ...(opts || {}) };
    if (this._recordIds && !merged.recordIds) merged.recordIds = this._recordIds;
    return this._datasheet.getRecordsAsync(merged);
  }

  async getRecordAsync(id) {
    return this._datasheet.getRecordAsync(id);
  }
}

class Datasheet {
  constructor(state) {
    this._state = state; // { id, name, fields: [{id,name,type}], records: [{id, cells}] }
    this.id = state.id;
    this.name = state.name;
  }

  get fields() {
    return this._state.fields.map((f) => new Field(f.id, f.name, f.type));
  }

  get views() {
    return [new View(`viw_${this.id}_all`, 'Все записи', this, null)];
  }

  getField(key) {
    const f = this._state.fields.find((x) => x.id === key || x.name === key);
    if (!f) {
      const known = this._state.fields.map((x) => x.name).join(', ');
      throw new Error(`Поле "${key}" не найдено в таблице "${this.name}". Известные поля: ${known}`);
    }
    return new Field(f.id, f.name, f.type);
  }

  getView(key) {
    const found = this.views.find((v) => v.id === key || v.name === key);
    return found || this.views[0];
  }

  async getRecordAsync(id) {
    const r = this._state.records.find((x) => x.id === id);
    if (!r) throw new Error(`Запись "${id}" не найдена в таблице "${this.name}"`);
    return new Record(r.id, r.cells);
  }

  async getRecordsAsync(opts) {
    let records = this._state.records;
    if (opts && opts.recordIds) {
      const set = new Set(opts.recordIds);
      records = records.filter((r) => set.has(r.id));
    }
    return records.map((r) => new Record(r.id, r.cells));
  }

  async createRecordAsync(valuesMap) {
    const id = this._genId();
    this._state.records.push({ id, cells: { ...valuesMap } });
    return id;
  }

  async createRecordsAsync(records) {
    const ids = [];
    for (const rec of records) {
      const id = this._genId();
      const valuesMap = rec && rec.valuesMap ? rec.valuesMap : rec;
      this._state.records.push({ id, cells: { ...valuesMap } });
      ids.push(id);
    }
    return ids;
  }

  async updateRecordAsync(recordId, valuesMap) {
    const rec = this._state.records.find((r) => r.id === recordId);
    if (!rec) throw new Error(`Запись "${recordId}" не найдена в таблице "${this.name}"`);
    Object.assign(rec.cells, valuesMap);
  }

  async updateRecordsAsync(records) {
    for (const { id, valuesMap } of records) {
      await this.updateRecordAsync(id, valuesMap);
    }
  }

  async deleteRecordAsync(recordId) {
    this._state.records = this._state.records.filter((r) => r.id !== recordId);
  }

  async deleteRecordsAsync(recordIds) {
    const set = new Set(recordIds);
    this._state.records = this._state.records.filter((r) => !set.has(r.id));
  }

  _genId() {
    this._state._seq = (this._state._seq || 0) + 1;
    return `${this._state.id}_new_${this._state._seq}`;
  }
}

class Space {
  constructor(seedData) {
    this._byId = new Map();
    for (const key of Object.keys(seedData.datasheets)) {
      const state = seedData.datasheets[key];
      this._byId.set(state.id, new Datasheet(state));
    }
  }

  async getDatasheetAsync(id) {
    const ds = this._byId.get(id);
    if (!ds) throw new Error(`Таблица с ID "${id}" не найдена. Известные ID: ${[...this._byId.keys()].join(', ')}`);
    return ds;
  }
}

function createScriptedInput(answers) {
  const queue = [...answers];
  function next(label) {
    if (queue.length === 0) throw new Error(`Нет заготовленного ответа для вопроса: "${label}"`);
    return queue.shift();
  }
  return {
    async textAsync(label) { return String(next(label)); },
    async fieldAsync(label, datasheet) { return datasheet.getField(next(label)); },
    async viewAsync(label, datasheet) { return datasheet.getView(next(label)); },
    async recordAsync(label, datasheet) { return datasheet.getRecordAsync(next(label)); },
  };
}

function createInteractiveInput() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  function ask(prompt) {
    return new Promise((resolve) => rl.question(`${prompt} `, resolve));
  }
  return {
    async textAsync(label) { return ask(`\n? ${label} >`); },
    async fieldAsync(label, datasheet) {
      const names = datasheet.fields.map((f) => f.name).join(', ');
      const ans = await ask(`\n? ${label}\n  [${datasheet.name}] доступные поля: ${names}\n>`);
      return datasheet.getField(ans.trim());
    },
    async viewAsync(label, datasheet) {
      const names = datasheet.views.map((v) => v.name).join(', ');
      const ans = await ask(`\n? ${label}\n  [${datasheet.name}] доступные представления: ${names}\n>`);
      return datasheet.getView(ans.trim());
    },
    async recordAsync(label, datasheet) {
      const ans = await ask(`\n? ${label}\n  [ID записи в "${datasheet.name}"]\n>`);
      return datasheet.getRecordAsync(ans.trim());
    },
    _close() { rl.close(); },
  };
}

function fmtCell(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function printTable(rows) {
  if (!rows || rows.length === 0) { console.log('(пусто)'); return; }
  const isArrayRows = Array.isArray(rows[0]);
  const cols = isArrayRows ? rows[0].map((_, i) => `col${i}`) : Object.keys(rows[0]);
  const cellAt = (r, i, c) => (isArrayRows ? r[i] : r[c]);
  const widths = cols.map((c, i) => Math.max(
    String(c).length,
    ...rows.map((r) => fmtCell(cellAt(r, i, c)).length),
  ));
  const line = (vals) => vals.map((v, i) => String(v).padEnd(widths[i])).join(' | ');
  console.log(line(cols));
  console.log(widths.map((w) => '-'.repeat(w)).join('-+-'));
  for (const r of rows) {
    console.log(line(cols.map((c, i) => fmtCell(cellAt(r, i, c)))));
  }
}

function createOutput(captureTo) {
  function record(entry) { if (captureTo) captureTo.push(entry); }
  return {
    text(s) { console.log(s); record({ type: 'text', content: s }); },
    markdown(s) { console.log(s); record({ type: 'markdown', content: s }); },
    table(rows) { printTable(rows); record({ type: 'table', rows }); },
    clear() { console.clear(); record({ type: 'clear' }); },
  };
}

/**
 * @param {object} seedData - результат devtools/seed.js (или его же снапшот после прогона)
 * @param {object} [opts]
 * @param {string[]} [opts.answers] - если задано, input.* работает в скриптованном режиме
 * @param {any[]} [opts.captureTo] - если задано, output.* дополнительно копит записи сюда (для --html)
 */
function createMockSdk(seedData, opts = {}) {
  const space = new Space(seedData);
  const input = opts.answers ? createScriptedInput(opts.answers) : createInteractiveInput();
  const output = createOutput(opts.captureTo || null);
  return {
    space,
    input,
    output,
    close() { if (input._close) input._close(); },
  };
}

module.exports = { createMockSdk, Space, Datasheet, View, Field, Record };
