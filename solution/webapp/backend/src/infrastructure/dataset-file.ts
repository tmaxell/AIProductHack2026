import { readFile } from 'node:fs/promises';
import {
  buildApplicationIndex,
  buildCompanyIndex,
  EMPTY_APPLICATION_INDEX,
  EMPTY_INDEX,
  type ApplicationIndex,
  type ApplicationSummary,
  type CompanyIndex,
  type CompanyReference,
} from '../domain/matching/index.js';
import { parseCsvRecords } from './csv.js';

export interface Dataset {
  readonly companies: CompanyIndex;
  readonly applications: ApplicationIndex;
}

export const EMPTY_DATASET: Dataset = {
  companies: EMPTY_INDEX,
  applications: EMPTY_APPLICATION_INDEX,
};

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

function toApplication(row: Record<string, string>): ApplicationSummary {
  return {
    id: row.row_id ?? '',
    applicationId: row.application_id_raw ?? '',
    companyName: row.company_name_raw ?? '',
    companyInn: row.company_inn_raw ?? '',
    companyEmail: row.company_email_raw ?? '',
    companyPhone: row.company_phone_raw ?? '',
    projectName: row.project_name_raw ?? '',
  };
}

/**
 * Справочник компаний и корпус заявок читаются из демонстрационного набора.
 * В продукте источником будет пространство MWS Tables, поэтому загрузка
 * вынесена в инфраструктуру и подменяется целиком, не задевая домен.
 *
 * Дубли ищутся по всей таблице заявок, а не внутри выбранного набора, поэтому
 * корпус нужен целиком независимо от того, что выбрал пользователь.
 */
export async function loadDataset(
  datasetPath: string,
  log: (message: string) => void,
): Promise<Dataset> {
  let text: string;
  try {
    text = await readFile(datasetPath, 'utf8');
  } catch {
    // Отсутствие набора данных не должно ронять сервис: сопоставление и поиск
    // дублей просто не будут предлагаться, а нормализация продолжит работать.
    log(`набор данных недоступен: ${datasetPath}`);
    return EMPTY_DATASET;
  }

  const rows = parseCsvRecords(text);

  const references = rows
    .filter((row) => row.record_type === 'COMPANY_REFERENCE')
    .map(toReference)
    .filter((reference) => reference.id !== '');

  const applications = rows
    .filter((row) => row.record_type === 'APPLICATION')
    .map(toApplication)
    .filter((application) => application.id !== '');

  log(`набор данных загружен: ${references.length} компаний, ${applications.length} заявок`);

  return {
    companies: buildCompanyIndex(references),
    applications: buildApplicationIndex(applications),
  };
}
