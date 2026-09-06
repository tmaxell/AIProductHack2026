/* ============================================================
   Микро-виджет #07: Нормализация Компаний
   ------------------------------------------------------------
   ЧТО ДЕЛАЕТ (правила нормализации):
   • ООО "Ромашка" → Ромашка (убирает ОПФ)
   • ИП Иванов → Иванов
   • АО "Газпром" → Газпром
   • ОАО, ЗАО, ПАО, ТОО, ЧП, ИЧП → убирает
   • Убирает кавычки «», "", „"
   • Приводит к Title Case (ромашка → Ромашка)
   
   УМНАЯ ДЕТЕКЦИЯ: По названию (company, компан, org, контрагент)
   ============================================================ */

(async function() {
  const datasheet = await space.getActiveDatasheetAsync();
  const records = await datasheet.getRecordsAsync();
  
  output.markdown('# 🏢 Виджет #07: Нормализация Компаний');
  output.markdown('Таблица: **' + datasheet.name + '**');
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
  
  const COMPANY_HINTS = ['company', 'компан', 'org', 'организ', 'контрагент', 'employer'];
  const companyFields = textFields.filter(f => {
    const name = f.name.toLowerCase();
    return COMPANY_HINTS.some(hint => name.includes(hint));
  });
  
  output.markdown('Найдено полей: **' + companyFields.length + '**');
  if (companyFields.length) {
    output.markdown('→ ' + companyFields.map(f => '`' + f.name + '`').join(', '));
  }
  output.markdown('');
  
  const confirmFields = await input.textAsync(
    'Обработать найденные поля? Введите:\n' +
    '- **да** (или Enter) — обработать все найденные\n' +
    '- Названия полей через запятую — выбрать вручную\n' +
    '- **нет** — отменить'
  );
  
  let fieldsToProcess = [];
  const answer = String(confirmFields || '').trim().toLowerCase();
  
  if (answer === 'да' || answer === 'yes' || answer === '') {
    fieldsToProcess = companyFields;
  } else if (answer === 'нет' || answer === 'no') {
    output.markdown('❌ Отменено');
    return;
  } else {
    const manualNames = answer.split(/[,;]+/).map(s => s.trim().toLowerCase());
    const nameMap = {};
    textFields.forEach(f => { nameMap[f.name.toLowerCase()] = f; });
    fieldsToProcess = manualNames.map(n => nameMap[n]).filter(f => f !== undefined);
  }
  
  if (fieldsToProcess.length === 0) {
    output.markdown('⚠️ Нет полей для обработки');
    return;
  }
  
  output.markdown('✅ Будут обработаны: ' + fieldsToProcess.map(f => '`' + f.name + '`').join(', '));
  output.markdown('');
  
  output.markdown('## Что делает:');
  output.markdown('- ООО "Ромашка" → Ромашка');
  output.markdown('- ИП Иванов → Иванов');
  output.markdown('- Убирает кавычки и ОПФ');
  output.markdown('');
  output.markdown('## Что делает:');
  output.markdown('## Анализ данных');
  output.markdown('');
  
  const OPF_REGEX = /^(ООО|ОАО|ЗАО|АО|ИП|ПАО|ТОО|ЧП|ИЧП|НКО|ОАО|ГКУ|ГУП)\s*/i;
  
  function normalizeCompany(s) {
    const hadOpf = OPF_REGEX.test(String(s));
    let v = String(s).replace(OPF_REGEX, '').replace(/\s+/g, ' ').trim();
    v = v.replace(/^[\s"«»""„]+/, '').replace(/[\s"«»""„]+$/, '').trim();
    
    const words = v.split(' ').map(w => 
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join(' ');
    
    return { 
      status: 'ok', 
      from: s, 
      to: words, 
      reason: 'компания' + (hadOpf ? ' (ОПФ удалена)' : ''),
      hadOpf
    };
  }
  
  const changes = [];
  let totalCells = 0;
  let opfRemoved = 0;
  
  records.forEach((rec, idx) => {
    fieldsToProcess.forEach(f => {
      const raw = rec.getCellValueString(f.id);
      if (raw == null || String(raw).trim() === '') return;
      
      totalCells++;
      const result = normalizeCompany(raw);
      
      if (result.to !== raw) {
        changes.push({
          recordId: rec.id,
          field: f,
          from: raw,
          to: result.to,
          reason: result.reason,
          row: idx + 1
        });
        if (result.hadOpf) opfRemoved++;
      }
    });
  });
  
  output.markdown('Проверено ячеек: **' + totalCells + '**');
  output.markdown('Найдено исправлений: **' + changes.length + '**');
  output.markdown('Удалено ОПФ: **' + opfRemoved + '**');
  output.markdown('');
  
  if (changes.length > 0) {
    output.markdown('### Примеры (первые 15)');
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
  
  const confirmAnswer = await input.textAsync(
    'Применить **' + changes.length + '** исправлений?\nВведите **да**:'
  );
  
  if (String(confirmAnswer || '').trim().toLowerCase() !== 'да' && 
      String(confirmAnswer || '').trim().toLowerCase() !== 'yes') {
    output.markdown('❌ Отменено');
    return;
  }
  
  output.markdown('');
  output.markdown('## Применение');
  output.markdown('');
  
  const byRecord = {};
  changes.forEach(c => {
    if (!byRecord[c.recordId]) byRecord[c.recordId] = {};
    byRecord[c.recordId][c.field.id] = c.to;
  });
  
  const updates = Object.keys(byRecord).map(id => ({ id, valuesMap: byRecord[id] }));
  const BATCH_SIZE = 100;
  const batches = [];
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    batches.push(updates.slice(i, i + BATCH_SIZE));
  }
  
  let applied = 0, failed = 0;
  for (let i = 0; i < batches.length; i++) {
    try {
      await datasheet.updateRecordsAsync(batches[i]);
      applied += batches[i].length;
      output.markdown('✓ Партиция #' + (i+1) + ': ' + batches[i].length + ' записей');
    } catch (e) {
      failed += batches[i].length;
      output.markdown('⚠️ Партиция #' + (i+1) + ': ' + (e.message || e));
    }
  }
  
  output.markdown('');
  output.markdown('# ✅ Готово');
  output.markdown('- Применено: **' + applied + '/' + updates.length + '**');
  if (failed > 0) output.markdown('- Ошибки: **' + failed + '**');
  
})().catch(e => {
  output.markdown('**❌ Ошибка:** ' + (e.message || e));
});
