/* ============================================================
   Микро-виджет #06: Нормализация Городов
   ------------------------------------------------------------
   ЧТО ДЕЛАЕТ (правила нормализации):
   • екб → Екатеринбург (алиасы)
   • мск → Москва
   • спб → Санкт-Петербург
   • г Москва → Москва (убирает "г ")
   • МОСКВА → Москва (Title Case)
   • Латиница (Moscow) → флаг "латиница"
   • Не город (цифры, символы) → флаг "не город"
   
   СЛОВАРЬ АЛИАСОВ: екб, нск, спб, мск, члб, уренб, казнь, нн, уфа...
   УМНАЯ ДЕТЕКЦИЯ: По названию (city, город) и словарю
   ============================================================ */

(async function() {
  const datasheet = await space.getActiveDatasheetAsync();
  const records = await datasheet.getRecordsAsync();
  
  output.markdown('# 🏙️ Виджет #06: Нормализация Городов');
  output.markdown('Таблица: **' + datasheet.name + '**');
  output.markdown('');
  output.markdown('## Что делает:');
  output.markdown('- екб → Екатеринбург');
  output.markdown('- мск → Москва, спб → Санкт-Петербург');
  output.markdown('- г Москва → Москва');
  output.markdown('- Латиница (Moscow) → флаг');
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
  const CITY_HINTS = ['city', 'город', 'location', 'место'];
  const cityFieldsByName = textFields.filter(f => {
    const name = f.name.toLowerCase();
    return CITY_HINTS.some(hint => name.includes(hint));
  });
  
  // 2. Словарь алиасов
  const CITY_ALIASES = {
    'екб': 'Екатеринбург', 'нск': 'Новосибирск', 'спб': 'Санкт-Петербург',
    'мск': 'Москва', 'члб': 'Челябинск', 'уренб': 'Оренбург',
    'кзнь': 'Казань', 'нн': 'Нижний Новгород', 'уфа': 'Уфа',
    'самара': 'Самара', 'омск': 'Омск', 'рдн': 'Ростов-на-Дону',
    'крсноярск': 'Красноярск', 'воронеж': 'Воронеж', 'пермь': 'Пермь',
    'волгоград': 'Волгоград', 'крснодар': 'Краснодар', 'саратов': 'Саратов',
    'тюмень': 'Тюмень', 'тльятти': 'Тольятти', 'иж': 'Ижевск',
    'барнаул': 'Барнаул', 'ульяновск': 'Ульяновск', 'иркутск': 'Иркутск',
    'хабаровск': 'Хабаровск', 'ярославль': 'Ярославль', 'владивосток': 'Владивосток'
  };
  
  const cityFieldsByContent = [];
  textFields.forEach(f => {
    if (cityFieldsByName.includes(f)) return;
    
    let cityMatches = 0;
    const sampleSize = Math.min(records.length, 20);
    
    for (let i = 0; i < sampleSize; i++) {
      const v = records[i].getCellValueString(f.id);
      if (v && String(v).trim()) {
        const str = String(v).trim().toLowerCase().replace(/^г\s*/, '');
        if (CITY_ALIASES[str] || /^[а-яё]+$/.test(str)) {
          cityMatches++;
        }
      }
    }
    
    if (cityMatches > 0 && cityMatches / sampleSize >= 0.5) {
      cityFieldsByContent.push(f);
    }
  });
  
  const allCityFields = [...cityFieldsByName, ...cityFieldsByContent];
  
  output.markdown('Найдено по **названию**: ' + cityFieldsByName.length);
  if (cityFieldsByName.length) {
    output.markdown('→ ' + cityFieldsByName.map(f => '`' + f.name + '`').join(', '));
  }
  
  output.markdown('Найдено по **содержимому**: ' + cityFieldsByContent.length);
  if (cityFieldsByContent.length) {
    output.markdown('→ ' + cityFieldsByContent.map(f => '`' + f.name + '`').join(', '));
  }
  
  output.markdown('');
  output.markdown('Всего кандидатов: **' + allCityFields.length + '**');
  
  const confirmFields = await input.textAsync(
    'Обработать найденные поля? Введите:\n' +
    '- **да** (или Enter) — обработать все найденные\n' +
    '- Названия полей через запятую — обработать только их\n' +
    '- **нет** — отменить'
  );
  
  let fieldsToProcess = [];
  const answer = String(confirmFields || '').trim().toLowerCase();
  
  if (answer === 'да' || answer === 'yes' || answer === '') {
    fieldsToProcess = allCityFields;
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
  
  function normalizeCity(s) {
    let v = String(s).trim().replace(/^[Гг]\s*/, '').replace(/\s+/g, ' ').trim();
    const low = v.toLowerCase();

    if (CITY_ALIASES[low]) v = CITY_ALIASES[low];
    if (/[A-Za-z]/.test(v)) {
      return { status: 'needs_input', from: s, to: v, reason: 'латиница' };
    }
    if (!/[а-яё]/i.test(v)) {
      return { status: 'needs_input', from: s, to: v, reason: 'не город' };
    }

    return { 
      status: 'ok', 
      from: s, 
      to: v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(), 
      reason: 'город' 
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
      const result = normalizeCity(raw);
      
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
    output.markdown('ℹ️ Изменений не требуется — города уже нормализованы');
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
      const progress = Math.round((applied / updates.length) * 100);
      output.markdown('✓ Партиция #' + (i+1) + '/' + batches.length + ' — ' + batches[i].length + ' записей (' + progress + '%)');
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
