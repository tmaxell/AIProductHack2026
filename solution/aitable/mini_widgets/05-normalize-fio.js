/* ============================================================
   Микро-виджет #05: Нормализация ФИО
   ------------------------------------------------------------
   ЧТО ДЕЛАЕТ (правила нормализации):
   • иванов иван → Иванов Иван (Title Case)
   • иванов иван иванович → Иванов Иван Иванович
   • ИВАНОВ ИВАН → Иванов Иван (нижний регистр + Title Case)
   • Иванов И.И. → Иванов И.И. (инициалы сохраняет)
   • Одно слово → флаг "не 2-3 части"
   • >3 слов → флаг "не 2-3 части"
   
   УМНАЯ ДЕТЕКЦИЯ: По названию (fio, фио, имя) и структуре (2-3 слова)
   ============================================================ */

(async function() {
  const datasheet = await space.getActiveDatasheetAsync();
  const records = await datasheet.getRecordsAsync();
  
  output.markdown('# 👤 Виджет #05: Нормализация ФИО');
  output.markdown('Таблица: **' + datasheet.name + '**');
  output.markdown('');
  output.markdown('## Что делает:');
  output.markdown('- иванов иван → Иванов Иван');
  output.markdown('- ИВАНОВ ИВАН → Иванов Иван');
  output.markdown('- Инициалы (И.И.) сохраняет');
  output.markdown('- Не 2-3 части → флаг');
  output.markdown('');
  
  // =========================================================
  //  ШАГ 1. УМНАЯ ДЕТЕКЦИЯ ПОЛЕЙ
  // =========================================================
  output.markdown('## Шаг 1. Определение полей');
  output.markdown('');
  
  const SKIP_TYPES = [
    'number', 'autoNumber', 'currency', 'percent', 'rating',
    'singleSelect', 'multiSelect', 'date', 'dateTime',
    'createdTime', 'lastModifiedTime', 'formula', 'cascader',
    'createdUser', 'lastModifiedUser', 'singleLink', 'multipleLink',
    'oneWayLink', 'twoWayLink', 'attachment', 'phone', 'email',
    'url', 'checkbox', 'user', 'group', 'location', 'button',
    'map', 'address', 'tag'
  ];
  
  const textFields = datasheet.fields.filter(f => !SKIP_TYPES.includes(f.type));
  
  // 1. Ищем по названию
  const FIO_HINTS = ['fio', 'фио', 'имя', 'фамил', 'заявител', 'requester', 'name', 'owner', 'author'];
  const fioFieldsByName = textFields.filter(f => {
    const name = f.name.toLowerCase();
    return FIO_HINTS.some(hint => name.includes(hint));
  });
  
  // 2. Анализируем содержимое (2-3 слова, русские буквы)
  const fioFieldsByContent = [];
  
  textFields.forEach(f => {
    if (fioFieldsByName.includes(f)) return;
    
    let fioMatches = 0;
    const sampleSize = Math.min(records.length, 20);
    
    for (let i = 0; i < sampleSize; i++) {
      const v = records[i].getCellValueString(f.id);
      if (v && String(v).trim()) {
        const str = String(v).trim();
        const words = str.split(/\s+/);
        // 2-3 слова, все кириллические
        if (words.length >= 2 && words.length <= 3 &&
            words.every(w => /^[а-яёa-z]+$/i.test(w))) {
          fioMatches++;
        }
      }
    }
    
    // Если >50% значений похожи на ФИО
    if (fioMatches > 0 && fioMatches / sampleSize >= 0.5) {
      fioFieldsByContent.push(f);
    }
  });
  
  const allFioFields = [...fioFieldsByName, ...fioFieldsByContent];
  
  output.markdown('Найдено по **названию**: ' + fioFieldsByName.length);
  if (fioFieldsByName.length) {
    output.markdown('→ ' + fioFieldsByName.map(f => '`' + f.name + '`').join(', '));
  }
  
  output.markdown('Найдено по **содержимому** (2-3 слова): ' + fioFieldsByContent.length);
  if (fioFieldsByContent.length) {
    output.markdown('→ ' + fioFieldsByContent.map(f => '`' + f.name + '`').join(', '));
  }
  
  output.markdown('');
  output.markdown('Всего кандидатов: **' + allFioFields.length + '**');
  
  const confirmFields = await input.textAsync(
    'Обработать найденные поля? Введите:\n' +
    '- **да** (или Enter) — обработать все найденные\n' +
    '- Названия полей через запятую — обработать только их\n' +
    '- **нет** — отменить'
  );
  
  let fieldsToProcess = [];
  const answer = String(confirmFields || '').trim().toLowerCase();
  
  if (answer === 'да' || answer === 'yes' || answer === '') {
    fieldsToProcess = allFioFields;
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
  
  function normalizeFio(s) {
    let v = String(s).replace(/\s+/g, ' ').trim();
    const parts = v.split(' ');

    if (parts.length < 2 || parts.length > 3) {
      return { status: 'needs_input', from: s, to: v, reason: 'не 2-3 части (' + parts.length + ')' };
    }

    const cap = parts.map(p => {
      // Инициалы оставляем как есть (И.И.)
      if (/^([А-ЯЁA-Z]\.)+$/.test(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    }).join(' ');

    return { status: 'ok', from: s, to: cap, reason: 'ФИО' };
  }
  
  const changes = [];
  const issues = [];
  let totalCells = 0;
  
  records.forEach((rec, idx) => {
    fieldsToProcess.forEach(f => {
      const raw = rec.getCellValueString(f.id);
      if (raw == null || String(raw).trim() === '') return;
      
      totalCells++;
      const result = normalizeFio(raw);
      
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
  
  // Статистика по количеству частей
  const partsStats = { '2 части': 0, '3 части': 0 };
  changes.forEach(c => {
    const parts = String(c.from).split(/\s+/).length;
    if (parts === 2) partsStats['2 части']++;
    else if (parts === 3) partsStats['3 части']++;
  });
  
  if (changes.length > 0) {
    output.markdown('### Структура ФИО');
    output.table([
      { 'Тип': '2 части (Фамилия Имя)', 'Количество': partsStats['2 части'] },
      { 'Тип': '3 части (Фамилия Имя Отчество)', 'Количество': partsStats['3 части'] }
    ]);
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
    output.markdown('ℹ️ Изменений не требуется — ФИО уже нормализованы');
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
