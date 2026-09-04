#!/usr/bin/env node
'use strict';

// Milestone 11 — сборка solution/src/**/*.js в один файл (solution/dist/widget.bundle.js) для
// вставки в редактор Script Widget в MWS Tables. Контракт — solution/plan/milestone-11-build-tests.md.
//
// Каждый исходный файл оборачивается в свою IIFE — поэтому его локальные объявления (const/let/
// деструктуризация зависимостей) не текут в общую область видимости и не конфликтуют друг с
// другом при простой текстовой склейке. Единственное, что реально расшарено между файлами —
// объект globalThis.CopilotLib, в который каждый модуль кладёт себя (см. "экспорт" в конце
// каждого lib-файла) и откуда читает свои зависимости (см. "импорт" в начале каждого файла,
// ветка `else` — она выполняется именно в этом, браузерном/бандл-контексте, где `require` не
// определён). Без этой обёртки конкатенация текстом падала бы с
// "SyntaxError: Identifier '...' has already been declared" на первом же повторно
// задекларированном имени (например normalizeEmail — и функция в normalize.js, и локальная
// деструктуризация в match.js/anomalies.js).
//
// Использование: node solution/build/build.js

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const LIB_DIR = path.join(__dirname, '..', 'src', 'lib');
const WIDGET_DIR = path.join(__dirname, '..', 'src', 'widget');
const OUT_PATH = path.join(__dirname, '..', 'dist', 'widget.bundle.js');

// Порядок — зависимости раньше тех, кто их использует (см. таблицу в milestone-11-build-tests.md).
const LIB_ORDER = [
  'schema.js', // без зависимостей
  'util.js', // без зависимостей
  'normalize.js', // без зависимостей на другие lib-файлы
  'config.js', // зависит от schema.js
  'match.js', // зависит от normalize.js, util.js
  'classify.js', // зависит от util.js
  'anomalies.js', // зависит от normalize.js, util.js
  'preview.js', // зависит от util.js
];
const WIDGET_ENTRY = 'main.js'; // зависит от всех lib-файлов выше, идёт последним

function wrapInIife(label, code) {
  return [
    `\n/* ---- ${label} ---- */`,
    ';(function () {',
    code,
    '})();',
    '',
  ].join('\n');
}

function build() {
  const parts = [
    '// Собрано автоматически solution/build/build.js — не редактировать руками, правки внести',
    '// в исходные файлы solution/src/ и пересобрать. См. solution/plan/milestone-11-build-tests.md.',
  ];

  for (const file of LIB_ORDER) {
    const fullPath = path.join(LIB_DIR, file);
    const code = fs.readFileSync(fullPath, 'utf8');
    parts.push(wrapInIife(`src/lib/${file}`, code));
  }

  const mainPath = path.join(WIDGET_DIR, WIDGET_ENTRY);
  const mainCode = fs.readFileSync(mainPath, 'utf8');
  parts.push(wrapInIife(`src/widget/${WIDGET_ENTRY}`, mainCode));

  const bundle = parts.join('\n');
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, bundle);
  console.log(`Бандл собран: ${path.relative(REPO_ROOT, OUT_PATH)} (${bundle.length} байт, ${LIB_ORDER.length + 1} файлов)`);
  return OUT_PATH;
}

if (require.main === module) build();

module.exports = { build, LIB_ORDER, WIDGET_ENTRY };
