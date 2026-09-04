#!/usr/bin/env node
'use strict';

// Milestone 1 — CLI-раннер. Поднимает mock-SDK на локальном seed и вызывает widget/main.js —
// весь сценарий целиком, без единого обращения к MWS. См. solution/plan/milestone-01-mock-sdk-seed.md.
//
// Использование:
//   node solution/devtools/run-local.js                          — интерактивный режим на local-seed.json
//   node solution/devtools/run-local.js --seed <path>             — на другом seed/результате прошлого прогона
//   node solution/devtools/run-local.js --answers answers.json     — скриптованный режим (для тестов)
//   node solution/devtools/run-local.js --html                     — после прогона поднимает локальный просмотрщик
//   node solution/devtools/run-local.js --limit 20                  — только первые N заявок (быстрый ручной тест)

const fs = require('node:fs');
const path = require('node:path');
const { createMockSdk } = require('./mock-sdk');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_SEED_PATH = path.join(REPO_ROOT, 'data', 'derived', 'local-seed.json');
const RESULT_PATH = path.join(REPO_ROOT, 'data', 'derived', 'local-run-result.json');
const REPORTS_DIR = path.join(__dirname, 'reports');

function fmtCell(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function displayFromOf(a) {
  return a.displayFrom !== undefined ? a.displayFrom : a.from;
}

/** Группирует Action[] по полю: сколько раз, и до 3 примеров "было -> стало" на поле. */
function aggregateByField(actions) {
  const byField = new Map();
  for (const a of actions) {
    if (!byField.has(a.field)) byField.set(a.field, { count: 0, examples: [] });
    const entry = byField.get(a.field);
    entry.count += 1;
    if (entry.examples.length < 3) {
      entry.examples.push({
        recordId: a.recordId, from: displayFromOf(a), to: a.to, reason: a.reason,
      });
    }
  }
  return byField;
}

function aggregateSkipReasons(skippedActions) {
  const byReason = new Map();
  for (const a of skippedActions) {
    const reason = a.skipReason || 'unknown';
    byReason.set(reason, (byReason.get(reason) || 0) + 1);
  }
  return byReason;
}

const SKIP_REASON_LABELS = {
  'already-applied': 'уже было применено на прошлом прогоне (не показывалось повторно)',
  'rejected-by-user': 'пользователь не выбрал строку в авто-группе',
  'unresolved-ambiguous': 'неоднозначный случай — вариант не выбран',
  'other-option-chosen': 'в группе выбран другой вариант',
  unknown: 'причина не указана',
};

function buildFieldBreakdownTable(appliedByField, skippedByField) {
  const fields = [...new Set([...appliedByField.keys(), ...skippedByField.keys()])].sort();
  if (fields.length === 0) return ['(изменений не было)'];
  const rows = ['| Поле | Применено | Пропущено |', '|---|---|---|'];
  for (const field of fields) {
    const appliedCount = appliedByField.get(field)?.count || 0;
    const skippedCount = skippedByField.get(field)?.count || 0;
    rows.push(`| ${field} | ${appliedCount} | ${skippedCount} |`);
  }
  return rows;
}

function buildExamplesSection(appliedByField) {
  const fields = [...appliedByField.keys()].sort();
  if (fields.length === 0) return ['(нет применённых изменений)'];
  const lines = [];
  for (const field of fields) {
    const { examples } = appliedByField.get(field);
    lines.push(`**${field}**`);
    lines.push('');
    lines.push('| Заявка | Было | Стало | Причина |');
    lines.push('|---|---|---|---|');
    for (const ex of examples) {
      lines.push(`| ${ex.recordId} | ${fmtCell(ex.from)} | ${fmtCell(ex.to)} | ${ex.reason} |`);
    }
    lines.push('');
  }
  return lines;
}

function buildSkipReasonSection(byReason) {
  if (byReason.size === 0) return ['(ничего не пропущено)'];
  const rows = ['| Причина | Сколько | Что это значит |', '|---|---|---|'];
  for (const [reason, count] of byReason) {
    rows.push(`| ${reason} | ${count} | ${SKIP_REASON_LABELS[reason] || '—'} |`);
  }
  return rows;
}

// Отчёт конкретного тестового прогона — в отличие от local-run-result.json (перезаписывается
// каждый раз, нужен только для идемпотентности), каждый вызов run-local.js добавляет СВОЙ файл
// с таймстампом, чтобы история тестовых прогонов не терялась в скроллбэке терминала.
//
// Пишет два файла: <stamp>.md — читаемая сводка (разбивка по полям, примеры "было -> стало",
// причины пропуска) и <stamp>.json — полный сырой список всех Action (applied+skipped) без
// каких-либо сокращений, для программного разбора/grep.
function writeRunReport({
  args, summary, startedAt, finishedAt,
}) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = finishedAt.toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORTS_DIR, `run-${stamp}.md`);
  const jsonPath = path.join(REPORTS_DIR, `run-${stamp}.json`);
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  const appliedActions = (summary && summary.appliedActions) || [];
  const skippedActions = (summary && summary.skippedActions) || [];
  const appliedByField = aggregateByField(appliedActions);
  const skippedByField = aggregateByField(skippedActions);
  const skipReasons = aggregateSkipReasons(skippedActions);

  const scalarSummary = summary
    ? Object.entries(summary).filter(([, v]) => !Array.isArray(v))
    : [];

  const lines = [
    `# Отчёт прогона ${finishedAt.toISOString()}`,
    '',
    '## Конфигурация запуска',
    '',
    `- Seed: \`${path.relative(REPO_ROOT, args.seed)}\``,
    `- Режим: ${args.answers ? `скриптованный (\`${path.relative(REPO_ROOT, args.answers)}\`)` : 'интерактивный'}`,
    `- Ограничение (--limit): ${args.limit || 'нет (все заявки в seed)'}`,
    `- Длительность: ${(durationMs / 1000).toFixed(3)} с`,
    '',
    '## Итог виджета',
    '',
    ...(scalarSummary.length ? scalarSummary.map(([k, v]) => `- ${k}: ${v}`) : ['(виджет не вернул сводку)']),
    '',
    '## Разбивка по полям',
    '',
    'Сколько раз каждое `normalized_*`-поле реально применено/пропущено за этот прогон.',
    '',
    ...buildFieldBreakdownTable(appliedByField, skippedByField),
    '',
    '## Причины пропуска',
    '',
    ...buildSkipReasonSection(skipReasons),
    '',
    '## Примеры применённых изменений (по 3 на поле)',
    '',
    ...buildExamplesSection(appliedByField),
    '## Полные данные',
    '',
    `Все ${appliedActions.length} применённых и ${skippedActions.length} пропущенных действий без сокращений — \`${path.basename(jsonPath)}\` рядом с этим файлом.`,
    '',
  ];

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  fs.writeFileSync(jsonPath, JSON.stringify({
    args: { seed: args.seed, answers: args.answers, limit: args.limit },
    startedAt,
    finishedAt,
    durationMs,
    appliedActions,
    skippedActions,
  }, null, 2));

  return reportPath;
}

