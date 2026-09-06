/* ============================================================
   Микро-виджет #04: Нормализация Дат
   ------------------------------------------------------------
   ЧТО ДЕЛАЕТ (правила нормализации):
   • YYYY-MM-DD (2024-01-15) → 2024-01-15 (оставляет)
   • DD.MM.YYYY (15.01.2024) → 2024-01-15
   • DD.MM.YY (15.01.24) → 2024-01-15
   • N месяц ГГГГ (15 января 2024) → 2024-01-15
   • Неверные компоненты (месяц >12, день >31) → флаг "неверные компоненты"
   • Нераспознанный формат → флаг "формат даты"
   
   УМНАЯ ДЕТЕКЦИЯ: По названию (date, дата, start, end) и паттернам
   ============================================================ */

(async function() {
  const datasheet = await space.getActiveDatasheetAsync();
  const records = await datasheet.getRecordsAsync();
  
  output.markdown('# 📅 Виджет #04: Нормализация Дат');
  output.markdown('Таблица: **' + datasheet.name + '**');
  output.markdown('');
  output.markdown('## Что делает:');
  output.markdown('- 15.01.2024 → 2024-01-15');
  output.markdown('- 15.01.24 → 2024-01-15');
  output.markdown('- 15 января 2024 → 2024-01-15');
  output.markdown('- Неправильные даты → флаг');
  output.markdown('');
  
  // =========================================================
  //  ШАГ 1. УМНАЯ ДЕТЕКЦИЯ ПОЛЕЙ
  // =========================================================
  output.markdown('## Шаг 1. Определение полей');
  output.markdown('');
  
  const SKIP_TYPES = [
    'number', 'autoNumber', 'currency', 'percent', 'rating',
    'singleSelect', 'multiSelect', 'dateTime', 'createdTime',
    'lastModifiedTime', 'formula', 'cascader',
    'createdUser', 'lastModifiedUser', 'singleLink', 'multipleLink',
    'oneWayLink', 'twoWayLink', 'attachment', 'phone', 'email',
    'url', 'checkbox', 'user', 'group', 'location', 'button',
    'map', 'address', 'tag'
  ];
  
  const textFields = datasheet.fields.filter(f => !SKIP_TYPES.includes(f.type));
  
  // 1. Ищем по названию
  const DATE_HINTS = ['date', 'дата', 'start', 'end', 'начал', 'оконч', 'план', 'deadline'];
  const dateFieldsByName = textFields.filter(f => {
    const name = f.name.toLowerCase();
    return DATE_HINTS.some(hint => name.includes(hint));
  });
  
  // 2. Анализируем содержимое (ищем форматы дат)
  const dateFieldsByContent = [];
  const DATE_PATTERNS = [
    /^\d{4}-\d{2}-\d{2}$/,           // YYYY-MM-DD
    /^\d{2}\.\d{2}\.\d{4}$/,          // DD.MM.YYYY
    /^\d{2}\.\d{2}\.\d{2}$/,          // DD.MM.YY
    /^\d{1,2}\s+[а-яё]+\s+\d{4}$/i   // N месяц ГГГГ
  ];
  
  textFields.forEach(f => {
    if (dateFieldsByName.includes(f)) return;
    
    let dateMatches = 0;
    const sampleSize = Math.min(records.length, 20);
    
    for (let i = 0; i < sampleSize; i++) {
      const v = records[i].getCellValueString(f.id);
      if (v && String(v).trim()) {
        const str = String(v).trim();
        if (DATE_PATTERNS.some(p => p.test(str))) {
          dateMatches++;
        }
      }
    }
    
    // Если >50% значений похожи на даты
    if (dateMatches > 0 && dateMatches / sampleSize >= 0.5) {
      dateFieldsByContent.push(f);
    }
  });
  
  const allDateFields = [...dateFieldsByName, ...dateFieldsByContent];
  
  output.markdown('Найдено по **названию**: ' + dateFieldsByName.length);
  if (dateFieldsByName.length) {
    output.markdown('→ ' + dateFieldsByName.map(f => '`' + f.name + '`').join(', '));
  }
  
  output.markdown('Найдено по **содержимому** (формат даты): ' + dateFieldsByContent.length);
  if (dateFieldsByContent.length) {
    output.markdown('→ ' + dateFieldsByContent.map(f => '`' + f.name + '`').join(', '));
  }
  
  output.markdown('');
  output.markdown('Всего кандидатов: **' + allDateFields.length + '**');
  
  const confirmFields = await input.textAsync(
    'Обработать найденные поля? Введите:\n' +
    '- **да** (или Enter) — обработать все найденные\n' +
    '- Названия полей через запятую — обработать только их\n' +
    '- **нет** — отменить'
  );
  
  let fieldsToProcess = [];
  const answer = String(confirmFields || '').trim().toLowerCase();
  
  if (answer === 'да' || answer === 'yes' || answer === '') {
    fieldsToProcess = allDateFields;
  } else if (answer === 'нет' || answer === 'no') {
    output.markdown('');
    output.markdown('❌ Отменено пользователем');
    return;
  } else {
    const manualNames = answer.split(/[,;]+/).map(s => s.trim().toLowerCase());
    const nameMap = {};
    textFields.forEach(f => { nameMap[f.name.toLowerCase()] = f; });
    fieldsToProcess = manualNames.map(n => nameMap[n]).filter(f => f !== undefined);
    
    if (fieldsToProcess.length === 0) {
      output.markdown('');
      output.markdown('⚠️ Не найдено полей с такими названиями');
      return;
    }
  }
  
  output.markdown('');
  output.markdown('✅ Будут обработаны: ' + fieldsToProcess.map(f => '`' + f.name + '`').join(', '));
  output.markdown('');
  
  // =========================================================
  //  ШАГ 2. СБОР ИЗМЕНЕНИЙ
  // =========================================================
  output.markdown('## Шаг 2. Анализ данных');
  output.markdown('');
  
  const MONTHS_RU = {
    'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
    'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
    'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12
  };
  
  function normalizeDate(s) {
    let v = String(s).trim();
    let year, month, day;

    // YYYY-MM-DD или DD.MM.YYYY
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/) || v.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
    if (m) {
      if (m[1].length === 4) {
        year = +m[1]; month = +m[2]; day = +m[3];
      } else {
        day = +m[1]; month = +m[2]; year = +m[3];
      }
    } else {
      // DD.MM.YY
      const dd = v.match(/^(\d{2})[./](\d{2})[./](\d{2})$/);
      if (dd) {
        day = +dd[1]; month = +dd[2]; year = 2000 + +dd[3];
      } else {
        // N месяц ГГГГ
        const ru = v.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
        if (ru) {
          day = +ru[1];
          month = MONTHS_RU[ru[2].toLowerCase()];
          year = +ru[3];
          if (!month) {
            return { status: 'needs_input', from: s, to: v, reason: 'месяц не распознан' };
          }
        } else {
          return { status: 'needs_input', from: s, to: v, reason: 'формат даты' };
        }
      }
    }

    if (!(year >= 1900 && year <= 2100) || !(month >= 1 && month <= 12) || 
        !(day >= 1 && day <= 31)) {
      return { status: 'needs_input', from: s, to: v, reason: 'неверные компоненты' };
    }

    return { 
      status: 'ok', 
      from: s, 
      to: [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-'), 
      reason: 'дата' 
    };
  }
  
  const changes = [];
  const issues = [];
  let totalCells = 0;
  
  records.forEach((rec, idx) => {
    fieldsToProcess.forEach(f => {
      const raw = rec.getCellValueString(f.id);
      if (raw == null || String(raw).trim() === '') return;
      
      totalCells++;
      const result = normalizeDate(raw);
      
      if (result.status === 'needs_input') {
        issues.push({
          recordId: rec.id,
          field: f,
          from: raw,
          to: result.to,
          reason: result.reason,
          row: idx + 1
        });
      } else if (result.to !== raw) {
        changes.push({
          recordId: rec.id,
          field: f,
          from: raw,
          to: result.to,
          reason: result.reason,
          row: idx + 1
        });
      }
    });
  });
  
  output.markdown('Проверено ячеек: **' + totalCells + '**');
  output.markdown('Найдено исправлений: **' + changes.length + '**');
  output.markdown('Требуют ручной проверки: **' + issues.length + '**');
  output.markdown('');
  
  // Показываем статистику по форматам
  const formatStats = {};
  changes.forEach(c => {
    formatStats[c.reason] = (formatStats[c.reason] || 0) + 1;
  });
  
  if (Object.keys(formatStats).length > 0) {
    output.markdown('### Распределение по форматам');
    const formatTable = Object.entries(formatStats).map(([format, count]) => ({
      'Формат': format,
      'Количество': count
    }));
    output.table(formatTable);
    output.markdown('');
  }
  
  // =========================================================
  //  ШАГ 3. PREVIEW
  // =========================================================
  if (changes.length > 0) {
    output.markdown('### Исправления (первые 15)');
    output.table(changes.slice(0, 15).map(c => ({
      'Строка': c.row,
      'Столбец': c.field.name,
      'Было': c.from,
      '→': c.to,
      'Правило': c.reason
    })));
  }
  
  if (issues.length > 0) {
    output.markdown('');
    output.markdown('### ⚠️ Требуют ручной проверки (первые 10)');
    output.table(issues.slice(0, 10).map(i => ({
      'Строка': i.row,
      'Столбец': i.field.name,
      'Значение': i.from,
      'Причина': i.reason
    })));
  }
  
  if (changes.length === 0 && issues.length === 0) {
    output.markdown('ℹ️ Изменений не требуется — даты уже нормализованы');
    return;
  }
  
  // =========================================================
  //  ШАГ 4. ПОДТВЕРЖДЕНИЕ
  // =========================================================
  const confirmAnswer = await input.textAsync(
    'Применить **' + changes.length + '** исправлений?\n' +
    'Введите **да** для подтверждения:'
  );
  
  const confirm = String(confirmAnswer || '').trim().toLowerCase() === 'да' ||
                  String(confirmAnswer || '').trim().toLowerCase() === 'yes';
  
  // =========================================================
  //  ШАГ 5. ПРИМЕНЕНИЕ
  // =========================================================
  if (!confirm) {
    output.markdown('');
    output.markdown('❌ Применение отменено');
    return;
  }
  
  output.markdown('');
  output.markdown('## Применение изменений');
  output.markdown('');
  
  const byRecord = {};
  changes.forEach(c => {
    if (!byRecord[c.recordId]) {
      byRecord[c.recordId] = {};
    }
    byRecord[c.recordId][c.field.id] = c.to;
  });
  
  const updates = Object.keys(byRecord).map(id => ({
    id: id,
    valuesMap: byRecord[id]
  }));
  
  const BATCH_SIZE = 100;
  const batches = [];
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    batches.push(updates.slice(i, i + BATCH_SIZE));
  }
  
  let applied = 0;
  let failed = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batchNum = i + 1;
    try {
      await datasheet.updateRecordsAsync(batches[i]);
      applied += batches[i].length;
      const progress = Math.round((applied / updates.length) * 100);
      output.markdown('✓ Партиция #' + batchNum + '/' + batches.length +
                     ' — применено **' + batches[i].length + '** записей. ' +
                     'Прогресс: ' + applied + ' / ' + updates.length + ' (' + progress + '%)');
    } catch (e) {
      failed += batches[i].length;
      output.markdown('⚠️ Партиция #' + batchNum + ': ошибка — ' + (e.message || e));
    }
  }
  
  // =========================================================
  //  ИТОГ
  // =========================================================
  output.markdown('');
  output.markdown('# ✅ Готово');
  output.markdown('- Применено: **' + applied + '/' + updates.length + '** записей');
  output.markdown('- Требуют ручной проверки: **' + issues.length + '** записей');
  if (failed > 0) {
    output.markdown('- Ошибки: **' + failed + '** записей');
  }
  output.markdown('');
  output.markdown('---');
  output.markdown('_Запускайте следующий виджет для продолжения обработки_');
  
})().catch(e => {
  output.markdown('**❌ Ошибка:** ' + (e && e.message ? e.message : e));
});
