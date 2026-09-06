import { normalizeCity, normalizeEmail, normalizeInn, normalizePhone } from '../normalize/index.js';
import type { CompanyReference } from './types.js';

/**
 * Ключ для сравнения названий: снимает ОПФ, кавычки и пунктуацию.
 * «ООО «Северный Трейд»» и «северный трейд» дают один ключ.
 */
export function companyNameKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[«»"'`]/g, ' ')
    .replace(/(^|\s)(ооо|оао|зао|ао|пао|ип|нко|ано)(\s|$)/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function key(normalized: { value: string | null }): string | null {
  return normalized.value !== null && normalized.value !== '' ? normalized.value : null;
}

export const innKey = (raw: string): string | null => key(normalizeInn(raw));
export const emailKey = (raw: string): string | null => key(normalizeEmail(raw));
export const phoneKey = (raw: string): string | null => key(normalizePhone(raw));
export const cityKey = (raw: string): string | null => {
  const city = key(normalizeCity(raw));
  return city === null ? null : city.toLowerCase();
};

export interface CompanyIndex {
  readonly size: number;
  readonly byInn: ReadonlyMap<string, CompanyReference[]>;
  readonly byEmail: ReadonlyMap<string, CompanyReference[]>;
  readonly byPhone: ReadonlyMap<string, CompanyReference[]>;
  readonly byName: ReadonlyMap<string, CompanyReference[]>;
}

function push(map: Map<string, CompanyReference[]>, value: string | null, ref: CompanyReference): void {
  if (value === null) return;
  const bucket = map.get(value);
  if (bucket === undefined) map.set(value, [ref]);
  else if (!bucket.includes(ref)) bucket.push(ref);
}

export function buildCompanyIndex(references: readonly CompanyReference[]): CompanyIndex {
  const byInn = new Map<string, CompanyReference[]>();
  const byEmail = new Map<string, CompanyReference[]>();
  const byPhone = new Map<string, CompanyReference[]>();
  const byName = new Map<string, CompanyReference[]>();

  for (const ref of references) {
    push(byInn, innKey(ref.inn), ref);
    push(byEmail, emailKey(ref.email), ref);
    push(byPhone, phoneKey(ref.phone), ref);
    for (const name of [ref.legalName, ref.shortName, ...ref.aliases]) {
      const nameKey = companyNameKey(name);
      if (nameKey !== '') push(byName, nameKey, ref);
    }
  }

  return { size: references.length, byInn, byEmail, byPhone, byName };
}

export const EMPTY_INDEX: CompanyIndex = buildCompanyIndex([]);
