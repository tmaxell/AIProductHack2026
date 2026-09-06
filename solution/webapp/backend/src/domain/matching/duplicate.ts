import { companyNameKey, emailKey, innKey, phoneKey } from './company-index.js';
import type { Confidence, FactorCode, MatchFactor } from './types.js';

/** Заявка в объёме, нужном для поиска дублей. */
export interface ApplicationSummary {
  readonly id: string;
  readonly applicationId: string;
  readonly companyName: string;
  readonly companyInn: string;
  readonly companyEmail: string;
  readonly companyPhone: string;
  readonly projectName: string;
}

export interface DuplicateMatch {
  readonly candidate: ApplicationSummary;
  readonly confidence: Confidence;
  readonly factors: readonly MatchFactor[];
}

export interface DuplicateOutcome {
  /** Запись, к которой предлагается привязать дубль: наименьший id в группе. */
  readonly canonical: ApplicationSummary;
  readonly confidence: Confidence;
  readonly factors: readonly MatchFactor[];
  readonly groupSize: number;
}

const LABELS: Record<FactorCode | 'project' | 'company', string> = {
  inn: 'ИНН',
  email: 'email',
  phone: 'телефон',
  name: 'название компании',
  city: 'город',
  project: 'название проекта',
  company: 'название компании',
};

export function projectKey(raw: string): string {
  return companyNameKey(raw);
}

export interface ApplicationIndex {
  readonly size: number;
  readonly byProject: ReadonlyMap<string, ApplicationSummary[]>;
}

export function buildApplicationIndex(
  applications: readonly ApplicationSummary[],
): ApplicationIndex {
  const byProject = new Map<string, ApplicationSummary[]>();

  for (const application of applications) {
    const key = projectKey(application.projectName);
    if (key === '') continue;
    const bucket = byProject.get(key);
    if (bucket === undefined) byProject.set(key, [application]);
    else bucket.push(application);
  }

  return { size: applications.length, byProject };
}

export const EMPTY_APPLICATION_INDEX: ApplicationIndex = buildApplicationIndex([]);

function companyFactors(a: ApplicationSummary, b: ApplicationSummary): MatchFactor[] {
  const factors: MatchFactor[] = [];

  const innA = innKey(a.companyInn);
  if (innA !== null && innA === innKey(b.companyInn)) {
    factors.push({ code: 'inn', label: LABELS.inn });
  }

  const nameA = companyNameKey(a.companyName);
  if (nameA !== '' && nameA === companyNameKey(b.companyName)) {
    factors.push({ code: 'name', label: LABELS.company });
  }

  const emailA = emailKey(a.companyEmail);
  if (emailA !== null && emailA === emailKey(b.companyEmail)) {
    factors.push({ code: 'email', label: LABELS.email });
  }

  const phoneA = phoneKey(a.companyPhone);
  if (phoneA !== null && phoneA === phoneKey(b.companyPhone)) {
    factors.push({ code: 'phone', label: LABELS.phone });
  }

  return factors;
}

/**
 * Совпадения одного названия проекта мало: «Внедрение CRM» встречается у разных
 * компаний. Поэтому дубль предлагается только когда к названию проекта
 * добавляется хотя бы один признак компании.
 */
function confidenceOf(codes: ReadonlySet<FactorCode>): Confidence | null {
  if (codes.has('inn')) return 'high';
  if (codes.has('name')) return 'high';
  if (codes.has('email') || codes.has('phone')) return 'medium';
  return null;
}

export function findDuplicate(
  record: ApplicationSummary,
  index: ApplicationIndex,
): DuplicateOutcome | null {
  const key = projectKey(record.projectName);
  if (key === '') return null;

  const bucket = index.byProject.get(key);
  if (bucket === undefined) return null;

  const matches: DuplicateMatch[] = [];
  for (const candidate of bucket) {
    if (candidate.id === record.id) continue;

    const factors = companyFactors(record, candidate);
    const confidence = confidenceOf(new Set(factors.map((factor) => factor.code)));
    if (confidence === null) continue;

    matches.push({
      candidate,
      confidence,
      factors: [{ code: 'name', label: LABELS.project }, ...factors],
    });
  }

  if (matches.length === 0) return null;

  // Канонической считается запись с наименьшим id: выбор детерминирован и
  // повторный запуск даёт тот же результат.
  const sorted = [...matches].sort((a, b) => a.candidate.id.localeCompare(b.candidate.id));
  const first = sorted[0]!;
  if (record.id.localeCompare(first.candidate.id) < 0) return null;

  return {
    canonical: first.candidate,
    confidence: first.confidence,
    factors: first.factors,
    groupSize: matches.length + 1,
  };
}
