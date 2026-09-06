import { readFile } from 'node:fs/promises';
import { buildCompanyIndex, EMPTY_INDEX, type CompanyIndex } from '../domain/matching/index.js';
import type { CompanyReference } from '../domain/matching/index.js';
import { parseCsvRecords } from './csv.js';

const RECORD_TYPE = 'COMPANY_REFERENCE';

function toReference(row: Record<string, string>): CompanyReference {
  return {
    id: row.company_ref_id ?? '',
    legalName: row.company_legal_name ?? '',
    shortName: row.company_short_name ?? '',
    inn: row.company_inn ?? '',
    email: row.company_email ?? '',
    phone: row.company_phone ?? '',
    city: row.company_city ?? '',
    aliases: (row.company_aliases ?? '').split('|').map((alias) => alias.trim()).filter(Boolean),
    active: row.company_active === '1',
  };
}

/**
 * Справочник компаний читается из демонстрационного набора данных. В продукте
 * его источником будет пространство MWS Tables, поэтому загрузка вынесена в
 * инфраструктуру и подменяется целиком, не задевая доменную логику.
 */
export async function loadCompanyIndex(
  datasetPath: string,
  log: (message: string) => void,
): Promise<CompanyIndex> {
  let text: string;
  try {
    text = await readFile(datasetPath, 'utf8');
  } catch {
    // Отсутствие набора данных не должно ронять сервис: сопоставление просто
    // не будет предлагаться, а нормализация продолжит работать.
    log(`справочник компаний не загружен: файл ${datasetPath} недоступен`);
    return EMPTY_INDEX;
  }

  const references = parseCsvRecords(text)
    .filter((row) => row.record_type === RECORD_TYPE)
    .map(toReference)
    .filter((reference) => reference.id !== '');

  log(`справочник компаний загружен: ${references.length} записей`);
  return buildCompanyIndex(references);
}
