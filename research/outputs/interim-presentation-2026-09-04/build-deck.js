const pptxgen = require("pptxgenjs");

const BG = "150E2E";
const CARD = "231A47";
const CARD2 = "2C2159";
const PURPLE = "7C4DFF";
const PURPLE_LT = "B69CFF";
const WHITE = "FFFFFF";
const MUTED = "A99CC9";
const MINT = "2ED9A8";
const AMBER = "FFB454";
const F = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.author = "Project Launch Copilot team";
pres.title = "Project Launch Copilot — промежуточный статус";
pres.subject = "Промежуточная презентация проекта";
pres.company = "Project Launch Copilot team";

const W = 13.33;
const M = 0.62;
const CW = W - 2 * M; // 12.09

function newSlide(bg) {
  const s = pres.addSlide();
  s.background = { color: bg || BG };
  return s;
}

function title(s, text, sub) {
  s.addText(text, {
    x: M, y: 0.42, w: CW, h: 0.62,
    fontFace: F, fontSize: 32, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  if (sub) {
    s.addText(sub, {
      x: M, y: 1.06, w: CW, h: 0.34,
      fontFace: F, fontSize: 14, color: PURPLE_LT, isTextBox: true, margin: 0,
    });
  }
}

function footer(s, n, note) {
  s.addText(note || "AI Product Hack 2026 · Project Launch Copilot for MWS Tables", {
    x: M, y: 6.95, w: CW - 0.8, h: 0.3,
    fontFace: F, fontSize: 9.5, color: "6E5F96", isTextBox: true, margin: 0,
  });
  s.addText(String(n), {
    x: W - M - 0.6, y: 6.95, w: 0.6, h: 0.3,
    fontFace: F, fontSize: 9.5, color: "6E5F96", align: "right", isTextBox: true, margin: 0,
  });
}

function card(s, x, y, w, h, fill) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.09,
    fill: { color: fill || CARD }, line: { color: "372B6B", width: 0.75 },
  });
}

function bullets(s, items, opts) {
  const runs = items.map((t, i) => ({
    text: t,
    options: { bullet: true, breakLine: i !== items.length - 1 },
  }));
  s.addText(runs, Object.assign({
    fontFace: F, fontSize: 13, color: "E4DEF5", isTextBox: true, valign: "top",
    paraSpaceAfter: 7, lineSpacing: 17,
  }, opts));
}

/* ─────────────────────────── 1. Титул ─────────────────────────── */
{
  const s = newSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: 9.4, y: -1.9, w: 6.2, h: 6.2, fill: { color: PURPLE, transparency: 82 }, line: { type: "none" },
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: 10.9, y: 3.6, w: 4.4, h: 4.4, fill: { color: "4A2FA8", transparency: 84 }, line: { type: "none" },
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 1.62, w: 3.05, h: 0.38, rectRadius: 0.19,
    fill: { color: PURPLE }, line: { type: "none" },
  });
  s.addText("ПРОМЕЖУТОЧНАЯ ВЕРСИЯ", {
    x: M, y: 1.62, w: 3.05, h: 0.38, fontFace: F, fontSize: 10.5, bold: true,
    color: WHITE, align: "center", charSpacing: 1, isTextBox: true, margin: 0,
  });

  s.addText("Project Launch\nCopilot", {
    x: M, y: 2.16, w: 8.2, h: 1.85, fontFace: F, fontSize: 54, bold: true,
    color: WHITE, lineSpacing: 56, isTextBox: true, margin: 0,
  });
  s.addText("Помощник подготовки и запуска проектов в MWS Tables:\nпроверка данных, дубли, связи, задачи и исполнители — с preview и подтверждением", {
    x: M, y: 4.12, w: 8.4, h: 0.8, fontFace: F, fontSize: 15.5, color: PURPLE_LT,
    lineSpacing: 22, isTextBox: true, margin: 0,
  });

  const meta = [
    ["Задача", "Автоматизация подготовки заявок к запуску"],
    ["Команда", "Тимофей Махель · Алина Крылова · Глеб Панин"],
    ["Дата", "4 сентября 2026 · финальная защита 7 сентября"],
  ];
  meta.forEach(([k, v], i) => {
    const y = 5.22 + i * 0.44;
    s.addText(k, {
      x: M, y, w: 1.3, h: 0.36, fontFace: F, fontSize: 12, color: "7B6BA8", isTextBox: true, margin: 0,
    });
    s.addText(v, {
      x: M + 1.35, y, w: 7.6, h: 0.36, fontFace: F, fontSize: 12.5, color: "E4DEF5", isTextBox: true, margin: 0,
    });
  });
}

