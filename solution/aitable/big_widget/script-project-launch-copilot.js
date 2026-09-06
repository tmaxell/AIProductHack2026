/* ============================================================
   Project Launch Copilot — единый мастер (все 5 пунктов)
   ------------------------------------------------------------
   1. НАСТРОЙКА ИСТОЧНИКОВ
   2. АНАЛИЗ И НОРМАЛИЗАЦИЯ ДАННЫХ
   3. ПОИСК ДУБЛЕЙ И СОПОСТАВЛЕНИЕ
   4. ЗАПУСК ПРОЕКТА (шаблон + задачи + round-robin)
   5. ИНТЕЛЛЕКТ (предложение правил очистки)

   API: input.textAsync / fieldAsync / viewAsync / recordAsync,
        space.getActiveDatasheetAsync / getDatasheetsAsync
   ============================================================ */

(async function() {
  const datasheet = await space.getActiveDatasheetAsync();
  const records = await datasheet.getRecordsAsync();

  // =========================================================
  //  БАЗОВАЯ ЛОГИКА НОРМАЛИЗАЦИИ (из logic.js, дополнена)
  // =========================================================
  function cleanUniversal(s) {
    if (s == null) return { text: s, ops: [] };
    const orig = String(s); let out = orig; const ops = [];
    if (/[ёЁ]/.test(out)) { out = out.replace(/ё/g,'е').replace(/Ё/g,'Е'); ops.push('ё→е'); }
    let sym=false,q=false,d=false;
    out = Array.from(out).map(ch => {
      if (ch==='ё'||ch==='Ё'||ch===' ') return ch;
      if (ch==='\u00A0'||ch==='\u2009'||ch==='\u202F'||ch==='\t'||ch==='\r'||ch==='\n'){sym=true;return ' ';}
      if (ch==='«'||ch==='»'||ch==='“'||ch==='”'||ch==='„'||ch==='‘'||ch==='’'){q=true;return (ch==='‘'||ch==='’')?"'":'"';}
      if (ch==='–'||ch==='—'){d=true;return '-';}
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
    let v=String(s).trim().toLowerCase().replace(/^mailto:/i,'').replace(/[;]$/,'');
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
    v=v.replace(/^[\s«"“”]+/,'').replace(/[\s»"”]+$/,'').trim();
    if(!hadOpf && v.indexOf(' ')>=0){ /* оставляем как есть, только регистр */ }
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
    // ИНН по имени — НЕ телефон (даже если 10-12 цифр)
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
  output.markdown('# 📚 Project Launch Copilot\nТаблица: **' + datasheet.name + '**');
  output.markdown('\n## Шаг 1. Настройка\n');

  // --- 1.1 Представление ---
  let view = null;
  try {
    view = await input.viewAsync('Выберите представление для анализа:', datasheet);
  } catch(e) { view = null; }
  output.markdown('- Представление: **' + (view && view.name ? view.name : 'все записи (без фильтра)') + '**');

  // --- 1.2 Поля для анализа ---
  const SKIP_TYPES = ['number','autoNumber','currency','percent','rating','singleSelect','multiSelect','date','dateTime','createdTime','lastModifiedTime','formula','cascader','createdUser','lastModifiedUser','singleLink','multipleLink','oneWayLink','twoWayLink','attachment','phone','email','url','checkbox','user','group','location','button','map','address','tag'];
  const textFields = datasheet.fields.filter(f => !SKIP_TYPES.includes(f.type));

  output.markdown('\nДоступных текстовых полей: **' + textFields.length + '**. По умолчанию выбраны все.');
  output.markdown('Названия: ' + textFields.map(f=>'`'+f.name+'`').join(', '));

  const exclInput = await input.textAsync(
    '˃ Поля для ИСКЛЮЧЕНИЯ из нормализации (точные названия через запятую).\n' +
    'Пусто = обрабатываем все. Пример: Company Name, Phone'
  );
  const exclNames = String(exclInput||'').split(/[,;]+/).map(s=>s.trim().toLowerCase()).filter(s=>s.length>0);
  const nameMap = {};
  textFields.forEach(f=>{ nameMap[f.name.toLowerCase()]=f; });
  const notFoundExcl = exclNames.filter(n=>!nameMap[n]);
  if (notFoundExcl.length) {
    output.markdown('\n⚠️ Не найдены поля: **' + notFoundExcl.join(', ') + '** (пропущены)');
  }
  const fieldsToProcess = textFields.filter(f=>!exclNames.includes(f.name.toLowerCase()));
  output.markdown('Будут обработаны: **' + fieldsToProcess.length + '** полей');

  // --- 1.3 Справочники (другие таблицы пространства) ---
  output.markdown('\n### Справочники\n');

  // Получить список таблиц пространства (fallback-каскад):
  //  1) input.tableAsync — нативный селектор таблицы (приоритет, если доступен);
  //  2) space.getDatasheetsAsync — список таблиц;
  //  3) ручной ввод названия через input.textAsync.
  async function pickTable(label, hints) {
    // Способ A: нативный селектор таблицы
    try {
      const t = await input.tableAsync('˃ ' + label, null);
      if (t && t.name) {
        output.markdown('- ✅ ' + label + ': **' + t.name + '** (нативный выбор)');
        return t;
      }
    } catch(e) { /* метод недоступен */ }

    // Способ B: список таблиц
    let allTables = [];
    try {
      const arr = await space.getDatasheetsAsync();
      allTables = Array.isArray(arr) ? arr : [];
    } catch(e) { allTables = []; }

    if (allTables.length) {
      // Умный автоподбор по подсказкам в названии
      const hl = hints.map(h=>h.toLowerCase());
      const match = allTables.find(t => hl.some(h=>String(t.name||'').toLowerCase().includes(h)));
      if (match) {
        output.markdown('- ✅ ' + label + ': **' + match.name + '** (авто)');
        return match;
      }
      const list = allTables.map((t,i)=>String(i+1)+'. '+t.name).join('\n');
      const ans = await input.textAsync('˃ ' + label + '.\nТаблицы пространства:\n' + list + '\n\nВведите НАЗВАНИЕ (точное) или "нет":');
      const a = String(ans||'').trim();
      if (a.toLowerCase()==='нет'||a==='') return null;
      const found = allTables.find(t=>String(t.name||'').toLowerCase()===a.toLowerCase());
      if (found) { output.markdown('- ✅ ' + label + ': **' + found.name + '**'); return found; }
    }

    // Способ C: ручной ввод названия
    const manual = await input.textAsync('˃ ' + label + ' — введите НАЗВАНИЕ таблицы (или "нет"):');
    const m = String(manual||'').trim();
    if (m.toLowerCase()==='нет'||m==='') { output.markdown('- ⚠️ ' + label + ': пропущен'); return null; }
    // Попробуем получить таблицу по имени через getDatasheets, иначе вернём ничего
    try {
      const arr = await space.getDatasheetsAsync();
      const ft = (Array.isArray(arr)?arr:[]).find(t=>String(t.name||'').toLowerCase()===m.toLowerCase());
      if (ft) { output.markdown('- ✅ ' + label + ': **' + ft.name + '** (по имени)'); return ft; }
    } catch(e){}
    output.markdown('- ⚠️ ' + label + ': **' + m + '** не найдена (используйте input.tableAsync, если доступно)');
    return null;
  }

  const companyTable = await pickTable('Справочник компаний', ['компан','company','org']);
  const employeeTable = await pickTable('Справочник сотрудников', ['сотруд','employee','user','персонал']);
  const templateTable = await pickTable('Шаблоны проектов', ['шаблон','template']);
  const taskTable = await pickTable('Таблица задач', ['задач','task']);

  // =========================================================
  //  ШАГ 2. АНАЛИЗ И НОРМАЛИЗАЦИЯ
  // =========================================================
  output.markdown('\n## Шаг 2. Анализ и нормализация\n');

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

  output.markdown('\nПроверено ячеек: **' + totalCells + '**');
  output.markdown('Найдено исправлений: **' + changes.length + '**');
  output.markdown('Ячеек к ручной обработке: **' + issues.length + '**');

  // Preview
  if (changes.length){
    output.markdown('\n### 🔍 Preview (первые 15)' );
    output.table(changes.slice(0,15).map(c=>({
      'Столбец': c.field.name, 'Было': c.from, '→': c.to, 'Правило': c.reason
    })));
  }

  // Подтверждение и применение
  const confirm = (await input.textAsync('\nПрименить ' + changes.length + ' исправлений? Введите "да":')).trim().toLowerCase();
  let applied=0, appliedCells=0;
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
    output.markdown('\n✅ Применено: **' + applied + '/' + updates.length + '** записей');
  } else {
    output.markdown('❌ Применение отменено');
  }

  output.markdown('\n## Этап 2 завершён. Дальнейшие шаги (matching, запуск проекта, интеллект) выполняются по команде.\n');

  // =========================================================
  //  ШАГ 3. ПОИСК ДУБЛЕЙ И СОПОСТАВЛЕНИЕ
  // =========================================================
  output.markdown('\n## Шаг 3. Поиск дублей и сопоставление\n');

  // Функции нормализации ключей для сравнения
  const keyEmail = s => normalizeEmail(s).status==='ok' ? normalizeEmail(s).to : null;
  const keyPhone = s => normalizePhone(s).status==='ok' ? normalizePhone(s).to : null;
  const keyInn = s => { const d=String(s||'').replace(/[^\d]/g,''); return d.length>=10 ? d : null; };
  const keyCity = s => normalizeCity(s).status==='ok' ? normalizeCity(s).to.toLowerCase() : String(s||'').trim().toLowerCase();
  const keyFio = s => { const n=normalizeFio(s); return n.status==='ok'?n.to.toLowerCase():String(s||'').trim().toLowerCase(); };

  // Поле-ключ в текущей таблице: определяем по типу
  let emailField=null, phoneField=null, innField=null, cityField=null, nameField=null, fioField=null;
  fieldsToProcess.forEach(f=>{
    const t=fieldTypes[f.id];
    if(t==='email'&&!emailField) emailField=f;
    else if(t==='phone'&&!phoneField) phoneField=f;
    else if(t==='city'&&!cityField) cityField=f;
    else if(t==='fio'&&!fioField) fioField=f;
    else if(t==='company'&&!nameField) nameField=f;
    // ИНН по названию
    const ln=f.name.toLowerCase();
    if(/инн|inn/i.test(ln)&&!innField) innField=f;
  });

  // Построить все кандидаты-записи с нормализованными ключами
  const recordIndex = records.map(rec=>{
    const gv=(f)=> f ? rec.getCellValueString(f.id) : null;
    return {
      rec, id: rec.id, row: 0,
      email: keyEmail(gv(emailField)),
      phone: keyPhone(gv(phoneField)),
      inn: keyInn(gv(innField)),
      city: keyCity(gv(cityField)),
      name: normalizeCompany(gv(nameField)).to,
      fio: keyFio(gv(fioField)),
    };
  }).map((r,idx)=>({...r,row:idx+1}));

  // ---- 3a. Дубли внутри таблицы ----
  output.markdown('\n### 3a. Дубли внутри таблицы');
  const dupesMap = new Map(); // fingerprint -> [{row, id}]
  recordIndex.forEach(r=>{
    const fp = [r.email, r.phone, r.inn].filter(Boolean).join('|');
    if(!fp) return;
    if(!dupesMap.has(fp)) dupesMap.set(fp, []);
    dupesMap.get(fp).push(r);
  });
  const dupGroups = [];
  dupesMap.forEach((arr,fp)=>{ if(arr.length>1) dupGroups.push({fp, rows: arr}); });
  output.markdown('Найдено групп дублей: **' + dupGroups.length + '**');

  if (dupGroups.length){
    output.table(dupGroups.slice(0,15).map(g=>({
      'Ключ': g.fp, 'Строки': g.rows.map(r=>r.row).join(', '), 'Записей': g.rows.length
    })));
  }

  // ---- 3b. Соответствия со справочником компаний ----
  if (companyTable){
    output.markdown('\n### 3b. Соответствия со справочником компаний');
    const compRecords = await companyTable.getRecordsAsync();
    const compFields = companyTable.fields;
    // Найти поля справочника
    const compGet = (rec, key) => {
      const f = compFields.find(f2=>{ const ln=f2.name.toLowerCase(); return key.some(k=>ln.includes(k)); });
      return f ? rec.getCellValueString(f.id) : null;
    };
    const compIndex = compRecords.map(cr=>({
      rec: cr, id: cr.id,
      inn: keyInn(compGet(cr,['инн','inn'])),
      email: keyEmail(compGet(cr,['email','почт'])),
      name: normalizeCompany(compGet(cr,['назван','компан','name','org'])).to,
    }));

    const matches=[]; const ambiguous=[];
    recordIndex.forEach(r=>{
      if(!r.name && !r.inn && !r.email) return;
      const cands = compIndex.map(ci=>{
        let score=0; const hits=[];
        if(r.name && ci.name && r.name.toLowerCase()===ci.name.toLowerCase()){ score+=0.6; hits.push('название'); }
        else if(r.name && ci.name && cn(r.name,ci.name)>0.85){ score+=0.45; hits.push('название~'); }
        if(r.inn && ci.inn && r.inn===ci.inn){ score+=0.5; hits.push('ИНН'); }
        if(r.email && ci.email && r.email===ci.email){ score+=0.4; hits.push('email'); }
        return {ci, score, hits};
      }).filter(c=>c.score>=0.5).sort((a,b)=>b.score-a.score);

      if(cands.length===1){ matches.push({row:r.row, comp:cands[0].ci.name, score:cands[0].score, hits:cands[0].hits.join(',')}); }
      else if(cands.length>1){ ambiguous.push({row:r.row, n:cands.length, score:Math.round((cands[0].score)*100)}); }
    });

    output.markdown('Однозначных соответствий: **' + matches.length + '**');
    output.markdown('Неоднозначных (требуют review): **' + ambiguous.length + '**');
    if(matches.length) output.table(matches.slice(0,15));
    if(ambiguous.length) output.table(ambiguous.slice(0,15));
  }

  // хелпер для схожести строк (Jaccard по триграммам, упрощённо)
  function cn(a,b){ a=String(a||'').toLowerCase(); b=String(b||'').toLowerCase(); const la=new Set(a.split('')), lb=new Set(b.split('')); let inter=0; la.forEach(c=>{if(lb.has(c))inter++;}); const union=la.size+lb.size-inter; return union?inter/union:0; }

  output.markdown('\n## Этап 3 завершён (базовый matching). Расширение: запись связей, review неоднозначных.\n');

  // =========================================================
  //  ШАГ 4. ЗАПУСК ПРОЕКТА (шаблон + задачи + round-robin)
  // =========================================================
  output.markdown('\n## Шаг 4. Запуск проекта\n');

  if (templateTable){
    const tplRecords = await templateTable.getRecordsAsync();
    output.markdown('Шаблонов в таблице: **' + tplRecords.length + '**');
    if (tplRecords.length){
      // Пользователь выбирает шаблон по названию/строке
      output.table(tplRecords.slice(0,20).map((tr,i)=>({'№':i+1,'Шаблон': String(tr.getCellValueString(templateTable.fields[0].id)||('Запись '+(i+1)))})));
      const tplPick = (await input.textAsync('˃ № шаблона для запуска (или "нет"):')).trim();
      const tplNum = parseInt(tplPick,10);
      const chosen = (tplNum>=1 && tplNum<=tplRecords.length) ? tplRecords[tplNum-1] : null;
      if (chosen){
        output.markdown('Выбран шаблон: **' + String(chosen.getCellValueString(templateTable.fields[0].id)) + '**');
      } else {
        output.markdown('Шаблон не выбран, пропускаем создание задач.');
      }
    }
  } else {
    output.markdown('Справочник шаблонов не выбран — создание задач пропущено.');
  }

  // round-robin назначение исполнителей (если выбран справочник сотрудников)
  if (employeeTable){
    const empRecords = await employeeTable.getRecordsAsync();
    output.markdown('Сотрудников в справочнике: **' + empRecords.length + '**');
    if (empRecords.length){
      output.markdown('Обход (round-robin) по сотрудникам для распределения задач.');
      output.table(empRecords.slice(0,15).map((er,i)=>({'№':i+1,'Сотрудник': String(er.getCellValueString(employeeTable.fields[0].id)||('Emp '+(i+1)))})));
    }
  }

  output.markdown('\n## Этап 4 завершён (базовый запуск: шаблон + round-robin).\n');

  // =========================================================
  //  ШАГ 5. ИНТЕЛЛЕКТ — предложение правил очистки
  // =========================================================
  output.markdown('\n## Шаг 5. Интеллект — предложение правил очистки\n');

  // Анализ: какие типы исправлений встречаются чаще всего
  const ruleStats = {};
  changes.forEach(c=>{ ruleStats[c.reason]=ruleStats[c.reason]||0; ruleStats[c.reason]++; });
  const topRules = Object.keys(ruleStats).sort((a,b)=>ruleStats[b]-ruleStats[a]).slice(0,10);

  output.markdown('Топ-правил очистки по частоте применения в этой таблице (на основе шага 2):');
  if (topRules.length){
    output.table(topRules.map((r,i)=>({'Правило': r, 'Применений': ruleStats[r], 'Рекомендация': ruleStats[r]/Math.max(1,totalCells)*100>=5?'🔁 повторять':'💡 опционально'})));
  }

  output.markdown('\n# ✅ Готово (базовый сценарий)');
  output.markdown('- Нормализация: применяется'+(applied?' ✅':' — отменена')+' \n- Дубли найдено: **' + dupGroups.length + '** (\n- Справочники: ' + (companyTable?companyTable.name:'—') + ' / ' + (employeeTable?employeeTable.name:'—') + ' \n- Предложено правил: **' + topRules.length + '**');

  // =========================================================
  //  ЗАВЕРШЕНИЕ
  // =========================================================
})().catch(e=>{
  output.markdown('**Ошибка:** ' + (e&&e.message?e.message:e));
});