# Шаблон для создания нового микро-виджета

Скопируй этот файл как основу для нового виджета `widgets/NN-name.js`.

```javascript
/* ============================================================
   Микро-виджет #NN: Название
   ------------------------------------------------------------
   Что делает:
   - Описание 1
   - Описание 2
   
   Требует: (опционально) виджет #X для лучших результатов
   ============================================================ */

(async function() {
  const datasheet = await space.getActiveDatasheetAsync();
  const records = await datasheet.getRecordsAsync();
  
  output.markdown('# 🏷️ Виджет #NN: Название');
  output.markdown('Таблица: **' + datasheet.name + '**');
  output.markdown('');
  
  // =========================================================
  //  ШАГ 1. ВЫБОР ПОЛЕЙ
  // =========================================================
  output.markdown('## Шаг 1. Выбор полей');
  output.markdown('');
  
  // Логика выбора полей
  const fieldsToProcess = datasheet.fields.filter(/* ... */);
  
  output.markdown('Будут обработаны: **' + fieldsToProcess.length + '** полей');
  output.markdown('');
  
  // =========================================================
  //  ШАГ 2. СБОР ИЗМЕНЕНИЙ
  // =========================================================
  output.markdown('## Шаг 2. Анализ данных');
  output.markdown('');
  
  // Функция нормализации
  function normalizeXXX(s) {
    // Ваша логика
    return { status: 'ok', from: s, to: normalized, reason: 'описание' };
  }
  
  const changes = [];
  let totalCells = 0;
  
  records.forEach(rec => {
    fieldsToProcess.forEach(f => {
      const raw = rec.getCellValueString(f.id);
      if (raw == null || String(raw).trim() === '') return;
      
      totalCells++;
      const result = normalizeXXX(raw);
      
      if (result.to !== raw) {
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
  output.markdown('Найдено изменений: **' + changes.length + '**');
  output.markdown('');
  
  // =========================================================
  //  ШАГ 3. PREVIEW
  // =========================================================
  if (changes.length > 0) {
    output.markdown('### Примеры изменений (первые 15)');
    output.table(changes.slice(0, 15).map(c => ({
      'Строка': c.row,
      'Столбец': c.field.name,
      'Было': c.from,
      '→': c.to,
      'Правило': c.reason
    })));
  } else {
    output.markdown('ℹ️ Изменений не требуется');
    return;
  }
  
  // =========================================================
  //  ШАГ 4. ПОДТВЕРЖДЕНИЕ
  // =========================================================
  const answer = await input.textAsync(
    'Применить **' + changes.length + '** исправлений?\\n' +
    'Введите **да** для подтверждения:'
  );
  
  const confirm = String(answer || '').trim().toLowerCase() === 'да' ||
                  String(answer || '').trim().toLowerCase() === 'yes';
  
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
  if (failed > 0) {
    output.markdown('- Ошибки: **' + failed + '** записей');
  }
  output.markdown('');
  output.markdown('---');
  output.markdown('_Запускайте следующий виджет для продолжения обработки_');
  
})().catch(e => {
  output.markdown('**❌ Ошибка:** ' + (e && e.message ? e.message : e));
});
```

## Важные правила

1. **Переносы строк в output.markdown()**: используйте отдельные вызовы `output.markdown('')` для пустых строк, не `\n` внутри строки
2. **Переносы в input.textAsync()**: используйте `\n` (один backslash) для переноса в prompt
3. **Структура**: следуйте паттерну 1→2→3→4→5 (Выбор → Анализ → Preview → Подтверждение → Применение)
4. **Партиции**: применяйте изменения партициями по 100 записей
5. **Прогресс**: показывайте прогресс после каждой партиции

## Чек-лист перед коммитом

- [ ] Код проходит линтер (`node --check widgets/NN-name.js`)
- [ ] Есть тесты в `tests/` (если применимо)
- [ ] Обновлён `QUICKSTART.md` с описанием нового виджета
- [ ] Добавлена запись в `README.md` в раздел структуры
