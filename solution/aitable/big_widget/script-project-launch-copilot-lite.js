/* ============================================================
   Project Launch Copilot — упрощённая версия (3 шага)
   ------------------------------------------------------------
   1. АНАЛИЗ И НОРМАЛИЗАЦИЯ ДАННЫХ
   2. ПОИСК ДУБЛЕЙ (авто-ключи + ручной ввод)
   3. ИНТЕЛЛЕКТ (предложение правил очистки)
   
   УДАЛЕНО:
   - Справочники (компании, сотрудники, шаблоны, задачи)
   - Запуск проекта (создание задач по шаблону)
   
   API: input.textAsync / fieldAsync / viewAsync / recordAsync
   ============================================================ */

(async function() {
  const datasheet = await space.getActiveDatasheetAsync();
  const records = await datasheet.getRecordsAsync();
  
  output.markdown('# 📚 Project Launch Copilot (упрощённый)');
  output.markdown('Таблица: **' + datasheet.name + '**');
  output.markdown('');
  output.markdown('**Что делает:**');
  output.markdown('1. Нормализация данных (ё→е, email, телефоны, даты, ФИО, города, компании, суммы)');
  output.markdown('2. Поиск дублей (авто-ключи: email/телефон/ИНН + ручной выбор)');
  output.markdown('3. Интеллект — анализ частоты правил очистки');
  output.markdown('');
  
  // =========================================================
  //  БАЗОВАЯ ЛОГИКА НОРМАЛИЗАЦИИ
  // =========================================================
  function cleanUniversal(s) {
    if (s == null) return { text: s, ops: [] };
    const orig = String(s); let out = orig; const ops = [];
    if (/[ёЁ]/.test(out)) { out = out.replace(/ё/g,'е').replace(/Ё/g,'Е'); ops.push('ё→е'); }
    let sym=false,q=false,d=false;
    out = Array.from(out).map(ch => {
      if (ch==='ё'||ch==='Ё'||ch===' ') return ch;
      if (ch==='\u00A0'||ch==='\u2009'||ch==='\u202F'||ch==='\t'||ch==='\r'||ch==='\n'){sym=true;return ' ';}
      if (ch==='\u00AB'||ch==='\u00BB'||ch==='\u201C'||ch==='\u201D'||ch==='\u201E'||ch==='\u2018'||ch==='\u2019'){q=true;return (ch==='\u2018'||ch==='\u2019')?"'":'"';}
      if (ch==='\u2013'||ch==='\u2014'){d=true;return '-';}
      return ch;
    }).join('');
    if (sym) ops.push('служебные символы');
    if (q) ops.push('кавычки');
    if (d) ops.push('тире');
    if (/\s{2,}/.test(out)) { out=out.replace(/\s{2,}/g,' '); ops.push('пробелы'); }
    out=out.trim();
    if (orig!==out && !ops.includes('пробелы') && /^\s|\s$/.test(orig)) ops.push('пробелы');
    return { text: out, ops };
  }

  const MONTHS_RU = {'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,'июля':7,'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12};

  function normalizeEmail(s){
    let v=String(s).trim().toLowerCase().replace(/^mailto:/i,'').replace(/;$/,'');
    v=v.replace(/\s+/g,'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return {status:'needs_input',from:s,to:v,reason:'некорректный email'};
    return {status:'ok',from:s,to:v,reason:'email'};
  }
  function normalizePhone(s){
    const digits=String(s).replace(/[^\d]/g,'');
    if(/\*/.test(s)) return {status:'needs_input',from:s,to:s,reason:'номер маскирован'};
    if(digits.length<10) return {status:'needs_input',from:s,to:s,reason:'<10 цифр'};
    if(digits.length>12) return {status:'needs_input',from:s,to:s,reason:'>12 цифр'};
    let norm;
    if(digits.length===10) norm='7'+digits;
    else if(digits.length===11&&digits[0]==='8') norm='7'+digits.slice(1);
    else if(digits.length===11&&digits[0]==='7') norm=digits;
    else if(digits.length===12&&digits.slice(0,2)==='78') norm=digits.slice(1);
    else return {status:'needs_input',from:s,to:s,reason:'не-РФ формат'};
    const target='+'+norm;
    return {status:'ok',from:s,to:target,reason:'телефон'};
  }
  function normalizeDate(s){
    let v=String(s).trim(); let m=v.match(/^(\d{4})-(\d{2})-(\d{2})/)||v.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
    let year,month,day;
    if(m){ if(m[1].length===4){year=+m[1];month=+m[2];day=+m[3];} else {day=+m[1];month=+m[2];year=+m[3];} }
    else {
      const dd=v.match(/^(\d{2})[./](\d{2})[./](\d{2})$/);
      if(dd){day=+dd[1];month=+dd[2];year=2000+ +dd[3];}
      else {
        const ru=v.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
        if(ru){day=+ru[1];month=MONTHS_RU[ru[2].toLowerCase()];year=+ru[3];if(!month)return {status:'needs_input',from:s,to:v,reason:'месяц не распознан'};}
        else return {status:'needs_input',from:s,to:v,reason:'формат даты'};
      }
    }
    if(!(year>=1900&&year<=2100)||!(month>=1&&month<=12)||!(day>=1&&day<=31)) return {status:'needs_input',from:s,to:v,reason:'неверные компоненты'};
    return {status:'ok',from:s,to:[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-'),reason:'дата'};
  }
  function normalizeFio(s){
    let v=String(s).replace(/\s+/g,' ').trim();
    const parts=v.split(' ');
    if(parts.length<2||parts.length>3) return {status:'needs_input',from:s,to:v,reason:'не 2-3 части'};
    const cap=parts.map(p=>{ if(/^([А-ЯЁA-Z]\.)+$/.test(p))return p; return p.charAt(0).toUpperCase()+p.slice(1).toLowerCase();}).join(' ');
    return {status:'ok',from:s,to:cap,reason:'ФИО'};
  }
  const CITY_ALIAS={'екб':'Екатеринбург','нск':'Новосибирск','спб':'Санкт-Петербург','мск':'Москва','члб':'Челябинск','уренб':'Оренбург'};
  function normalizeCity(s){
    let v=String(s).trim().replace(/^[Гг]\s*/,'').replace(/\s+/g,' ').trim();
    const low=v.toLowerCase();
    if(CITY_ALIAS[low]) v=CITY_ALIAS[low];
    if(/[A-Za-z]/.test(v)) return {status:'needs_input',from:s,to:v,reason:'латиница'};
    if(!/[а-яё]/i.test(v)) return {status:'needs_input',from:s,to:v,reason:'не город'};
    return {status:'ok',from:s,to:v.charAt(0).toUpperCase()+v.slice(1).toLowerCase(),reason:'город'};
  }
  const OPF=/^(ООО|ОАО|ЗАО|АО|ИП|ПАО|ТОО|ЧП|ИЧП)\s*/i;
  function normalizeCompany(s){
    const hadOpf=OPF.test(String(s));
    let v=String(s).replace(OPF,'').replace(/\s+/g,' ').trim();
    v=v.replace(/^[\s«"""]+/,'').replace(/[\s»"""]+$/,'').trim();
    if(!hadOpf && v.indexOf(' ')>=0){}
    const words=v.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');
    return {status:'ok',from:s,to:words,reason:'компания'+(hadOpf?' (ОПФ удалена)':'')};
  }
  function normalizeAmount(s){
    let v=String(s).trim().replace(/[\s\u00A0]/g,'');
    v=v.replace(/^(RUB|RUR|₽|руб|рубли|РУБ|РУБЛИ)/i,'').replace(/(RUB|RUR|₽|руб|рубли|РУБ|РУБЛИ)$/i,'').replace(/[₽]/g,'').trim();
    let num=null;
    const mil=v.match(/^([\d.,]+)\s*млн/i), thou=v.match(/^([\d.,]+)\s*тыс/i);
    if(mil) num=parseFloat(mil[1].replace(',','.'))*1e6;
    else if(thou) num=parseFloat(thou[1].replace(',','.'))*1e3;
    else if(/^\d[\d.,]*$/.test(v)) num=parseFloat(v.replace(',','.'));
    if(num==null||isNaN(num)) return {status:'needs_input',from:s,to:v,reason:'не сумма'};
    return {status:'ok',from:s,to:String(Math.round(num)),reason:'сумма'};
  }

  function detectFieldType(name, values) {
    name=String(name||'').toLowerCase();
    const samples=(values||[]).map(v=>String(v==null?'':v)).filter(v=>v.trim());
    const ne=samples.filter(v=>v.trim());
    const at=ne.filter(v=>v.includes('@')).length;
    if(/email|почт|e-?mail/i.test(name) || at/Math.max(1,ne.length)>=0.5) return 'email';
    if(/инн|inn/i.test(name)) return 'generic';
    if(/phone|тел/i.test(name) && /\b(phone|тел|телефон)\b/i.test(name)) return 'phone';
    if(/phone_?raw/i.test(name)) return 'phone';
    const digs=ne.map(v=>(v.match(/\d/g)||[]).length);
    if(ne.filter((v,i)=>digs[i]>=10&&digs[i]<=12).length/Math.max(1,ne.length)>=0.6) return 'phone';
    if(/date|дата|start|end|начал|оконч/i.test(name)) return 'date';
    if(ne.filter(v=>/\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}[./]\d{2,4}/.test(v)).length/Math.max(1,ne.length)>=0.6) return 'date';
    if(/budget|сумм|бюджет|цен|стоимост|price/i.test(name)) return 'amount';
    if(/city|город/i.test(name)) return 'city';
    if(/company|компан|org|организ/i.test(name)) return 'company';
    if(/fio|фио|имя|фамил|заявител|requester|name/i.test(name)) return 'fio';
    return 'generic';
  }

  function normalizeByType(type, raw) {
    if(raw==null) return {status:'skip',from:raw,to:raw,reason:'пусто'};
    const s=String(raw);
    switch(type){
      case 'email': return normalizeEmail(s);
      case 'phone': return normalizePhone(s);
      case 'date': return normalizeDate(s);
      case 'fio': return normalizeFio(s);
      case 'city': return normalizeCity(s);
      case 'company': return normalizeCompany(s);
      case 'amount': return normalizeAmount(s);
      default: return {status:'skip',from:s,to:s,reason:'generic'};
    }
  }

  // =========================================================
  //  ШАГ 1. НАСТРОЙКА ИСТОЧНИКОВ
  // =========================================================
  output.markdown('## Шаг 1. Настройка');
  output.markdown('');
  
  // --- 1.1 Представление ---
  let view = null;
  try {
    view = await input.viewAsync('Выберите представление для анализа:', datasheet);
  } catch(e) { view = null; }
  output.markdown('- Представление: **' + (view && view.name ? view.name : 'все записи (без фильтра)') + '**');

  // --- 1.2 Поля для анализа ---
  const SKIP_TYPES = ['number','autoNumber','currency','percent','rating','singleSelect','multiSelect','date','dateTime','createdTime','lastModifiedTime','formula','cascader','createdUser','lastModifiedUser','singleLink','multipleLink','oneWayLink','twoWayLink','attachment','phone','email','url','checkbox','user','group','location','button','map','address','tag'];
  const textFields = datasheet.fields.filter(f => !SKIP_TYPES.includes(f.type));

  output.markdown('');
  output.markdown('Доступных текстовых полей: **' + textFields.length + '**. По умолчанию выбраны все.');
  
  const exclInput = await input.textAsync(
    '˃ Поля для ИСКЛЮЧЕНИЯ из нормализации (точные названия через запятую).\n' +
    'Пусто = обрабатываем все. Пример: Company Name, Phone'
  );
  const exclNames = String(exclInput||'').split(/[,;]+/).map(s=>s.trim().toLowerCase()).filter(s=>s.length>0);
  const nameMap = {};
  textFields.forEach(f=>{ nameMap[f.name.toLowerCase()]=f; });
  const notFoundExcl = exclNames.filter(n=>!nameMap[n]);
  if (notFoundExcl.length) {
    output.markdown('⚠️ Не найдены поля: **' + notFoundExcl.join(', ') + '** (пропущены)');
  }
  const fieldsToProcess = textFields.filter(f=>!exclNames.includes(f.name.toLowerCase()));
  output.markdown('Будут обработаны: **' + fieldsToProcess.length + '** полей');
  output.markdown('');
  
  // =========================================================
  //  ШАГ 2. АНАЛИЗ И НОРМАЛИЗАЦИЯ
  // =========================================================
  output.markdown('## Шаг 2. Анализ и нормализация');
  output.markdown('');
  
  // Классифицируем тип каждого поля по названию + выборке
  const fieldTypes = {};
  fieldsToProcess.forEach(f=>{
    const sample=[];
    for(let i=0;i<Math.min(records.length,15);i++){
      const v=records[i].getCellValueString(f.id);
      if(v&&String(v).trim()){sample.push(String(v)); if(sample.length>=10)break;}
    }
    fieldTypes[f.id]=detectFieldType(f.name, sample);
  });
  
  output.markdown('Определённые типы: ' + fieldsToProcess.map(f=>'`'+f.name+'`→'+fieldTypes[f.id]).join(', '));
  
  // Собираем изменения
  const changes=[];
  const issues=[];
  let totalCells=0;
  
  records.forEach(rec=>{
    fieldsToProcess.forEach(f=>{
      const raw=rec.getCellValueString(f.id);
      if(raw==null||String(raw).trim()==='') return;
      const type=fieldTypes[f.id];
      const clean=cleanUniversal(raw);
      let res={status:'skip',from:raw,to:clean.text,reason:'базовая очистка'};
      if(type!=='generic'){ const t=normalizeByType(type,clean.text); res=t; }
      const to = res.to!=null?res.to:clean.text;
      if(res.status==='needs_input'){ issues.push({recordId:rec.id,field:f,type,from:raw,reason:res.reason}); }
      else if(to!==raw || clean.ops.length){ changes.push({recordId:rec.id,field:f,type,from:raw,to,reason:res.reason==='базовая очистка'?clean.ops.join('+'):res.reason}); }
      totalCells++;
    });
  });
  
  output.markdown('');
  output.markdown('Проверено ячеек: **' + totalCells + '**');
  output.markdown('Найдено исправлений: **' + changes.length + '**');
  output.markdown('Ячеек к ручной обработке: **' + issues.length + '**');
  
  // Preview
  if (changes.length){
    output.markdown('');
    output.markdown('### 🔍 Preview (первые 15)');
    output.table(changes.slice(0,15).map(c=>({
      'Столбец': c.field.name, 'Было': c.from, '→': c.to, 'Правило': c.reason
    })));
  }
  
  // Подтверждение и применение
  const confirm = (await input.textAsync('\nПрименить ' + changes.length + ' исправлений? Введите "да":')).trim().toLowerCase();
  let applied=0, appliedCells=0;
  let dupGroups = []; // Объявить заранее
  if (confirm==='да'||confirm==='yes'){
    const byRecord={};
    changes.forEach(c=>{ byRecord[c.recordId]=byRecord[c.recordId]||{}; byRecord[c.recordId][c.field.id]=c.to; });
    const updates=Object.keys(byRecord).map(id=>({id,valuesMap:byRecord[id]}));
    const BATCH=100, batches=[];
    for(let i=0;i<updates.length;i+=BATCH) batches.push(updates.slice(i,i+BATCH));
    for(let b=0;b<batches.length;b++){
      try{ await datasheet.updateRecordsAsync(batches[b]); applied+=batches[b].length; appliedCells+=Object.keys(byRecord).length; }
      catch(e){ output.markdown('**⚠️ Партия '+b+'**: '+(e.message||e)); }
    }
    output.markdown('');
    output.markdown('✅ Применено: **' + applied + '/' + updates.length + '** записей');
  } else {
    output.markdown('');
    output.markdown('❌ Применение отменено');
  }
  
  output.markdown('');
  output.markdown('---');
  output.markdown('');
  
  // =========================================================
  //  ШАГ 3. ПОИСК ДУБЛЕЙ
  // =========================================================
  output.markdown('## Шаг 2. Поиск дублей');
  output.markdown('');
  
  // Функции нормализации ключей для сравнения
  const keyEmail = s => normalizeEmail(s).status==='ok' ? normalizeEmail(s).to : null;
  const keyPhone = s => normalizePhone(s).status==='ok' ? normalizePhone(s).to : null;
  const keyInn = s => { const d=String(s||'').replace(/[^\d]/g,''); return d.length>=10 ? d : null; };
  const keyCity = s => normalizeCity(s).status==='ok' ? normalizeCity(s).to.toLowerCase() : String(s||'').trim().toLowerCase();
  const keyFio = s => { const n=normalizeFio(s); return n.status==='ok'?n.to.toLowerCase():String(s||'').trim().toLowerCase(); };
  const keyName = s => normalizeCompany(s).status==='ok' ? normalizeCompany(s).to.toLowerCase() : String(s||'').trim().toLowerCase();
  
  // Авто-детекция полей для ключей
  let emailField=null, phoneField=null, innField=null, cityField=null, nameField=null, fioField=null;
  fieldsToProcess.forEach(f=>{
    const t=fieldTypes[f.id];
    const ln=f.name.toLowerCase();
    if(t==='email'&&!emailField) emailField=f;
    else if(t==='phone'&&!phoneField) phoneField=f;
    else if(/инн|inn/i.test(ln)&&!innField) innField=f;
    else if(t==='city'&&!cityField) cityField=f;
    else if(t==='fio'&&!fioField) fioField=f;
    else if(t==='company'&&!nameField) nameField=f;
  });
  
  // Предложить авто-ключи
  const autoKeys = [];
  if(emailField) autoKeys.push(emailField.name + ' (email)');
  if(phoneField) autoKeys.push(phoneField.name + ' (телефон)');
  if(innField) autoKeys.push(innField.name + ' (ИНН)');
  if(nameField) autoKeys.push(nameField.name + ' (название)');
  if(fioField) autoKeys.push(fioField.name + ' (ФИО)');
  
  output.markdown('### Авто-детекция ключей для поиска дублей');
  output.markdown('');
  if(autoKeys.length>0){
    output.markdown('Найдены поля для ключей:');
    output.markdown('- ' + autoKeys.join('\n- '));
    output.markdown('');
  } else {
    output.markdown('⚠️ Не найдено полей для ключей (email, телефон, ИНН, название, ФИО)');
  }
  
  const keyChoice = await input.textAsync(
    'Использовать авто-ключи (**да**) или ввести вручную?\n' +
    '- **да** (или Enter) — использовать найденные: ' + (autoKeys.join(', ') || 'нет') + '\n' +
    '- Введите названия полей через запятую для ручного выбора'
  );
  
  let keyFields = [];
  const keyAnswer = String(keyChoice||'').trim().toLowerCase();
  
  if(keyAnswer==='да'||keyAnswer==='yes'||keyAnswer===''){
    // Использовать авто-найденные
    if(emailField) keyFields.push(emailField);
    if(phoneField) keyFields.push(phoneField);
    if(innField) keyFields.push(innField);
    if(nameField) keyFields.push(nameField);
    if(fioField) keyFields.push(fioField);
  } else {
    // Ручной выбор
    const manualNames = keyAnswer.split(/[,;]+/).map(s=>s.trim().toLowerCase());
    const allFieldsMap = {};
    datasheet.fields.forEach(f=>{ allFieldsMap[f.name.toLowerCase()]=f; });
    keyFields = manualNames.map(n=>allFieldsMap[n]).filter(f=>f!==undefined);
    output.markdown('Выбрано вручную: **' + keyFields.length + '** полей');
  }
  
  if(keyFields.length===0){
    output.markdown('⚠️ Нет полей для ключей — поиск дублей пропущен');
    output.markdown('');
  } else {
    output.markdown('');
    output.markdown('Ключи: ' + keyFields.map(f=>f.name).join(', '));
    output.markdown('');
    
    // Построить все записи с нормализованными ключами
    const recordIndex = records.map((rec,idx)=>{
      const gv=(f)=> f ? rec.getCellValueString(f.id) : null;
      const keys = {};
      keyFields.forEach(f=>{
        const raw = gv(f);
        const ln = f.name.toLowerCase();
        let key = null;
        if(fieldTypes[f.id]==='email') key = keyEmail(raw);
        else if(fieldTypes[f.id]==='phone') key = keyPhone(raw);
        else if(/инн|inn/i.test(ln)) key = keyInn(raw);
        else if(fieldTypes[f.id]==='city') key = keyCity(raw);
        else if(fieldTypes[f.id]==='fio') key = keyFio(raw);
        else if(fieldTypes[f.id]==='company') key = keyName(raw);
        else key = String(raw||'').trim().toLowerCase();
        keys[f.id] = key;
      });
      return { rec, id: rec.id, row: idx+1, keys };
    });
    
    // Поиск дублей по комбинации ключей
    const dupesMap = new Map();
    recordIndex.forEach(r=>{
      const fingerprint = Object.values(r.keys).filter(Boolean).join('|');
      if(!fingerprint) return;
      if(!dupesMap.has(fingerprint)) dupesMap.set(fingerprint, []);
      dupesMap.get(fingerprint).push(r);
    });
    
    const dupGroups = [];
    dupesMap.forEach((arr,fp)=>{ if(arr.length>1) dupGroups.push({fp, rows: arr}); });
    
    output.markdown('### Найдено дублей');
    output.markdown('');
    output.markdown('Групп дублей: **' + dupGroups.length + '**');
    output.markdown('');
    
    if(dupGroups.length>0){
      output.table(dupGroups.slice(0,15).map(g=>({
        'Ключ': g.fp.length>50 ? g.fp.substring(0,50)+'...' : g.fp,
        'Строки': g.rows.map(r=>r.row).join(', '),
        'Записей': g.rows.length
      })));
      output.markdown('');
      output.markdown('Показаны первые 15 групп. Всего: **' + dupGroups.length + '**');
    }
  }
  
  output.markdown('');
  output.markdown('---');
  output.markdown('');
  
  // =========================================================
  //  ШАГ 4. ИНТЕЛЛЕКТ
  // =========================================================
  output.markdown('## Шаг 3. Интеллект — анализ правил очистки');
  output.markdown('');
  
  const ruleStats = {};
  changes.forEach(c=>{ ruleStats[c.reason]=ruleStats[c.reason]||0; ruleStats[c.reason]++; });
  const topRules = Object.keys(ruleStats).sort((a,b)=>ruleStats[b]-ruleStats[a]).slice(0,10);
  
  output.markdown('Топ-правил очистки по частоте применения:');
  output.markdown('');
  
  if(topRules.length>0){
    output.table(topRules.map((r,i)=>({
      '#': i+1,
      'Правило': r,
      'Применений': ruleStats[r],
      'Рекомендация': ruleStats[r]/Math.max(1,totalCells)*100>=5 ? '🔁 повторять' : '💡 опционально'
    })));
  } else {
    output.markdown('ℹ️ Изменений не было — статистика пуста');
  }
  
  output.markdown('');
  output.markdown('# ✅ Готово');
  output.markdown('');
  output.markdown('**Итоги:**');
  output.markdown('- Нормализация: ' + (applied?'**'+applied+'** записей изменено':'применение отменено'));
  output.markdown('- Дубли: **' + dupGroups.length + '** групп найдено');
  output.markdown('- Правила: **' + topRules.length + '** типов изменений');
  output.markdown('');
  output.markdown('---');
  output.markdown('_Запускайте виджет повторно для других таблиц или переходите к микро-виджетам для точечной обработки_');
  
})().catch(e=>{
  output.markdown('**❌ Ошибка:** ' + (e&&e.message?e.message:e));
});
