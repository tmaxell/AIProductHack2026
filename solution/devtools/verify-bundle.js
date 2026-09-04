#!/usr/bin/env node
'use strict';

// Milestone 11 — проверяет solution/dist/widget.bundle.js в песочнице БЕЗ require/module. Это и
// есть настоящая проверка: обычный `node widget.bundle.js` не годится, т.к. под Node `require`
// всегда определена (просто с неверными относительными путями после склейки в один файл) — а в
// реальном MWS Script Widget require не существует вовсе. Здесь эмулируется именно это: все
// lib-файлы внутри бандла обязаны пойти по ветке globalThis.CopilotLib (см. build.js), а не по
// require(). См. solution/plan/milestone-11-build-tests.md.
//
// Использование: node solution/devtools/verify-bundle.js [--limit N]

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createMockSdk } = require('./mock-sdk');

const REPO_ROOT = path.join(__dirname, '..', '..');
const BUNDLE_PATH = path.join(__dirname, '..', 'dist', 'widget.bundle.js');
const SEED_PATH = path.join(REPO_ROOT, 'data', 'derived', 'local-seed.json');
const ANSWERS_PATH = path.join(__dirname, 'fixtures', 'demo-answers.json');

function parseLimit(argv) {
  const i = argv.indexOf('--limit');
  return i >= 0 ? Number(argv[i + 1]) : 20;
}

async function main() {
  if (!fs.existsSync(BUNDLE_PATH)) {
    throw new Error(`Бандл не найден: ${path.relative(REPO_ROOT, BUNDLE_PATH)}. Сначала: node solution/build/build.js`);
  }
  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`Seed не найден: ${path.relative(REPO_ROOT, SEED_PATH)}. Сначала: node solution/devtools/seed.js`);
  }

  const bundleCode = fs.readFileSync(BUNDLE_PATH, 'utf8');
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const limit = parseLimit(process.argv.slice(2));
  seed.datasheets.applications.records = seed.datasheets.applications.records.slice(0, limit);

  const answers = JSON.parse(fs.readFileSync(ANSWERS_PATH, 'utf8'));
  const sdk = createMockSdk(seed, { answers });

  // Песочница БЕЗ require/module — намеренно. typeof require здесь будет "undefined", поэтому
  // весь бандл пойдёт по ветке globalThis.CopilotLib, как в реальном MWS. localStorage реального
  // браузера здесь эмулируется простым in-memory Map — сам факт наличия localStorage в реальном
  // MWS не проверен (см. Milestone A), но его ОТСУТСТВИЕ в песочнице для целей этой проверки не
  // показательно — нам нужно тестировать код, а не гадать про среду, которой у нас пока нет.
  const localStorageStore = new Map();
  const sandbox = {
    space: sdk.space,
    input: sdk.input,
    output: sdk.output,
    console,
    localStorage: {
      getItem: (key) => (localStorageStore.has(key) ? localStorageStore.get(key) : null),
      setItem: (key, value) => localStorageStore.set(key, String(value)),
      removeItem: (key) => localStorageStore.delete(key),
    },
  };
  const context = vm.createContext(sandbox);

  console.log(`Проверка бандла в песочнице без require/module (--limit ${limit})...\n`);
  vm.runInContext(bundleCode, context, { filename: 'widget.bundle.js' });

  // run() внутри бандла асинхронна и запускается "выстрелил и забыл" (main.js сам решает, когда
  // вызывать себя — в реальном MWS это делают глобальные space/input/output). Ждём явно, а не
  // надеемся на неявное поведение микрозадач Node, чтобы вывод точно успел завершиться.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log('\nOK: бандл выполнился в браузероподобной песочнице без require/module.');
}

main().catch((err) => {
  console.error('\nОшибка проверки бандла:', err.message);
  process.exit(1);
});
