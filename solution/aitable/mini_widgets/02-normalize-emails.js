/* ============================================================
   Микро-виджет #02: Нормализация Email
   ------------------------------------------------------------
   ЧТО ДЕЛАЕТ (правила нормализации):
   • Приводит к нижнему регистру (TEST@EXAMPLE.COM → test@example.com)
   • Убирает префикс mailto: (mailto:test@example.com → test@example.com)
   • Убирает пробелы внутри email
   • Убирает завершающую точку с запятой (;)
   • Флаг для некорректных email (не проходит валидацию)
   
   УМНАЯ ДЕТЕКЦИЯ: Ищет поля по названию (email, почт) и содержимому
   ============================================================ */

(async function() {
  const datasheet = await space.getActiveDatasheetAsync();
  const records = await datasheet.getRecordsAsync();
  
  output.markdown('# 📧 Виджет #02: Нормализация Email');
  output.markdown('Таблица: **' + datasheet.name + '**\n');
  
  output.markdown('## Что делает:');
  output.markdown('- Приводит к нижнему регистру (TEST@ → test@)');
  output.markdown('- Убирает mailto: и пробелы');
  output.markdown('- Флаг для некорректных email');
  output.markdown('');
  // =========================================================
  //  ШАГ 1. ВЫБОР ПОЛЕЙ
  // =========================================================
  output.markdown('## Шаг 1. Выбор полей\n');
  
  // Ищем поля, которые могут быть email (по названию)
  const EMAIL_HINTS = ['email', 'почт', 'e-mail', 'mail', 'емейл'];
  
  const emailFields = datasheet.fields.filter(f => {
    const name = f.name.toLowerCase();
    return EMAIL_HINTS.some(hint => name.includes(hint));
  });
  
  output.markdown('Найдено полей с hint на email: **' + emailFields.length + '**');
  if (emailFields.length) {
    output.markdown('Названия: ' + emailFields.map(f => '`' + f.name + '`').join(', '));
  }
  
  // Даем пользователю выбрать: авто-найденные или все текстовые
  const SKIP_TYPES = [
    'number', 'autoNumber', 'currency', 'percent', 'rating',
    'singleSelect', 'multiSelect', 'date', 'dateTime',
    'createdTime', 'lastModifiedTime', 'formula', 'cascader',
    'createdUser', 'lastModifiedUser', 'singleLink', 'multipleLink',
    'oneWayLink', 'twoWayLink', 'attachment', 'phone',
    'url', 'checkbox', 'user', 'group', 'location', 'button',
    'map', 'address', 'tag', 'email' // email тип исключаем — он уже форматирован
  ];
  
  const allTextFields = datasheet.fields.filter(f => !SKIP_TYPES.includes(f.type));
  
  const useAuto = await input.textAsync(
    '\n˃ Использовать авто-найденные поля (**да**) или выбрать вручную?**\n' +
    'Введите **да** для: ' + (emailFields.map(f => '`' + f.name + '`').join(', ') || 'нет полей') + '\n' +
    'Или введите названия полей через запятую для выбора:'
  );
  
  let fieldsToProcess = [];
  const answer = String(useAuto || '').trim().toLowerCase();
  
  if (answer === 'да' || answer === 'yes' || answer === '') {
    fieldsToProcess = emailFields.length > 0 ? emailFields : allTextFields;
    output.markdown('\n✅ Выбрано: ' + (emailFields.length > 0 ? 'авто-найденные' : 'все текстовые'));
  } else {
    const manualNames = answer.split(/[,;]+/).map(s => s.trim().toLowerCase());
    const nameMap = {};
    allTextFields.forEach(f => { nameMap[f.name.toLowerCase()] = f; });
    fieldsToProcess = manualNames.map(n => nameMap[n]).filter(f => f !== undefined);
    output.markdown('\n✅ Выбрано вручную: **' + fieldsToProcess.length + '** полей');
  }
  
  if (fieldsToProcess.length === 0) {
    output.markdown('⚠️ Нет полей для обработки');
    return;
  }
  
  output.markdown('Будут обработаны: ' + fieldsToProcess.map(f => '`' + f.name + '`').join(', '));
  
  // =========================================================
  //  ШАГ 2. СБОР ИЗМЕНЕНИЙ
  // =========================================================
  output.markdown('\n## Шаг 2. Анализ данных\n');
  
  function normalizeEmail(s) {
    let v = String(s).trim().toLowerCase().replace(/^mailto:/i, '').replace(/;$/, '');
    v = v.replace(/\s+/g, '');
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      return { status: 'needs_input', from: s, to: v, reason: 'некорректный email' };
    }
    
    return { status: 'ok', from: s, to: v, reason: 'email' };
  }
  
  const changes = [];
  const issues = [];
  let totalCells = 0;
  
  records.forEach(rec => {
    fieldsToProcess.forEach(f => {
      const raw = rec.getCellValueString(f.id);
      if (raw == null || String(raw).trim() === '') return;
      
      totalCells++;
      const result = normalizeEmail(raw);
      
      if (result.status === 'needs_input') {
        issues.push({
          recordId: rec.id,
          field: f,
          from: raw,
          to: result.to,
          reason: result.reason,
          row: records.indexOf(rec) + 1
        });
      } else if (result.to !== raw) {
        changes.push({
          recordId: rec.id,
          field: f,
          from: raw,
          to: result.to,
          reason: result.reason,
          row: records.indexOf(rec) + 1
        });
      }
    });
  });
  
  output.markdown('Проверено ячеек: **' + totalCells + '**');
  output.markdown('Найдено исправлений: **' + changes.length + '**');
  output.markdown('Требуют ручной проверки: **' + issues.length + '**\n');
  
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
    output.markdown('\n### ⚠️ Требуют ручной проверки (первые 10)');
    output.table(issues.slice(0, 10).map(i => ({
      'Строка': i.row,
      'Столбец': i.field.name,
      'Значение': i.from,
      'Причина': i.reason
    })));
  }
  
  if (changes.length === 0 && issues.length === 0) {
    output.markdown('ℹ️ Изменений не требуется — email уже нормализованы');
    return;
  }
  
  // =========================================================
  //  ШАГ 4. ПОДТВЕРЖДЕНИЕ
  // =========================================================
  const confirmAnswer = await input.textAsync(
    '\nПрименить **' + changes.length + '** исправлений?\n' +
    'Введите **да** для подтверждения:'
  );
  
  const confirm = String(confirmAnswer || '').trim().toLowerCase() === 'да' ||
                  String(confirmAnswer || '').trim().toLowerCase() === 'yes';
  
  // =========================================================
  //  ШАГ 5. ПРИМЕНЕНИЕ
  // =========================================================
  if (!confirm) {
    output.markdown('\n❌ Применение отменено');
    return;
  }
  
  output.markdown('\n## Применение изменений\n');
  
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
  output.markdown('\n# ✅ Готово');
  output.markdown('- Применено: **' + applied + '/' + updates.length + '** записей');
  output.markdown('- Требуют ручной проверки: **' + issues.length + '** записей');
  if (failed > 0) {
    output.markdown('- Ошибки: **' + failed + '** записей');
  }
  output.markdown('\n---\n_Запускайте следующий виджет для продолжения обработки_');
  
})().catch(e => {
  output.markdown('**❌ Ошибка:** ' + (e && e.message ? e.message : e));
});
