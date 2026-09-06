export * from './types.js';
export { buildCompanyIndex, companyNameKey, EMPTY_INDEX, type CompanyIndex } from './company-index.js';
export { matchCompany, toQuery, type CompanyQuery } from './match-company.js';
export {
  buildApplicationIndex,
  EMPTY_APPLICATION_INDEX,
  findDuplicate,
  projectKey,
  type ApplicationIndex,
  type ApplicationSummary,
  type DuplicateOutcome,
} from './duplicate.js';

import { EMPTY_INDEX, type CompanyIndex } from './company-index.js';
import { EMPTY_APPLICATION_INDEX, type ApplicationIndex } from './duplicate.js';

/** Данные пространства, на фоне которых анализируются выбранные записи. */
export interface ReferenceData {
  readonly companies: CompanyIndex;
  readonly applications: ApplicationIndex;
}

export const EMPTY_REFERENCE_DATA: ReferenceData = {
  companies: EMPTY_INDEX,
  applications: EMPTY_APPLICATION_INDEX,
};
