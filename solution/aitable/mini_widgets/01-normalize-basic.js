/* ============================================================
   Микро-виджет #01: Базовая нормализация
   ------------------------------------------------------------
   ЧТО ДЕЛАЕТ (правила нормализации):
   • Ё → Е (Ковалёва → Ковалева)
   • Ё → Е (заглавная)
   • Неразрывные пробелы (U+00A0) → обычные пробелы
   • Табы, переносы строк → пробелы
   • Кавычки «»""„" → ""
   • Тире –— → дефис -
   • Множественные пробелы → один
   • Пробелы в начале/конце → удалить
   
   РЕЖИМ: Быстрое применение (без столбцов)
   ============================================================ */

(async function() {
  const datasheet = await space.getActiveDatasheetAsync();
  const records = await datasheet.getRecordsAsync();
  
  output.markdown('# 🔤 Виджет #01: Базовая нормализация');
  output.markdown('Таблица: **' + datasheet.name + '**');
  output.markdown('');
  output.markdown('## Что делает этот виджет:');
  output.markdown('- Ё → Е (Ковалёва → Ковалева)');
  output.markdown('- Неразрывные пробелы, табы → обычные пробелы');
  output.markdown('- Кавычки «»"" → ""');
  output.markdown('- Тире –— → дефис -');
  output.markdown('- Множественные пробелы → один');
  output.markdown('');
  
  // =========================================================
  //  ШАГ 1. ВЫБОР ПОЛЕЙ
  // =========================================================
  output.markdown('## Шаг 1. Выбор полей');
  output.markdown('');
  
  // Исключаем нетекстовые типы
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
  
  if (textFields.length === 0) {
    output.markdown('⚠️ Нет текстовых полей для обработки');
    return;
  }
  
  output.markdown('Найдено текстовых полей: **' + textFields.length + '**');
  output.markdown('Названия: ' + textFields.map(f => '`' + f.name + '`').join(', '));
  
  // Запрос на исключение полей
  const exclInput = await input.textAsync(
    '˃ Поля для **ИСКЛЮЧЕНИЯ** (точные названия через запятую).\n' +
    'Пусто = обрабатываем все. Пример: Description, Notes'
  );
  
  const exclNames = String(exclInput || '').split(/[,;]+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);
  
  const nameMap = {};
  textFields.forEach(f => { nameMap[f.name.toLowerCase()] = f; });
  
  const notFound = exclNames.filter(n => !nameMap[n]);
  if (notFound.length) {
    output.markdown('');
    output.markdown('⚠️ Не найдены поля: **' + notFound.join(', ') + '**');
  }
  
  const fieldsToProcess = textFields.filter(f => !exclNames.includes(f.name.toLowerCase()));
  output.markdown('Будут обработаны: **' + fieldsToProcess.length + '** полей');
  output.markdown('');
  
  // =========================================================
  //  ШАГ 2. СБОР ИЗМЕНЕНИЙ
  // =========================================================
  output.markdown('## Шаг 2. Анализ данных');
  output.markdown('');
  
  // Функция универсальной очистки (из normalizers.js, но здесь локально для автономности)
  function cleanUniversal(s) {
    if (s == null) return { text: s, ops: [] };
    const orig = String(s);
    let out = orig;
    const ops = [];
    
    // Ё → Е
    if (/[ёЁ]/.test(out)) {
      out = out.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
      ops.push('ё→е');
    }
    
    // Служебные символы
    let sym = false, q = false, d = false;
    out = Array.from(out).map(ch => {
      if (ch === 'ё' || ch === 'Ё' || ch === ' ') return ch;
      if (ch === '\u00A0' || ch === '\u2009' || ch === '\u202F' ||
          ch === '\t' || ch === '\r' || ch === '\n') {
        sym = true;
        return ' ';
      }
      if (ch === '\u00AB' || ch === '\u00BB' || ch === '\u201C' ||
          ch === '\u201D' || ch === '\u201E' || ch === '\u2018' || ch === '\u2019') {
        q = true;
        return (ch === '\u2018' || ch === '\u2019') ? "'" : '"';
      }
      if (ch === '\u2013' || ch === '\u2014') {
        d = true;
        return '-';
      }
      return ch;
    }).join('');
    
    if (sym) ops.push('служебные символы');
    if (q) ops.push('кавычки');
    if (d) ops.push('тире');
    
    // Множественные пробелы
    if (/\s{2,}/.test(out)) {
      out = out.replace(/\s{2,}/g, ' ');
      ops.push('пробелы');
    }
    
    out = out.trim();
    if (orig !== out && !ops.includes('пробелы') && /^\s|\s$/.test(orig)) {
      ops.push('пробелы');
    }
    
    return { text: out, ops };
  }
  
  const changes = [];
  let totalCells = 0;
  let changedCells = 0;
  
  records.forEach(rec => {
    fieldsToProcess.forEach(f => {
      const raw = rec.getCellValueString(f.id);
      if (raw == null || String(raw).trim() === '') return;
      
      totalCells++;
      const clean = cleanUniversal(raw);
      
      if (clean.ops.length > 0 || clean.text !== raw) {
        changedCells++;
        changes.push({
          recordId: rec.id,
          field: f,
          from: raw,
          to: clean.text,
          reason: clean.ops.join(' + '),
          row: records.indexOf(rec) + 1
        });
      }
    });
  });
  
  output.markdown('Проверено ячеек: **' + totalCells + '**');
  output.markdown('Найдено изменений: **' + changedCells + '**');
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
    output.markdown('ℹ️ Изменений не требуется — данные уже нормализованы');
    return;
  }
  
  // =========================================================
  //  ШАГ 4. ПОДТВЕРЖДЕНИЕ
  // =========================================================
  const answer = await input.textAsync(
    'Применить **' + changes.length + '** исправлений?\n' +
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
  
  // Сгруппировать по записям
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
