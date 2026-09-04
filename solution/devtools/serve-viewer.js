'use strict';

// Milestone 1 — минимальный локальный просмотрщик (`--html` в run-local.js). Без внешних
// зависимостей: только node:http/node:fs. Дампит итоговое состояние seed + лог output.* за
// прогон в JSON и отдаёт вместе со статической viewer.html, чтобы результат можно было
// посмотреть в браузере — см. "Демонстрация" в solution/plan/milestone-01-mock-sdk-seed.md.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const VIEWER_HTML_PATH = path.join(__dirname, 'viewer.html');

function serve({ output, seed }) {
  const payload = JSON.stringify({ output, seed });

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/local-run-output.json') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(payload);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(VIEWER_HTML_PATH, 'utf8'));
    });

    server.listen(0, () => {
      const { port } = server.address();
      console.log(`\nЛокальный просмотрщик: http://localhost:${port}/  (Ctrl+C — остановить)`);
    });

    process.on('SIGINT', () => { server.close(); resolve(); process.exit(0); });
  });
}

module.exports = { serve };
