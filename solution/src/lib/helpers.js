'use strict';

// Общие чистые утилиты для match.js/classify.js/preview.js — строковое сходство, токенизация,
// union-find для кластеризации дублей (Milestone 5), сравнение значений для идемпотентности.
// Никакой бизнес-логики здесь нет специально, чтобы не плодить дубли реализации между модулями.

/** Расстояние Левенштейна, O(len(a)*len(b)) — приемлемо для коротких строк (названия/email/ФИО). */
function levenshtein(a, b) {
  const s1 = a || '';
  const s2 = b || '';
  if (s1 === s2) return 0;
  const m = s1.length;
  const n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** 0..1, 1 = идентичны. Простая метрика — планка качества Milestone 5: быстро и просто важнее точности. */
function stringSimilarity(a, b) {
  const s1 = a || '';
  const s2 = b || '';
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(s1, s2) / maxLen;
}

/** Разбивает "React, Тестирование | UX\nJavaScript" на нормализованные токены — данные вперемешку
 * используют запятую/точку с запятой/пайп/перенос строки как разделитель (см. solution/PLAN.md#данные). */
function tokenize(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,|;\n]+/)
    .map((t) => t.trim().toLowerCase().replace(/ё/g, 'е'))
    .filter(Boolean);
}

/** Индекс Жаккара: |A∩B| / |A∪B|, 0 если оба множества пусты. */
function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const v of setA) if (setB.has(v)) intersection += 1;
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

function addToBucket(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

/** Сравнение значений для идемпотентности (null/undefined/'' — эквивалентны, массивы — поэлементно). */
function valuesEqual(a, b) {
  if (a === b) return true;
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return false;
}

/** Union-Find для транзитивной кластеризации дублей (Milestone 5, US8): если A~B и B~C — одна группа. */
class UnionFind {
  constructor(ids) {
    this.parent = new Map(ids.map((id) => [id, id]));
  }

  find(x) {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    this.parent.set(x, root); // path compression
    return root;
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  groups() {
    const byRoot = new Map();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!byRoot.has(root)) byRoot.set(root, []);
      byRoot.get(root).push(id);
    }
    return [...byRoot.values()];
  }
}

const utilModule = {
  levenshtein, stringSimilarity, tokenize, jaccard, addToBucket, valuesEqual, UnionFind,
};

// См. пояснение про CopilotLib-неймспейс в solution/src/lib/schema.js (тот же паттерн везде).
if (typeof module !== 'undefined') {
  module.exports = utilModule;
} else {
  globalThis.CopilotLib = globalThis.CopilotLib || {};
  globalThis.CopilotLib.helpers = utilModule;
}
