'use strict';

// Milestone 5 — дедуп и сопоставление со справочниками. Контракт и планка качества —
// solution/plan/milestone-05-match-dedup.md. Блокировка кандидатов вместо O(n^2), маленький
// явный набор весов, средняя зона уверенности — на выбор пользователю (US11), не угадывание.

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js — после сборки (Milestone 11,
// build.js оборачивает КАЖДЫЙ файл в свою IIFE) деструктуризация ниже безопасна: она приватна этому
// файлу и не конфликтует с одноимёнными объявлениями в normalize.js/util.js/других модулях.
let normalizeLib;
let utilLib;
if (typeof require === 'function' && !globalThis.__COPILOT_BUNDLED__) {
  // eslint-disable-next-line global-require
  normalizeLib = require('./normalize');
  // eslint-disable-next-line global-require
  utilLib = require('./helpers');
} else {
  normalizeLib = globalThis.CopilotLib.normalize;
  utilLib = globalThis.CopilotLib.helpers;
}
const { normalizeEmail, normalizeCompanyName, normalizeYoAndCase } = normalizeLib;
const { stringSimilarity, addToBucket, UnionFind } = utilLib;

/** "8650089811.0" (Excel-артефакт) -> "8650089811"; "ИНН 6012447316" -> "6012447316". */
function cleanInn(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/\.0+$/, '');
  s = s.replace(/\D/g, '');
  return s || null;
}

