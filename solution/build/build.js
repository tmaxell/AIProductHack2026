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
  'helpers.js', // без зависимостей
  'normalize.js', // без зависимостей на другие lib-файлы
  'config.js', // зависит от schema.js
  'match.js', // зависит от normalize.js, helpers.js
  'classify.js', // зависит от helpers.js
  'anomalies.js', // зависит от normalize.js, helpers.js
  'preview.js', // зависит от helpers.js
];
const WIDGET_ENTRY = 'main.js'; // зависит от всех lib-файлов выше, идёт последним

// Ищет с позиции indexOfOpenBrace (индекс символа '{') её парную '}' простым подсчётом скобок
// (без учёта строк/комментариев/regex — оправдано тем, что мы контролируем весь исходный код и
// заведомо не пишем фигурные скобки внутри строк/regex в этих конкретных if/else-блоках).
function findMatchingBrace(code, indexOfOpenBrace) {
  let depth = 0;
  for (let i = indexOfOpenBrace; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('findMatchingBrace: не нашлась парная закрывающая скобка');
}

const NODE_BRANCH_MARKER = "if (typeof require === 'function' && !globalThis.__COPILOT_BUNDLED__) {";

// MWS Script Widget, судя по эмпирической проверке (см. solution/docs/PLATFORM-NOTES.md), вешается
// на текст require(...), если specifier совпадает с именем какого-либо реального npm/Node-модуля —
// независимо от того, достижим ли этот код в рантайме (за `if (typeof require === 'function')`,
// который в бандле всегда false) и независимо от префикса (node:, относительный путь или голое имя).
// Переименование наших файлов (util.js -> helpers.js) закрыло одну конкретную коллизию, но это
// негарантированный список безопасных имён на будущее. Радикальное и надёжное решение — вообще не
// пропускать текст `require(...)` в собранный бандл: вырезаем целиком каждый
// `if (typeof require === 'function' && !globalThis.__COPILOT_BUNDLED__) { ... } else { ... }`
// блок, оставляя только тело `else` (ветку, которая и должна выполняться в браузере/бандле).
// Файлы solution/src/**/*.js при этом не меняются — они по-прежнему рабочие под настоящим Node
// (devtools/юнит-тесты), это преобразование применяется только к копии текста внутри build().
function stripNodeOnlyBranches(code, label) {
  let result = code;
  for (;;) {
    const ifStart = result.indexOf(NODE_BRANCH_MARKER);
    if (ifStart === -1) break;

    const ifBraceOpen = ifStart + NODE_BRANCH_MARKER.length - 1; // индекс самой '{'
    const ifBraceClose = findMatchingBrace(result, ifBraceOpen);

    const afterIf = result.slice(ifBraceClose + 1);
    const elseMatch = afterIf.match(/^\s*else\s*\{/);
    if (!elseMatch) {
      throw new Error(`${label}: после if(typeof require...) не найден ожидаемый else { — проверь исходник`);
    }
    const elseBraceOpen = ifBraceClose + 1 + elseMatch[0].length - 1;
    const elseBraceClose = findMatchingBrace(result, elseBraceOpen);
    const elseBody = result.slice(elseBraceOpen + 1, elseBraceClose);

    result = result.slice(0, ifStart) + elseBody + result.slice(elseBraceClose + 1);
  }

  // Второй, более редкий паттерн (сейчас только config.js/nodeCache): `if (IS_NODE) { ...require(...)... }`
  // БЕЗ else — в бандле IS_NODE всегда false, поэтому весь блок просто вырезается целиком (пусто).
  for (;;) {
    const ifRegex = /if\s*\(IS_NODE\)\s*\{/g;
    let match = null;
    let found = null;
    while ((match = ifRegex.exec(result))) {
      const braceOpen = match.index + match[0].length - 1;
      const braceClose = findMatchingBrace(result, braceOpen);
      const body = result.slice(braceOpen + 1, braceClose);
      if (body.includes('require(')) { found = { start: match.index, braceClose }; break; }
    }
    if (!found) break;
    result = result.slice(0, found.start) + result.slice(found.braceClose + 1);
  }

  return result;
}

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
    '',
    '// Каждый if (typeof require...) {...} else {...} блок из исходников уже вырезан этой сборкой',
    '// (см. stripNodeOnlyBranches в build.js) — остались только else-ветки. MWS Script Widget, по',
    '// эмпирической проверке, вешается на любое обращение к импорту, чьё имя совпадает с каким-либо',
    '// npm/Node-модулем, независимо от достижимости этого кода в рантайме — см. PLATFORM-NOTES.md.',
    'globalThis.__COPILOT_BUNDLED__ = true;',
  ];

  for (const file of LIB_ORDER) {
    const fullPath = path.join(LIB_DIR, file);
    const rawCode = fs.readFileSync(fullPath, 'utf8');
    const code = stripNodeOnlyBranches(rawCode, `src/lib/${file}`);
    parts.push(wrapInIife(`src/lib/${file}`, code));
  }

  const mainPath = path.join(WIDGET_DIR, WIDGET_ENTRY);
  const rawMainCode = fs.readFileSync(mainPath, 'utf8');
  const mainCode = stripNodeOnlyBranches(rawMainCode, `src/widget/${WIDGET_ENTRY}`);
  parts.push(wrapInIife(`src/widget/${WIDGET_ENTRY}`, mainCode));

  const bundle = parts.join('\n');
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, bundle);
  console.log(`Бандл собран: ${path.relative(REPO_ROOT, OUT_PATH)} (${bundle.length} байт, ${LIB_ORDER.length + 1} файлов)`);
  return OUT_PATH;
}

if (require.main === module) build();

module.exports = { build, LIB_ORDER, WIDGET_ENTRY };