/* ─────────────────────── 2. Проблематика ─────────────────────── */
{
  const s = newSlide();
  title(s, "Проблематика", "Подготовка заявки к запуску проекта — ручная, разрозненная и дорогая");

  const stats = [
    ["200", "новых или изменяемых\nзаявок в месяц", PURPLE_LT],
    ["50 мин", "ручной подготовки\nодной заявки", PURPLE_LT],
    ["167 ч", "ручной работы\nв месяц", AMBER],
    ["~4 млн ₽", "прямых затрат\nв год", AMBER],
  ];
  const sw = 2.85, gap = 0.23;
  stats.forEach(([big, lab, col], i) => {
    const x = M + i * (sw + gap);
    card(s, x, 1.62, sw, 1.62);
    s.addText(big, {
      x: x + 0.22, y: 1.76, w: sw - 0.44, h: 0.72, fontFace: F, fontSize: 34, bold: true,
      color: col, isTextBox: true, margin: 0,
    });
    s.addText(lab, {
      x: x + 0.22, y: 2.5, w: sw - 0.44, h: 0.62, fontFace: F, fontSize: 12, color: MUTED,
      lineSpacing: 15, isTextBox: true, margin: 0,
    });
  });

  s.addText("Что происходит сейчас", {
    x: M, y: 3.52, w: 5.9, h: 0.34, fontFace: F, fontSize: 17, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  bullets(s, [
    "Заявки приходят через формы, импорт файлов и ручной ввод — структура и качество источников различаются",
    "Администратор проектного офиса вручную правит значения, ищет дубли, связывает записи со справочниками",
    "Затем определяет тип и приоритет, проверяет бюджет и сроки, создаёт задачи и назначает исполнителей",
  ], { x: M, y: 3.92, w: 5.9, h: 2.6 });

  s.addText("Из-за чего ломается", {
    x: M + 6.19, y: 3.52, w: 5.9, h: 0.34, fontFace: F, fontSize: 17, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  bullets(s, [
    "Разные форматы дат и телефонов, лишние пробелы, регистр, варианты «е/ё», кириллица и латиница",
    "Неполные и подозрительные значения порождают дубли и ошибочные связи между таблицами",
    "Страдают поиск, аналитика и вся дальнейшая работа с проектом; потери от задержек в 4 млн ₽ не учтены",
  ], { x: M + 6.19, y: 3.92, w: 5.9, h: 2.6 });

  footer(s, 2);
}

/* 3. Конкуренты */
{
  const s = newSlide();
  title(s, "Конкуренты", "В РФ у нас один прямой конкурент");

  const cards = [
    ["Airtable в России не работает", "Блокировка аккаунтов с 19 февраля 2026, оплата картами РФ закрыта с 2022. Реестр ПО и 152-ФЗ обязательны для крупного бизнеса и госсектора."],
    ["Weeek, Kaiten, Яндекс 360 — не про это", "Таск-трекеры и офисный пакет, а не конструкторы связанных таблиц. Нет двусторонних связей между записями."],
    ["Бипиум — один такой, и слабый", "Интерфейс тяжёлый на больших объёмах, формулы только внутри строки, API — 100 запросов за 30 секунд на аккаунт."],
  ];
  const cw3 = 3.87;
  cards.forEach(([h, d], i) => {
    const x = M + i * (cw3 + 0.24);
    card(s, x, 1.7, cw3, 3.9);
    s.addText(h, {
      x: x + 0.3, y: 2.0, w: cw3 - 0.6, h: 1.3, fontFace: F, fontSize: 18, bold: true,
      color: WHITE, lineSpacing: 23, isTextBox: true, margin: 0,
    });
    s.addText(d, {
      x: x + 0.3, y: 3.3, w: cw3 - 0.6, h: 2.1, fontFace: F, fontSize: 13, color: "E4DEF5",
      lineSpacing: 18, valign: "top", isTextBox: true, margin: 0,
    });
  });

  footer(s, 3);
}

/* ──────────────── 4. Постановка задачи и критерии ──────────────── */
{
  const s = newSlide();
  title(s, "Постановка задачи и критерии успеха", "Что именно мы делаем и по чему будем измерять результат");

  card(s, M, 1.62, 5.55, 4.9);
  s.addText("Цель", {
    x: M + 0.3, y: 1.86, w: 4.95, h: 0.34, fontFace: F, fontSize: 17, bold: true, color: PURPLE_LT, isTextBox: true, margin: 0,
  });
  s.addText("Превратить пользовательский импорт в рабочее пространство.", {
    x: M + 0.3, y: 2.24, w: 4.95, h: 0.82, fontFace: F, fontSize: 14, color: "E4DEF5", lineSpacing: 19, isTextBox: true, margin: 0,
  });
  s.addText("Ключевые требования", {
    x: M + 0.3, y: 3.12, w: 4.95, h: 0.32, fontFace: F, fontSize: 15, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  bullets(s, [
    "JavaScript Widget Script внутри MWS Tables, без жёсткой привязки к ID таблиц и полей",
    "Каждая рекомендация объяснима: было → станет, причина, уверенность",
    "Preview и подтверждение до любых массовых изменений; исходные записи не удаляются",
    "Базовая очистка, matching и создание задач работают без LLM",
    "Повторный запуск идемпотентен: 0 дублей задач и связей",
  ], { x: M + 0.3, y: 3.5, w: 4.95, h: 2.85, fontSize: 12.5 });

  const metrics = [
    ["≥ 70%", "заявок готовы к запуску после одного прохода без ручной правки ячеек", MINT],
    ["≤ 10 мин", "медианное время подготовки заявки вместо модельных 50 минут", MINT],
    ["≥ 90%", "precision предложений по дублям и сопоставлению справочников", MINT],
    ["≥ 80%", "recall — обнаружение заложенных дублей и ошибок", MINT],
    ["100% / 0", "массовых изменений с preview / повторных связей и задач", PURPLE_LT],
  ];
  const bx = M + 5.85, bw = CW - 5.85;
  s.addText("Целевые метрики", {
    x: bx, y: 1.62, w: bw, h: 0.34, fontFace: F, fontSize: 17, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  metrics.forEach(([v, t, c], i) => {
    const y = 2.06 + i * 0.9;
    card(s, bx, y, bw, 0.76, CARD2);
    s.addText(v, {
      x: bx + 0.24, y: y + 0.08, w: 1.75, h: 0.6, fontFace: F, fontSize: 21, bold: true,
      color: c, valign: "middle", isTextBox: true, margin: 0,
    });
    s.addText(t, {
      x: bx + 2.06, y: y + 0.08, w: bw - 2.3, h: 0.6, fontFace: F, fontSize: 12.5, color: "E4DEF5",
      valign: "middle", lineSpacing: 15, isTextBox: true, margin: 0,
    });
  });

  footer(s, 4, "Целевые пороги. Фактические значения будут измерены после реализации.");
}

/* ─────────────── 5. Подход: двухэтапная валидация ─────────────── */
{
  const s = newSlide();
  title(s, "Выбранный подход: двухэтапная валидация", "Сценарий согласован с заказчиком 3 сентября");

  const steps = [
    ["1", "Проверка источника", "Сразу после импорта: ошибки, подозрительные значения и возможные дубли внутри одного источника"],
    ["2", "Объяснимые рекомендации", "Единый список: было → станет, причина и уровень уверенности. Неоднозначное остаётся человеку"],
    ["3", "Preview и подтверждение", "Пользователь принимает или отклоняет отдельные действия. Только после этого данные меняются"],
    ["4", "Связи и справочники", "Создаются только подтверждённые связи; оператор донастраивает Magic Link между источниками"],
    ["5", "Межтабличная проверка", "Повторная валидация уже связанного набора: блокирующие ошибки возвращаются оператору"],
    ["6", "Доверенное представление", "Шаблон проекта, задачи, рекомендации исполнителей и итоговая сводка запуска"],
  ];
  const cw3 = 3.87, ch = 2.16, gx = 0.24, gy = 0.24;
  steps.forEach((st, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = M + col * (cw3 + gx);
    const y = 1.7 + row * (ch + gy);
    card(s, x, y, cw3, ch);
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.26, y: y + 0.24, w: 0.46, h: 0.46, fill: { color: PURPLE }, line: { type: "none" },
    });
    s.addText(st[0], {
      x: x + 0.26, y: y + 0.24, w: 0.46, h: 0.46, fontFace: F, fontSize: 14, bold: true,
      color: WHITE, align: "center", valign: "middle", isTextBox: true, margin: 0,
    });
    s.addText(st[1], {
      x: x + 0.86, y: y + 0.26, w: cw3 - 1.12, h: 0.44, fontFace: F, fontSize: 15, bold: true,
      color: WHITE, valign: "middle", isTextBox: true, margin: 0,
    });
    s.addText(st[2], {
      x: x + 0.26, y: y + 0.86, w: cw3 - 0.52, h: 1.12, fontFace: F, fontSize: 12, color: MUTED,
      lineSpacing: 15.5, isTextBox: true, margin: 0,
    });
  });

  s.addText("Человек подтверждает каждое неоднозначное решение вручную.", {
    x: M, y: 6.4, w: CW, h: 0.36, fontFace: F, fontSize: 13, italic: true, color: PURPLE_LT, isTextBox: true, margin: 0,
  });

  footer(s, 5);
}

/* ───────────────── 6. Схема решения ───────────────── */
{
  const s = newSlide();
  title(s, "Схема решения", "Вся обработка выполняется внутри Widget Script");

  const flow = ["Выбор записей\nи справочников", "Нормализация\nи проверки", "Дубли\nи matching", "Список\nрекомендаций", "Выбор\nпользователя", "Запись изменений\nи связей", "Задачи\nи отчёт"];
  const fw = 1.55, fgap = 0.18, fh = 1.15, fy = 1.66;
  flow.forEach((t, i) => {
    const x = M + i * (fw + fgap);
    const isUser = i === 4;
    card(s, x, fy, fw, fh, isUser ? PURPLE : CARD2);
    s.addText(t, {
      x: x + 0.08, y: fy, w: fw - 0.16, h: fh, fontFace: F, fontSize: 10.5, bold: true,
      color: isUser ? WHITE : "E4DEF5", align: "center", valign: "middle", lineSpacing: 13.5, isTextBox: true, margin: 0,
    });
    if (i < flow.length - 1) {
      s.addText("›", {
        x: x + fw, y: fy, w: fgap, h: fh, fontFace: F, fontSize: 16, bold: true,
        color: "6E5F96", align: "center", valign: "middle", isTextBox: true, margin: 0,
      });
    }
  });
  s.addText("Фиолетовый блок — обязательное подтверждение человеком: до него данные не меняются", {
    x: M, y: 2.86, w: CW, h: 0.3, fontFace: F, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0,
  });

  const blocks = [
    ["Детерминированное ядро", [
      "Нормализация email, телефонов, дат, регистра, «е/ё», городов, компаний и ФИО",
      "Каскадный matching: точные ключи → сравнение по нескольким полям → неоднозначное",
      "Шаблоны задач хранятся в таблице, а не в коде виджета",
    ]],
    ["AI-слой (опционально)", [
      "Приоритет реализации: классификация заявки и LLM-проверка неоднозначных соответствий",
      "В резерве: поиск аномалий и оптимизация распределения задач",
      "LLM вызывается только в спорных случаях — базовый сценарий работает без него",
    ]],
    ["Guardrails", [
      "Исходные записи не удаляются; повторный запуск не создаёт дубли задач и связей",
      "Endpoint, модель и токен — в конфигурации, секретов в коде нет",
      "Данные уходят наружу только после явного действия пользователя",
    ]],
  ];
  const bw3 = 3.87;
  blocks.forEach(([h, items], i) => {
    const x = M + i * (bw3 + 0.24);
    card(s, x, 3.3, bw3, 3.16);
    s.addText(h, {
      x: x + 0.26, y: 3.5, w: bw3 - 0.52, h: 0.34, fontFace: F, fontSize: 15, bold: true,
      color: PURPLE_LT, isTextBox: true, margin: 0,
    });
    bullets(s, items, { x: x + 0.26, y: 3.88, w: bw3 - 0.52, h: 2.4, fontSize: 11.5 });
  });

  footer(s, 6);
}

/* ──────────── 7. Техническая реализация ──────────── */
{
  const s = newSlide();
  title(s, "Техническая реализация", "Два независимых трека разработки");

  const cw2 = 5.9, ch2 = 4.6, y2 = 1.8;
  const tracks = [
    ["Веб-приложение", "Фронтенд с продвинутой реализацией фичей", "Сквозной сценарий проверки заявки — от импорта до задач и исполнителей — уже работает как самостоятельное демо-приложение."],
    ["Widget Script", "Виджет для встройки в MWS Tables", "Та же логика в формате, который встраивается в текущий функционал заказчика — без сборщика и внешних зависимостей."],
  ];
  tracks.forEach(([tag, h, d], i) => {
    const x = M + i * (cw2 + 0.29);
    card(s, x, y2, cw2, ch2, i === 0 ? CARD2 : CARD);
    s.addShape(pres.ShapeType.roundRect, {
      x: x + 0.32, y: y2 + 0.32, w: 2.5, h: 0.4, rectRadius: 0.2,
      fill: { color: PURPLE, transparency: 15 }, line: { type: "none" },
    });
    s.addText(tag, {
      x: x + 0.32, y: y2 + 0.32, w: 2.5, h: 0.4, fontFace: F, fontSize: 11.5, bold: true,
      color: WHITE, align: "center", valign: "middle", isTextBox: true, margin: 0,
    });
    s.addText(h, {
      x: x + 0.32, y: y2 + 1.1, w: cw2 - 0.64, h: 0.9, fontFace: F, fontSize: 22, bold: true,
      color: WHITE, lineSpacing: 27, isTextBox: true, margin: 0,
    });
    s.addText(d, {
      x: x + 0.32, y: y2 + 2.5, w: cw2 - 0.64, h: 1.7, fontFace: F, fontSize: 14, color: "E4DEF5",
      lineSpacing: 20, valign: "top", isTextBox: true, margin: 0,
    });
  });

  footer(s, 7);
}

/* 8. Виджет в MWS Tables — импорт */
{
  const s = newSlide();
  title(s, "Как это работает в MWS Tables", "Импорт и нормализация выполняются прямо в панели виджета");

  const path = require("path");
  // Кроп на информативную часть скриншота (панель виджета со скриптом и логом,
  // без левой половины с исходной таблицей) — крупнее и без лишнего на слайде.
  const srcW = 2940, srcH = 1670, cropX0 = 1660, cropW = srcW - cropX0;
  const H = 5.3, scale = H / srcH;
  const imgW = cropW * scale, imgH = H;
  const imgX = M, imgY = 1.65;
  s.addImage({
    path: path.join(__dirname, "assets", "widget-import.png"),
    x: imgX, y: imgY, w: srcW * scale, h: srcH * scale,
    sizing: { type: "crop", x: cropX0 * scale, y: 0, w: imgW, h: imgH },
  });

  const bx = imgX + imgW + 0.4, bw = CW - imgW - 0.4;
  card(s, bx, imgY, bw, imgH, CARD2);
  s.addText("Скрипт выполняется прямо в панели виджета", {
    x: bx + 0.32, y: imgY + 0.34, w: bw - 0.64, h: 1.0, fontFace: F, fontSize: 20, bold: true,
    color: WHITE, lineSpacing: 25, isTextBox: true, margin: 0,
  });
  bullets(s, [
    "Импорт делится на партиции по 100 записей — 84 партиции, 8 359 строк",
    "Прогресс обработки виден построчно, в реальном времени",
    "По завершении — статус «Готово», прямо в MWS Tables",
  ], { x: bx + 0.32, y: imgY + 1.5, w: bw - 0.64, h: imgH - 1.7, fontSize: 15, lineSpacing: 20, paraSpaceAfter: 10 });

  footer(s, 8);
}

/* 9. Виджет в MWS Tables — preview и подтверждение */
{
  const s = newSlide();
  title(s, "Как это работает в MWS Tables", "Preview и подтверждение — до этого момента данные не меняются");

  const path = require("path");
  const imgH2 = 5.3, imgW2 = imgH2 * (1310 / 1594);
  const imgX2 = M, imgY2 = 1.65;
  s.addImage({
    path: path.join(__dirname, "assets", "widget-preview.png"),
    x: imgX2, y: imgY2, w: imgW2, h: imgH2,
  });

  const bx = imgX2 + imgW2 + 0.4, bw = CW - imgW2 - 0.4;
  card(s, bx, imgY2, bw, imgH2, CARD2);
  s.addText("Каждая правка — «было → стало»", {
    x: bx + 0.32, y: imgY2 + 0.34, w: bw - 0.64, h: 0.9, fontFace: F, fontSize: 20, bold: true,
    color: WHITE, lineSpacing: 25, isTextBox: true, margin: 0,
  });
  bullets(s, [
    "24 386 исправлений найдено в одном источнике: «ё/е», лишние пробелы, служебные символы",
    "Ничего не применяется, пока оператор не введёт подтверждение",
    "Так же проверяются дубли и связи между таблицами",
  ], { x: bx + 0.32, y: imgY2 + 1.4, w: bw - 0.64, h: imgH2 - 1.6, fontSize: 15, lineSpacing: 20, paraSpaceAfter: 10 });

  footer(s, 9);
}

/* ──────────── 10. Выполненные этапы и первые результаты ──────────── */
{
  const s = newSlide();
  title(s, "Выполненные этапы и первые результаты", "Продуктовый и исследовательский контур закрыт, реализация виджета стартует");

  s.addText("Что сделано", {
    x: M, y: 1.6, w: 5.55, h: 0.34, fontFace: F, fontSize: 17, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  const done = [
    "Зафиксированы baseline требований и постановка задачи",
    "Описаны пользователь, проблема, целевой сценарий и продуктовые метрики",
    "Двухэтапный сценарий проверки согласован с заказчиком",
    "Разобраны смежные продукты и подходы к похожим функциям",
    "Построена сценарная модель unit-экономики в Excel",
    "Профилирована dev-выборка, изучены представления, таблицы и связи MWS Tables",
    "Начата проработка алгоритмов и guardrails",
  ];
  done.forEach((t, i) => {
    const y = 2.02 + i * 0.62;
    s.addShape(pres.ShapeType.ellipse, {
      x: M, y: y + 0.05, w: 0.28, h: 0.28, fill: { color: MINT, transparency: 78 }, line: { color: MINT, width: 0.75 },
    });
    s.addText("✓", {
      x: M, y: y + 0.05, w: 0.28, h: 0.28, fontFace: F, fontSize: 10, bold: true, color: MINT,
      align: "center", valign: "middle", isTextBox: true, margin: 0,
    });
    s.addText(t, {
      x: M + 0.42, y, w: 5.1, h: 0.56, fontFace: F, fontSize: 12.5, color: "E4DEF5",
      valign: "middle", lineSpacing: 15.5, isTextBox: true, margin: 0,
    });
  });

  const bx = M + 6.19, bw = CW - 6.19;
  s.addText("Первые результаты", {
    x: bx, y: 1.6, w: bw, h: 0.34, fontFace: F, fontSize: 17, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });

  card(s, bx, 2.02, bw, 2.12);
  s.addText("Профиль dev-выборки", {
    x: bx + 0.26, y: 2.24, w: bw - 0.52, h: 0.3, fontFace: F, fontSize: 13.5, bold: true, color: PURPLE_LT, isTextBox: true, margin: 0,
  });
  const nums = [["10 000", "записей"], ["82", "столбца"], ["6 800", "заявок"], ["1 400", "компаний"], ["240", "сотрудников"], ["1 560", "задач и шаблонов"]];
  nums.forEach(([n, l], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = bx + 0.26 + col * ((bw - 0.52) / 3);
    const y = 2.72 + row * 0.66;
    s.addText(n, {
      x, y, w: (bw - 0.52) / 3, h: 0.32, fontFace: F, fontSize: 19, bold: true, color: WHITE, isTextBox: true, margin: 0,
    });
    s.addText(l, {
      x, y: y + 0.28, w: (bw - 0.52) / 3, h: 0.24, fontFace: F, fontSize: 10.5, color: MUTED, isTextBox: true, margin: 0,
    });
  });

  card(s, bx, 4.34, bw, 2.14);
  s.addText("Проверено на модели экономики", {
    x: bx + 0.26, y: 4.56, w: bw - 0.52, h: 0.3, fontFace: F, fontSize: 13.5, bold: true, color: PURPLE_LT, isTextBox: true, margin: 0,
  });
  s.addText("Три сценария выручки и затрат, трудозатраты, BYOK, возврат затрат на запуск и граничные условия — с явными допущениями вместо внутренних данных MWS.", {
    x: bx + 0.26, y: 4.94, w: bw - 0.52, h: 1.3, fontFace: F, fontSize: 12.5, color: "E4DEF5", lineSpacing: 17, valign: "top", isTextBox: true, margin: 0,
  });

  footer(s, 10);
}

/* ──────────── 11. Unit-экономика и монетизация ──────────── */
{
  const s = newSlide();
  title(s, "Unit-экономика и упаковка", "Статус: сценарная гипотеза, не прогноз и не утверждённая цена");

  const cards = [
    ["Единица оплаты", "Успешно завершённая и принятая пользователем подготовка уникальной версии заявки — не запуск виджета, не токен и не задача.", "Preview, retry и повтор того же результата не создают нового списания."],
    ["Гипотеза упаковки", "Платный модуль на команду с общим пулом подготовок и прозрачной доплатой за превышение — вместо новых базовых тарифов.", "Ориентиры рынка: Airtable AI (пул кредитов), Asana AI Studio (расширение поверх продукта)."],
    ["Главная неопределённость", "Не стоимость токенов, а платёжеспособный спрос, поддержка и достаточное число покупателей.", "Модуль за ~3 000 ₽/мес. — это +156% к наблюдаемому пакету на 4 места, то есть отдельная покупка."],
  ];
  const cw3 = 3.87;
  cards.forEach(([h, a, b], i) => {
    const x = M + i * (cw3 + 0.24);
    card(s, x, 1.66, cw3, 3.0);
    s.addText(h, {
      x: x + 0.28, y: 1.9, w: cw3 - 0.56, h: 0.34, fontFace: F, fontSize: 16, bold: true, color: PURPLE_LT, isTextBox: true, margin: 0,
    });
    s.addText(a, {
      x: x + 0.28, y: 2.32, w: cw3 - 0.56, h: 1.1, fontFace: F, fontSize: 12.5, color: "E4DEF5", lineSpacing: 16.5, valign: "top", isTextBox: true, margin: 0,
    });
    s.addText(b, {
      x: x + 0.28, y: 3.5, w: cw3 - 0.56, h: 1.0, fontFace: F, fontSize: 11.5, color: MUTED, lineSpacing: 15.5, valign: "top", isTextBox: true, margin: 0,
    });
  });

  card(s, M, 4.86, CW, 1.62, CARD2);
  s.addText("Модель продажи", {
    x: M + 0.3, y: 5.04, w: CW - 0.6, h: 0.32, fontFace: F, fontSize: 15, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  s.addText([
    { text: "Продаём сквозную подготовку заявки с контролем изменений, а не «доступ к LLM».", options: { bullet: true, breakLine: true } },
    { text: "Дорогая обработка неоднозначных случаев включается отдельно, по явному действию пользователя — это же требование заложено в архитектуру решения.", options: { bullet: true, breakLine: true } },
    { text: "Внутренних коммерческих данных MWS у команды нет: цифры выше — сценарии из открытых источников и наблюдаемого тарифа.", options: { bullet: true } },
  ], {
    x: M + 0.3, y: 5.4, w: CW - 0.6, h: 1.0, fontFace: F, fontSize: 12, color: "E4DEF5",
    lineSpacing: 16, paraSpaceAfter: 4, valign: "top", isTextBox: true,
  });

  footer(s, 11);
}

/* ──────────── 12. Риски и план до финала ──────────── */
{
  const s = newSlide();
  title(s, "Основные риски и план до финальной защиты", "Финальная сдача — 7 сентября 2026, 10:00");

  s.addText("Риски и ограничения", {
    x: M, y: 1.6, w: 5.55, h: 0.34, fontFace: F, fontSize: 17, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  const risks = [
    ["Высокий", "Реальный API Widget Script может отличаться от публичной документации AITable", "Ранняя проверка возможностей в предоставленном пространстве; отказ от механик, которых там нет", AMBER],
    ["Высокий", "Кода виджета пока нет — весь объём реализации приходится на 3 дня", "Жёсткий приоритет: сначала сквозной базовый сценарий без LLM, AI-функции сверху", AMBER],
    ["Средний", "Эталонной разметки нет; настроенные на dev-выборке алгоритмы нельзя на ней же и оценивать", "Отдельный протокол оценки и отложенная часть выборки под проверку качества", PURPLE_LT],
    ["Средний", "Схема связанных таблиц и UX preview не зафиксированы с заказчиком", "Конфигурируемый выбор таблиц и полей без привязки к ID снижает цену изменения", PURPLE_LT],
  ];
  risks.forEach(([lvl, r, m, c], i) => {
    const y = 2.04 + i * 1.14;
    card(s, M, y, 5.55, 1.04);
    s.addText(lvl, {
      x: M + 0.24, y: y + 0.14, w: 0.9, h: 0.24, fontFace: F, fontSize: 9.5, bold: true, color: c, charSpacing: 0.5, isTextBox: true, margin: 0,
    });
    s.addText(r, {
      x: M + 1.18, y: y + 0.12, w: 4.15, h: 0.44, fontFace: F, fontSize: 12, bold: true, color: WHITE, lineSpacing: 14.5, isTextBox: true, margin: 0,
    });
    s.addText(m, {
      x: M + 1.18, y: y + 0.56, w: 4.15, h: 0.42, fontFace: F, fontSize: 10.5, color: MUTED, lineSpacing: 13, isTextBox: true, margin: 0,
    });
  });

  const bx = M + 6.19, bw = CW - 6.19;
  s.addText("План до 7 сентября", {
    x: bx, y: 1.6, w: bw, h: 0.34, fontFace: F, fontSize: 17, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  const plan = [
    ["5 сен", "Архитектура и схема таблиц; нормализация, поиск дублей, matching и preview"],
    ["6 сен", "Связи, задачи из шаблонов, рекомендации исполнителей; идемпотентный повторный запуск"],
    ["6–7 сен", "Классификация заявок и LLM-проверка неоднозначных соответствий; пороги и guardrails"],
    ["7 сен", "Проверки на dev-выборке, инструкция по установке, описание алгоритмов и демонстрация"],
  ];
  plan.forEach(([d, t], i) => {
    const y = 2.04 + i * 1.14;
    card(s, bx, y, bw, 1.04, CARD2);
    s.addText(d, {
      x: bx + 0.24, y: y + 0.14, w: 1.0, h: 0.32, fontFace: F, fontSize: 13, bold: true, color: MINT, isTextBox: true, margin: 0,
    });
    s.addText(t, {
      x: bx + 1.3, y: y + 0.12, w: bw - 1.55, h: 0.82, fontFace: F, fontSize: 12, color: "E4DEF5", lineSpacing: 16, isTextBox: true, margin: 0,
    });
  });

  footer(s, 12, "Резерв по объёму: поиск аномалий и оптимизация распределения задач добавляются только при готовом базовом сценарии.");
}

/* ──────────── 13. Команда ──────────── */
{
  const s = newSlide();
  title(s, "Команда и зоны ответственности", "Все участники активно вовлечены и участвуют в создании решения");

  const team = [
    ["ТМ", "Тимофей Махель", "AI Product", "Продукт, метрики и экономика",
      ["Продуктовые материалы и целевой сценарий", "Метрики успеха и правила их расчёта", "Unit-экономика функции и модель в Excel", "Разбор моделей конкурентов, анализ данных"],
      "Формирование решения и участие в его создании"],
    ["АК", "Алина Крылова", "AI Engineer", "Требования и функциональность",
      ["Анализ проекта и требований", "JTBD-матрица пользователей", "Проработка состава функций", "Ревью и дополнение продуктовых материалов"],
      "Формирование и создание решения"],
    ["ГП", "Глеб Панин", "AI Engineer", "Конкуренты и проработка функций",
      ["Анализ конкурентных решений", "Проработка функций продукта", "Ревью решения и сценария"],
      "Формирование и создание решения"],
  ];
  const cw3 = 3.87;
  team.forEach(([ini, name, role, area, tasks, now], i) => {
    const x = M + i * (cw3 + 0.24);
    card(s, x, 1.66, cw3, 4.82);
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.28, y: 1.94, w: 0.78, h: 0.78, fill: { color: PURPLE }, line: { type: "none" },
    });
    s.addText(ini, {
      x: x + 0.28, y: 1.94, w: 0.78, h: 0.78, fontFace: F, fontSize: 20, bold: true, color: WHITE,
      align: "center", valign: "middle", isTextBox: true, margin: 0,
    });
    s.addText(name, {
      x: x + 1.2, y: 1.98, w: cw3 - 1.48, h: 0.34, fontFace: F, fontSize: 16, bold: true, color: WHITE, isTextBox: true, margin: 0,
    });
    s.addText(role, {
      x: x + 1.2, y: 2.32, w: cw3 - 1.48, h: 0.3, fontFace: F, fontSize: 12.5, color: PURPLE_LT, isTextBox: true, margin: 0,
    });

    s.addText("Зона ответственности", {
      x: x + 0.28, y: 2.92, w: cw3 - 0.56, h: 0.26, fontFace: F, fontSize: 10, bold: true, color: "7B6BA8", charSpacing: 0.4, isTextBox: true, margin: 0,
    });
    s.addText(area, {
      x: x + 0.28, y: 3.18, w: cw3 - 0.56, h: 0.3, fontFace: F, fontSize: 13, color: "E4DEF5", isTextBox: true, margin: 0,
    });

    s.addText("Выполненные задачи", {
      x: x + 0.28, y: 3.6, w: cw3 - 0.56, h: 0.26, fontFace: F, fontSize: 10, bold: true, color: "7B6BA8", charSpacing: 0.4, isTextBox: true, margin: 0,
    });
    bullets(s, tasks, { x: x + 0.28, y: 3.86, w: cw3 - 0.56, h: 1.72, fontSize: 11.5, lineSpacing: 15, paraSpaceAfter: 4 });

    s.addShape(pres.ShapeType.roundRect, {
      x: x + 0.28, y: 5.66, w: cw3 - 0.56, h: 0.6, rectRadius: 0.08,
      fill: { color: "2A4A46" }, line: { type: "none" },
    });
    s.addText("Сейчас: " + now, {
      x: x + 0.42, y: 5.66, w: cw3 - 0.84, h: 0.6, fontFace: F, fontSize: 11, color: MINT,
      valign: "middle", lineSpacing: 14, isTextBox: true, margin: 0,
    });
  });

  footer(s, 13);
}

// writeFile() в pptxgenjs 4.0.1 игнорирует compression в Node, поэтому пишем поток сами.
const out = process.argv[2] || "deck.pptx";
pres.stream({ compression: true }).then(buf => {
  require("fs").writeFileSync(out, buf);
  console.log("OK " + out);
});
