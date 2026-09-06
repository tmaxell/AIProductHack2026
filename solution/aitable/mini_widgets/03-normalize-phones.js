/* ============================================================
   Микро-виджет #03: Нормализация Телефонов
   ------------------------------------------------------------
   ЧТО ДЕЛАЕТ (правила нормализации):
   • 89991234567 → +79991234567
   • 9991234567 → +79991234567 (добавляет +7)
   • +79991234567 → +79991234567 (оставляет как есть)
   • 89991234567 (11 цифр, начинается с 8) → +79991234567
   • 79991234567 (11 цифр, начинается с 7) → +79991234567
   • Маскированные номера (***1234) → флаг "номер маскирован"
   • <10 цифр → флаг "<10 цифр"
   • >12 цифр → флаг ">12 цифр"
   • Не-РФ формат → флаг "не-РФ формат"
   
   УМНАЯ ДЕТЕКЦИЯ: По названию (phone, тел) и содержимому (10-12 цифр)
   ============================================================ */

(async function() {
  const datasheet = await space.getActiveDatasheetAsync();
  const records = await datasheet.getRecordsAsync();
  
  output.markdown('# 📞 Виджет #03: Нормализация Телефонов');
  output.markdown('Таблица: **' + datasheet.name + '**');
  output.markdown('');
  output.markdown('## Что делает:');
  output.markdown('- 89991234567 → +799****4567');
  output.markdown('- 9991234567 → +799****4567 (добавляет +7)');
  output.markdown('- Маскированные (***1234) → флаг');
  output.markdown('- Не-РФ → флаг');
  output.markdown('');
  
  // =========================================================
  //  ШАГ 1. УМНАЯ ДЕТЕКЦИЯ ПОЛЕЙ
  // =========================================================
  output.markdown('## Шаг 1. Определение полей');
  output.markdown('');
  
  // Исключаем заведомо неподходящие типы
  const SKIP_TYPES = [
    'number', 'autoNumber', 'currency', 'percent', 'rating',
    'singleSelect', 'multiSelect', 'date', 'dateTime',
    'createdTime', 'lastModifiedTime', 'formula', 'cascader',
    'createdUser', 'lastModifiedUser', 'singleLink', 'multipleLink',
    'oneWayLink', 'twoWayLink', 'attachment',
    'url', 'checkbox', 'user', 'group', 'location', 'button',
    'map', 'address', 'tag', 'email'
  ];
  
  const textFields = datasheet.fields.filter(f => !SKIP_TYPES.includes(f.type));
  
  // 1. Ищем по названию (явные hint)
  const PHONE_HINTS = ['phone', 'тел', 'телефон', 'mobile', 'моб', 'contact'];
  const phoneFieldsByName = textFields.filter(f => {
    const name = f.name.toLowerCase();
    return PHONE_HINTS.some(hint => name.includes(hint));
  });
  
  // 2. Для остальных полей — анализируем содержимое (ищем 10-12 цифр)
  const phoneFieldsByContent = [];
  textFields.forEach(f => {
    // Пропускаем уже найденные по имени
    if (phoneFieldsByName.includes(f)) return;
    
    // Берём выборку значений
    let digitCounts = [];
    for (let i = 0; i < Math.min(records.length, 20); i++) {
      const v = records[i].getCellValueString(f.id);
      if (v && String(v).trim()) {
        const digits = String(v).replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 12) {
          digitCounts.push(digits.length);
        }
      }
    }
    
    // Если >60% непустых значений — 10-12 цифр, это телефон
    const nonEmpty = digitCounts.length;
    if (nonEmpty > 0 && nonEmpty / Math.min(records.length, 20) >= 0.6) {
      phoneFieldsByContent.push(f);
    }
  });
  
  const allPhoneFields = [...phoneFieldsByName, ...phoneFieldsByContent];
  
  output.markdown('Найдено по телефону **названию**: ' + phoneFieldsByName.length);
  if (phoneFieldsByName.length) {
    output.markdown('→ ' + phoneFieldsByName.map(f => '`' + f.name + '`').join(', '));
  }
  
  output.markdown('Найдено по **содержимому** (10-12 цифр): ' + phoneFieldsByContent.length);
  if (phoneFieldsByContent.length) {
    output.markdown('→ ' + phoneFieldsByContent.map(f => '`' + f.name + '`').join(', '));
  }
  
  output.markdown('');
  output.markdown('Всего кандидатов: **' + allPhoneFields.length + '**');
  
  // Даем пользователю подтвердить или скорректировать
  const confirmFields = await input.textAsync(
    'Обработать найденные поля? Введите:\n' +
    '- **да** (или Enter) — обработать все найденные\n' +
    '- Названия полей через запятую — обработать только их\n' +
    '- **нет** — отменить'
  );
  
  let fieldsToProcess = [];
  const answer = String(confirmFields || '').trim().toLowerCase();
  
  if (answer === 'да' || answer === 'yes' || answer === '') {
    fieldsToProcess = allPhoneFields;
  } else if (answer === 'нет' || answer === 'no') {
    output.markdown('');
    output.markdown('❌ Отменено пользователем');
    return;
  } else {
    // Пользователь ввёл названия полей
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
  
  function normalizePhone(s) {
    const digits = String(s).replace(/\D/g, '');
    
    // Маскированный номер
    if (/\*/.test(s)) {
      return { status: 'needs_input', from: s, to: s, reason: 'номер маскирован' };
    }
    // Мало цифр
    if (digits.length < 10) {
      return { status: 'needs_input', from: s, to: s, reason: '<10 цифр (' + digits.length + ')' };
    }
    // Много цифр
    if (digits.length > 12) {
      return { status: 'needs_input', from: s, to: s, reason: '>12 цифр (' + digits.length + ')' };
    }

    let norm;
    if (digits.length === 10) norm = '7' + digits;
    else if (digits.length === 11 && digits[0] === '8') norm = '7' + digits.slice(1);
    else if (digits.length === 11 && digits[0] === '7') norm = digits;
    else if (digits.length === 12 && digits.slice(0, 2) === '78') norm = digits.slice(1);
    else return { status: 'needs_input', from: s, to: s, reason: 'не-РФ формат' };

    const target = '+' + norm;
    return { status: 'ok', from: s, to: target, reason: 'телефон' };
  }
  
  const changes = [];
  const issues = [];
  let totalCells = 0;
  
  records.forEach((rec, idx) => {
    fieldsToProcess.forEach(f => {
      const raw = rec.getCellValueString(f.id);
      if (raw == null || String(raw).trim() === '') return;
      
      totalCells++;
      const result = normalizePhone(raw);
      
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
    output.markdown('ℹ️ Изменений не требуется — телефоны уже нормализованы');
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