function phoneLast10(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function companyLikeKeys({ inn, email, phone, name, city }) {
  return {
    inn: cleanInn(inn),
    email: normalizeEmail(email).value,
    phone: phoneLast10(phone),
    normalizedName: normalizeYoAndCase(normalizeCompanyName(name).value || name || ''),
    normalizedCity: normalizeYoAndCase(city),
  };
}

/** Заявка как "компания" для company-матчинга и application-application дедупа — одни и те же поля. */
function appCompanyKeys(app) {
  return companyLikeKeys({
    inn: app.company_inn_raw,
    email: app.company_email_raw,
    phone: app.company_phone_raw,
    name: app.normalized_company_name || app.company_name_raw,
    city: app.normalized_city || app.company_city_raw,
  });
}

function referenceCompanyKeys(company, fieldsMap) {
  return companyLikeKeys({
    inn: company[fieldsMap.inn],
    email: company[fieldsMap.email],
    phone: company[fieldsMap.phone],
    name: company[fieldsMap.legalName],
    city: company[fieldsMap.city],
  });
}

/** Строит блокирующие индексы (ИНН/email/телефон/имя+город) поверх любого набора "компанийподобных" записей. */
function buildBlockingIndex(items, keysOfFn) {
  const byInn = new Map();
  const byEmail = new Map();
  const byPhone = new Map();
  const byNameCity = new Map();
  const records = new Map();

  for (const item of items) {
    const keys = keysOfFn(item);
    records.set(item.id, keys);
    if (keys.inn) addToBucket(byInn, keys.inn, item.id);
    if (keys.email) addToBucket(byEmail, keys.email, item.id);
    if (keys.phone) addToBucket(byPhone, keys.phone, item.id);
    if (keys.normalizedName && keys.normalizedCity) {
      addToBucket(byNameCity, `${keys.normalizedName}|${keys.normalizedCity}`, item.id);
    }
  }
  return { byInn, byEmail, byPhone, byNameCity, records };
}

function collectCandidates(index, keys, excludeId) {
  const ids = new Set([
    ...(keys.inn ? index.byInn.get(keys.inn) || [] : []),
    ...(keys.email ? index.byEmail.get(keys.email) || [] : []),
    ...(keys.phone ? index.byPhone.get(keys.phone) || [] : []),
    ...(keys.normalizedName && keys.normalizedCity
      ? index.byNameCity.get(`${keys.normalizedName}|${keys.normalizedCity}`) || [] : []),
  ]);
  if (excludeId) ids.delete(excludeId);
  return ids;
}

function scoreCandidate(appKeys, candidateKeys) {
  const signals = { inn: false, email: false, phone: false, city: false, nameSim: 0 };
  let score = 0;
  if (appKeys.inn && candidateKeys.inn && appKeys.inn === candidateKeys.inn) { score += 0.5; signals.inn = true; }
  if (appKeys.email && candidateKeys.email && appKeys.email === candidateKeys.email) { score += 0.3; signals.email = true; }
  if (appKeys.phone && candidateKeys.phone && appKeys.phone === candidateKeys.phone) { score += 0.3; signals.phone = true; }
  const nameSim = stringSimilarity(appKeys.normalizedName, candidateKeys.normalizedName);
  signals.nameSim = Math.round(nameSim * 100) / 100;
  score += nameSim * 0.3;
  if (appKeys.normalizedCity && candidateKeys.normalizedCity && appKeys.normalizedCity === candidateKeys.normalizedCity) {
    score += 0.1;
    signals.city = true;
  }
  return { score: Math.min(score, 1), signals };
}

// Честный reason (см. solution/docs/TEST-RESULTS.md про баг со статичными причинами в normalize.js) —
// сходство названия упоминаем только если оно реально что-то весит в объяснении: либо заметное
// (>0.3), либо это единственный сработавший сигнал вообще.
function describeSignals(signals) {
  const parts = [];
  if (signals.inn) parts.push('точное совпадение ИНН');
  if (signals.email) parts.push('точное совпадение email');
  if (signals.phone) parts.push('точное совпадение телефона');
  if (signals.city) parts.push('совпадение города');
  if (signals.nameSim > 0.3 || parts.length === 0) parts.push(`сходство названия ${signals.nameSim.toFixed(2)}`);
  return parts.join(' + ');
}

function makeLinkAction(recordId, field, currentValue, candidateId, score, reason, bucket, optionIndex, signals) {
  return {
    recordId,
    table: 'applications',
    field,
    from: currentValue ?? null,
    to: candidateId,
    changed: candidateId !== currentValue,
    confidence: Math.round(score * 100) / 100,
    reason,
    kind: 'link',
    bucket,
    optionIndex,
    signals,
  };
}

/** Раскладывает ранжированных кандидатов по корзинам авто/ручной/не показываем — см. план п.3. */
function buildLinkActions(recordId, field, currentValue, scored, config, describeFn) {
  if (scored.length === 0) return [];
  const best = scored[0];
  if (best.score >= config.thresholds.matchAuto) {
    return [makeLinkAction(recordId, field, currentValue, best.id, best.score, describeFn(best.signals), 'auto', 1, best.signals)];
  }
  if (best.score >= config.thresholds.matchManualLow) {
    const topK = scored.slice(0, config.thresholds.matchTopK || 3);
    return topK.map((c, i) => makeLinkAction(recordId, field, currentValue, c.id, c.score, describeFn(c.signals), 'manual', i + 1, c.signals));
  }
  return [];
}

/** @returns {Array} MatchCandidate[] (kind:"link", field:"company_link") — US9. */
function findCompanyMatches(applications, companies, config, fieldsMap) {
  const index = buildBlockingIndex(companies, (c) => referenceCompanyKeys(c, fieldsMap));
  const actions = [];
  for (const app of applications) {
    if (app.company_link) continue; // уже связано — не перетираем без явного rematch (план п.6)
    const keys = appCompanyKeys(app);
    const candidateIds = collectCandidates(index, keys, null);
    if (candidateIds.size === 0) continue;
    const scored = [...candidateIds]
      .map((id) => ({ id, ...scoreCandidate(keys, index.records.get(id)) }))
      .sort((a, b) => b.score - a.score);
    actions.push(...buildLinkActions(app.id, 'company_link', app.company_link, scored, config, describeSignals));
  }
  return actions;
}

function describeEmployeeSignals(signals) {
  const parts = [];
  if (signals.email) parts.push('точное совпадение email');
  if (signals.phone) parts.push('точное совпадение телефона');
  if (signals.nameSim > 0.3 || parts.length === 0) parts.push(`сходство ФИО ${signals.nameSim.toFixed(2)}`);
  return parts.join(' + ');
}

/**
 * @returns {Array} MatchCandidate[] (kind:"link", field:"employee_link") — US10. Тот же алгоритм
 * (блокировка + явные веса), что и для компаний, а не заглушка — источник имени: preferred_assignee_raw
 * (кого хочет видеть исполнителем сам заказчик) приоритетнее requester_fio_raw (это просто контакт,
 * обычно внешний человек, а не сотрудник — но иногда совпадает, поэтому не отбрасываем).
 */
function findEmployeeMatches(applications, employees, config, fieldsMap) {
  const byEmail = new Map();
  const byPhone = new Map();
  const byFirstChar = new Map();
  const records = new Map();

  for (const e of employees) {
    const email = normalizeEmail(e[fieldsMap.email]).value;
    const phone = phoneLast10(e[fieldsMap.phone]);
    const normalizedFio = normalizeYoAndCase(e[fieldsMap.fio] || '');
    records.set(e.id, { email, phone, normalizedFio });
    if (email) addToBucket(byEmail, email, e.id);
    if (phone) addToBucket(byPhone, phone, e.id);
    if (normalizedFio) addToBucket(byFirstChar, normalizedFio[0], e.id);
  }

  const actions = [];
  for (const app of applications) {
    if (app.employee_link) continue;
    const appEmail = normalizeEmail(app.requester_email_raw).value;
    const appPhone = phoneLast10(app.requester_phone_raw);
    const nameForMatch = normalizeYoAndCase(app.preferred_assignee_raw) || normalizeYoAndCase(app.requester_fio_raw);

    const candidateIds = new Set([
      ...(appEmail ? byEmail.get(appEmail) || [] : []),
      ...(appPhone ? byPhone.get(appPhone) || [] : []),
      ...(nameForMatch ? byFirstChar.get(nameForMatch[0]) || [] : []),
    ]);
    if (candidateIds.size === 0) continue;

    const scored = [...candidateIds].map((id) => {
      const c = records.get(id);
      const signals = { email: false, phone: false, nameSim: 0 };
      let score = 0;
      if (appEmail && c.email && appEmail === c.email) { score += 0.3; signals.email = true; }
      if (appPhone && c.phone && appPhone === c.phone) { score += 0.3; signals.phone = true; }
      const nameSim = stringSimilarity(nameForMatch, c.normalizedFio);
      signals.nameSim = Math.round(nameSim * 100) / 100;
      score += nameSim * 0.6;
      return { id, score: Math.min(score, 1), signals };
    }).sort((a, b) => b.score - a.score);

    actions.push(...buildLinkActions(app.id, 'employee_link', app.employee_link, scored, config, describeEmployeeSignals));
  }
  return actions;
}

/**
 * Скоринг дублей ЗАЯВОК — НЕ то же самое, что "та же компания" (scoreCandidate выше). US8 про
 * "не запускать один и тот же проект несколько раз": одна компания может законно прислать много
 * разных заявок (разные проекты), и если мерить дубли только идентичностью компании, все заявки
 * одного клиента слипаются в одну "группу дублей" — это реальный баг, найденный на полном прогоне
 * (кластер из 16 совершенно разных проектов одной компании). Поэтому здесь доминирует сходство
 * самого содержания заявки (название проекта, заявитель), а совпадение компании — лишь подтверждающий,
 * не самостоятельно достаточный сигнал.
 */
function scoreApplicationDuplicate(appA, appB, companySignals) {
  const signals = {
    sameApplicationId: false, requesterEmail: false, requesterPhone: false, sameCompany: false, projectNameSim: 0,
  };

  if (appA.application_id_raw && appA.application_id_raw === appB.application_id_raw) {
    signals.sameApplicationId = true;
    signals.projectNameSim = 1;
    return { score: 0.95, signals }; // тот же application_id_raw — почти наверняка та же заявка (повторная отправка)
  }

  let score = 0;
  const projectNameSim = stringSimilarity(
    normalizeYoAndCase(appA.project_name_raw),
    normalizeYoAndCase(appB.project_name_raw),
  );
  signals.projectNameSim = Math.round(projectNameSim * 100) / 100;
  score += projectNameSim * 0.55;

  const reqEmailA = normalizeEmail(appA.requester_email_raw).value;
  const reqEmailB = normalizeEmail(appB.requester_email_raw).value;
  if (reqEmailA && reqEmailB && reqEmailA === reqEmailB) { score += 0.2; signals.requesterEmail = true; }

  const reqPhoneA = phoneLast10(appA.requester_phone_raw);
  const reqPhoneB = phoneLast10(appB.requester_phone_raw);
  if (reqPhoneA && reqPhoneB && reqPhoneA === reqPhoneB) { score += 0.15; signals.requesterPhone = true; }

  if (companySignals.inn || companySignals.email || companySignals.phone) {
    score += 0.1;
    signals.sameCompany = true;
  }

  return { score: Math.min(score, 1), signals };
}

function describeDuplicateSignals(signals) {
  if (signals.sameApplicationId) return 'совпадает application_id_raw (повторная отправка той же заявки)';
  const parts = [];
  if (signals.requesterEmail) parts.push('тот же email заявителя');
  if (signals.requesterPhone) parts.push('тот же телефон заявителя');
  if (signals.sameCompany) parts.push('та же компания');
  parts.push(`сходство названия проекта ${signals.projectNameSim.toFixed(2)}`);
  return parts.join(' + ');
}

/**
 * Application-application дедуп (US8): блокировка по идентичности компании (быстрое сужение
 * кандидатов), но скоринг — по содержанию самой заявки (см. scoreApplicationDuplicate), не по
 * идентичности компании. Однозначные пары (score >= matchAuto) кластеризуются транзитивно через
 * union-find (A~B, B~C -> одна группа); неоднозначные — в ручной разбор, без объединения в кластер.
 * @returns {{clusters: string[][], candidates: Array}}
 */
function findApplicationDuplicates(applications, config) {
  const index = buildBlockingIndex(applications, (app) => appCompanyKeys(app));
  const appsById = new Map(applications.map((a) => [a.id, a]));
  const uf = new UnionFind(applications.map((a) => a.id));
  const manualCandidates = [];

  for (const app of applications) {
    // План п.6 — не пересканируем уже разрешённые заявки: duplicate_link стоит у НЕканонических
    // членов группы, duplicate_group_id — у всех членов включая каноническую. Без проверки ВТОРОГО
    // поля каноническая заявка группы пересканировалась бы на каждом прогоне и перестраивала бы
    // ту же группу заново (была реальная идемпотентность-регрессия, найдено тестом на 6800 заявках).
    if (app.duplicate_link || app.duplicate_group_id) continue;
    const keys = index.records.get(app.id);
    const candidateIds = collectCandidates(index, keys, app.id);
    if (candidateIds.size === 0) continue;
    const scored = [...candidateIds]
      .map((id) => {
        const candidateApp = appsById.get(id);
        const { signals: companySignals } = scoreCandidate(keys, index.records.get(id));
        return { id, ...scoreApplicationDuplicate(app, candidateApp, companySignals) };
      })
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best.score >= config.thresholds.matchAuto) {
      uf.union(app.id, best.id);
    } else if (best.score >= config.thresholds.matchManualLow) {
      const topK = scored.slice(0, config.thresholds.matchTopK || 3);
      manualCandidates.push(...topK.map((c, i) => makeLinkAction(
        app.id, 'duplicate_link', app.duplicate_link, c.id, c.score, describeDuplicateSignals(c.signals), 'manual', i + 1, c.signals,
      )));
    }
  }

  const clusters = uf.groups().filter((g) => g.length > 1).map((g) => [...g].sort());

  // Однозначные кластеры пишем сразу двумя полями: duplicate_group_id — всем членам группы,
  // duplicate_link — всем, кроме "канонической" (первой по сортировке) заявки в группе.
  const autoCandidates = [];
  for (const cluster of clusters) {
    const [canonical] = cluster;
    const groupId = `dup-${canonical}`;
    for (const memberId of cluster) {
      const memberApp = appsById.get(memberId);
      const currentGroupId = memberApp ? memberApp.duplicate_group_id ?? null : null;
      autoCandidates.push({
        recordId: memberId, table: 'applications', field: 'duplicate_group_id', from: currentGroupId, to: groupId,
        changed: currentGroupId !== groupId, confidence: 0.9, reason: `часть группы дублей из ${cluster.length} заявок`, kind: 'link', bucket: 'auto', optionIndex: 1,
      });
      if (memberId !== canonical) {
        const currentDuplicateLink = memberApp ? memberApp.duplicate_link ?? null : null;
        autoCandidates.push({
          recordId: memberId, table: 'applications', field: 'duplicate_link', from: currentDuplicateLink, to: canonical,
          changed: currentDuplicateLink !== canonical, confidence: 0.9, reason: `дубль заявки ${canonical} (та же группа)`, kind: 'link', bucket: 'auto', optionIndex: 1,
        });
      }
    }
  }

  return { clusters, candidates: [...autoCandidates, ...manualCandidates] };
}

const matchModule = {
  cleanInn,
  phoneLast10,
  findCompanyMatches,
  findEmployeeMatches,
  findApplicationDuplicates,
};

if (typeof module !== 'undefined') {
  module.exports = matchModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.match = matchModule;
}
