/* ============================================================
   Микро-виджет #08: Нормализация Сумм
   ------------------------------------------------------------
   ЧТО ДЕЛАЕТ (правила нормализации):
   • 1.5 млн → 1500000
   • 150 тыс → 150000
   • 1000 руб → 1000
   • 5000₽ → 5000
   • $100 → 100 (только число, валюта удаляется)
   • 1,5 млн (запятая) → 1500000
   • Нераспознанный формат → флаг "не сумма"
   
   УМНАЯ ДЕТЕКЦИЯ: По названию (budget, сумма, price) и паттернам (млн/тыс/руб)
   ============================================================ */

(async function() {
  const datasheet = await space.getActiveDatasheetAsync();
  const records = await datasheet.getRecordsAsync();
  
  output.markdown('# 💰 Виджет #08: Нормализация Сумм');
  output.markdown('Таблица: **' + datasheet.name + '**');
  output.markdown('');
  
  const SKIP_TYPES = [
    'singleSelect', 'multiSelect', 'date', 'dateTime',
    'createdTime', 'lastModifiedTime', 'formula', 'cascader',
    'singleLink', 'multipleLink', 'attachment',
    'url', 'checkbox', 'user', 'group', 'button', 'tag'
  ];
  
  const textFields = datasheet.fields.filter(f => !SKIP_TYPES.includes(f.type));
  
  const AMOUNT_HINTS = ['budget', 'сумм', 'бюджет', 'цен', 'стоимост', 'price', 'cost', 'amount', 'руб', 'тыс', 'млн'];
  const amountFieldsByName = textFields.filter(f => {
    const name = f.name.toLowerCase();
    return AMOUNT_HINTS.some(hint => name.includes(hint));
  });
  
  // Ищем по содержимому (числа + млн/тыс/руб)
  const amountFieldsByContent = [];
  const AMOUNT_PATTERNS = [/млн/i, /тыс/i, /руб/i, /₽/, /RUB/i, /RUR/i];
  
  textFields.forEach(f => {
    if (amountFieldsByName.includes(f)) return;
    
    let amountMatches = 0;
    const sampleSize = Math.min(records.length, 20);
    
    for (let i = 0; i < sampleSize; i++) {
      const v = records[i].getCellValueString(f.id);
      if (v && String(v).trim()) {
        const str = String(v);
        if (AMOUNT_PATTERNS.some(p => p.test(str)) || /^[\d\s.,]+$/.test(str.replace(/[^ \d.,]/g, ''))) {
          amountMatches++;
        }
      }
    }
    
    if (amountMatches > 0 && amountMatches / sampleSize >= 0.5) {
      amountFieldsByContent.push(f);
    }
  });
  
  const allAmountFields = [...amountFieldsByName, ...amountFieldsByContent];
  
  output.markdown('Найдено по **названию**: ' + amountFieldsByName.length);
  if (amountFieldsByName.length) {
    output.markdown('→ ' + amountFieldsByName.map(f => '`' + f.name + '`').join(', '));
  }
  
  output.markdown('Найдено по **содержимому**: ' + amountFieldsByContent.length);
  if (amountFieldsByContent.length) {
    output.markdown('→ ' + amountFieldsByContent.map(f => '`' + f.name + '`').join(', '));
  }
  
  output.markdown('');
  output.markdown('Всего: **' + allAmountFields.length + '**');
  
  const confirmFields = await input.textAsync(
    'Обработать? Введите:\n' +
    '- **да** (или Enter) — все найденные\n' +
    '- Названия полей — выбрать вручную\n' +
    '- **нет** — отменить'
  );
  
  let fieldsToProcess = [];
  const answer = String(confirmFields || '').trim().toLowerCase();
  
  if (answer === 'да' || answer === 'yes' || answer === '') {
    fieldsToProcess = allAmountFields;
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
    output.markdown('⚠️ Нет полей');
    return;
  }
  
  output.markdown('✅ Будут обработаны: ' + fieldsToProcess.map(f => '`' + f.name + '`').join(', '));
  output.markdown('');
  
  output.markdown('## Что делает:');
  output.markdown('- 1.5 млн → 1500000');
  output.markdown('- 150 тыс → 150000');
  output.markdown('- 1000 руб → 1000');
  output.markdown('- 5000₽ → 5000');
  output.markdown('');
  output.markdown('## Что делает:');
  output.markdown('- 1.5 млн → 1500000');
  output.markdown('- 150 тыс → 150000');
  output.markdown('- 1000 руб → 1000');
  output.markdown('- 5000₽ → 5000');
    let v = String(s).trim().replace(/[\s\u00A0]/g, '');
    v = v.replace(/^(RUB|RUR|₽|руб|рубли|РУБ|РУБЛИ)/i, '')
         .replace(/(RUB|RUR|₽|руб|рубли|РУБ|РУБЛИ)$/i, '')
         .replace(/\$/g, '')
         .trim();

    let num = null;
    const mil = v.match(/^([\d.,]+)\s*млн/i);
    const thou = v.match(/^([\d.,]+)\s*тыс/i);

    if (mil) num = parseFloat(mil[1].replace(',', '.')) * 1e6;
    else if (thou) num = parseFloat(thou[1].replace(',', '.')) * 1e3;
    else if (/^[\d.,]+$/.test(v)) num = parseFloat(v.replace(',', '.'));

    if (num == null || isNaN(num)) {
      return { status: 'needs_input', from: s, to: v, reason: 'не сумма' };
    }

    return { status: 'ok', from: s, to: String(Math.round(num)), reason: 'сумма' };
  }
  
  const changes = [];
  const issues = [];
  let totalCells = 0;
  
  records.forEach((rec, idx) => {
    fieldsToProcess.forEach(f => {
      const raw = rec.getCellValueString(f.id);
      if (raw == null || String(raw).trim() === '') return;
      
      totalCells++;
      const result = normalizeAmount(raw);
      
      if (result.status === 'needs_input') {
        issues.push({ recordId: rec.id, field: f, from: raw, reason: result.reason, row: idx + 1 });
      } else if (result.to !== raw) {
        changes.push({ recordId: rec.id, field: f, from: raw, to: result.to, reason: result.reason, row: idx + 1 });
      }
    });
  });
  
  output.markdown('Проверено: **' + totalCells + '**');
  output.markdown('Исправлений: **' + changes.length + '**');
  output.markdown('Проблемных: **' + issues.length + '**');
  output.markdown('');
  
  if (changes.length > 0) {
    output.markdown('### Примеры');
    output.table(changes.slice(0, 15).map(c => ({
      'Строка': c.row, 'Столбец': c.field.name, 'Было': c.from, '→': c.to, 'Правило': c.reason
    })));
  }
  
  if (issues.length > 0) {
    output.markdown('');
    output.markdown('### Проблемные (первые 10)');
    output.table(issues.slice(0, 10).map(i => ({
      'Строка': i.row, 'Столбец': i.field.name, 'Значение': i.from, 'Причина': i.reason
    })));
  }
  
  if (changes.length === 0 && issues.length === 0) {
    output.markdown('ℹ️ Изменений нет');
    return;
  }
  
  const confirmAnswer = await input.textAsync(
    '\nПрименить **' + changes.length + '**?\nВведите **да**:'
  );
  
  if (String(confirmAnswer || '').trim().toLowerCase() !== 'да' && 
      String(confirmAnswer || '').trim().toLowerCase() !== 'yes') {
    output.markdown('❌ Отменено');
    return;
  }
  
  output.markdown('');
  output.markdown('## Применение');
  
  const byRecord = {};
  changes.forEach(c => {
    if (!byRecord[c.recordId]) byRecord[c.recordId] = {};
    byRecord[c.recordId][c.field.id] = c.to;
  });
  
  const updates = Object.keys(byRecord).map(id => ({ id, valuesMap: byRecord[id] }));
  const BATCH = 100;
  const batches = [];
  for (let i = 0; i < updates.length; i += BATCH) batches.push(updates.slice(i, i + BATCH));
  
  let applied = 0, failed = 0;
  for (let i = 0; i < batches.length; i++) {
    try {
      await datasheet.updateRecordsAsync(batches[i]);
      applied += batches[i].length;
      output.markdown('✓ Партиция #' + (i+1) + ': ' + batches[i].length);
    } catch (e) {
      failed += batches[i].length;
      output.markdown('⚠️ Партиция #' + (i+1) + ': ' + (e.message || e));
    }
  }
  
  output.markdown('');
  output.markdown('# ✅');
  output.markdown('Применено: **' + applied + '/' + updates.length + '**');
  if (failed > 0) output.markdown('Ошибки: **' + failed + '**');
  
})().catch(e => {
  output.markdown('**❌ Ошибка:** ' + (e.message || e));
});