function parseArgs(argv) {
  const args = {
    seed: DEFAULT_SEED_PATH, html: false, answers: null, forceReconfigure: false, limit: null,
  };

  // Флагам ниже обязательно нужно значение следующим аргументом — без этой проверки
  // "--answers" без пути падал с невнятной внутренней ошибкой Node ("paths[0] ... undefined").
  function takeValue(flagName, i) {
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`Флагу ${flagName} нужно значение сразу после него, например: ${flagName} <путь>`);
    }
    return value;
  }

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--seed') {
      args.seed = path.resolve(takeValue(a, i));
      i += 1;
    } else if (a === '--answers') {
      args.answers = path.resolve(takeValue(a, i));
      i += 1;
    } else if (a === '--limit') {
      args.limit = Number(takeValue(a, i));
      i += 1;
    } else if (a === '--html') {
      args.html = true;
    } else if (a === '--reconfigure') {
      args.forceReconfigure = true;
    } else {
      throw new Error(`Неизвестный флаг: ${a}. Доступные: --seed <путь>, --answers <путь>, --html, --limit <N>, --reconfigure`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.seed)) {
    console.log(`Seed не найден (${args.seed}) — генерирую через devtools/seed.js...`);
    // eslint-disable-next-line global-require
    require('./seed').main();
  }

  const seed = JSON.parse(fs.readFileSync(args.seed, 'utf8'));

  if (!args.answers) {
    // В реальном MWS ID таблицы копируется из адресной строки браузера. В локальном mock-режиме
    // это заранее сгенерированные devtools/seed.js строки — их неоткуда взять, кроме как отсюда,
    // поэтому печатаем шпаргалку перед тем, как мастер настройки (Milestone 2) начнёт спрашивать.
    console.log('\nЛокальные ID таблиц (нужны в мастере настройки, отвечайте ровно этими строками):');
    for (const key of Object.keys(seed.datasheets)) {
      const ds = seed.datasheets[key];
      console.log(`  ${ds.id.padEnd(18)} ${ds.name}`);
    }
    console.log('Для полей мастер сам подскажет список доступных имён в квадратных скобках.\n');
  }

  if (args.limit) {
    seed.datasheets.applications.records = seed.datasheets.applications.records.slice(0, args.limit);
    console.log(`--limit ${args.limit}: заявок в seed оставлено ${seed.datasheets.applications.records.length}`);
  }
  const answers = args.answers ? JSON.parse(fs.readFileSync(args.answers, 'utf8')) : null;
  const captureTo = args.html ? [] : null;

  const sdk = createMockSdk(seed, { answers, captureTo });

  if (args.forceReconfigure) {
    // eslint-disable-next-line global-require
    require('../src/lib/config').clearCache();
  }

  const startedAt = new Date();
  let summary = null;
  try {
    // eslint-disable-next-line global-require
    const widget = require('../src/widget/main');
    summary = await widget.run(sdk);
  } finally {
    sdk.close();
  }
  const finishedAt = new Date();

  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, JSON.stringify(seed, null, 2));
  console.log(`\nСостояние после прогона сохранено в ${RESULT_PATH}`);
  console.log('Для проверки идемпотентности запустите тот же прогон ещё раз с --seed на этот файл:');
  console.log(`  node solution/devtools/run-local.js --seed ${path.relative(REPO_ROOT, RESULT_PATH)}`);

  const reportPath = writeRunReport({
    args, summary, startedAt, finishedAt,
  });
  console.log(`Отчёт этого прогона сохранён в ${path.relative(REPO_ROOT, reportPath)}`);

  if (args.html) {
    // eslint-disable-next-line global-require
    await require('./serve-viewer').serve({ output: captureTo, seed });
  }

  return summary;
}

main().catch((err) => {
  console.error('\nОшибка выполнения:', err.message);
  process.exit(1);
});
