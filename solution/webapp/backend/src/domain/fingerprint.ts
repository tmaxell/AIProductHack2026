import { createHash } from 'node:crypto';
import type { SourceRecord } from './change-set.js';

/**
 * Отпечаток исходных данных. Нужен, чтобы применение не выполнялось поверх
 * данных, изменившихся после анализа: план требует блокировать такую операцию
 * конфликтом, а не молча применять устаревший набор изменений.
 */
export function fingerprint(records: readonly SourceRecord[]): string {
  const canonical = records
    .map((record) => {
      const entries = Object.entries(record.values)
        .filter(([, value]) => value !== null && value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));
      return [record.id, entries];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
