'use strict';

// Только для локальной Node-разработки (devtools/run-local.js, юнит-тесты) — НИКОГДА не входит в
// widget.bundle.js: build.js намеренно не добавляет этот файл в LIB_ORDER. Причина — реальный MWS
// Script Widget, судя по эмпирической проверке (см. solution/docs/PLATFORM-NOTES.md), реагирует на
// сам текст обращения к встроенным Node-модулям fs/path где-либо в скрипте (даже если код за
// `if (IS_NODE)` недостижим) и намертво виснет на этом примерно на минуту без единой ошибки.
// Поэтому такие обращения не должны попадать в собранный бандл вообще, даже как мёртвый код —
// только require('./relative') на собственные модули безопасен (config.js/match.js так и делают).
// Раз этот файл никогда не бандлится, здесь можно писать как обычно.
const fs = require('node:fs');
const path = require('node:path');

const cachePath = path.join(__dirname, '..', '..', '..', 'data', 'derived', 'local-config-cache.json');

module.exports = {
  cachePath,
  readFileSync: (p) => fs.readFileSync(p, 'utf8'),
  writeFileSync: (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  },
  unlinkSync: (p) => fs.unlinkSync(p),
};
