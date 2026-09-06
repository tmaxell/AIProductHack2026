import {
  cityKey,
  companyNameKey,
  emailKey,
  innKey,
  phoneKey,
  type CompanyIndex,
} from './company-index.js';
import type {
  CompanyMatch,
  CompanyReference,
  Confidence,
  FactorCode,
  MatchFactor,
  MatchOutcome,
} from './types.js';

export interface CompanyQuery {
  readonly name: string | null;
  readonly inn: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly city: string | null;
}

const LABELS: Record<FactorCode, string> = {
  inn: 'ИНН',
  email: 'email',
  phone: 'телефон',
  name: 'название',
  city: 'город',
};

/**
 * Уровень уверенности выводится из состава совпавших признаков:
 *
 * - совпал ИНН — high: в справочнике ИНН уникален;
 * - два и более признака из email, телефона и названия — high;
 * - один контактный признак, email или телефон — medium;
 * - название плюс город — medium;
 * - только название — low.
 *
 * Город сам по себе совпадением не считается: признак слишком слабый и
 * работает только как подтверждающий.
 */
function confidenceOf(codes: ReadonlySet<FactorCode>): Confidence | null {
  if (codes.has('inn')) return 'high';

  const strong = (['email', 'phone', 'name'] as const).filter((code) => codes.has(code)).length;
  if (strong >= 2) return 'high';
  if (codes.has('email') || codes.has('phone')) return 'medium';
  if (codes.has('name')) return codes.has('city') ? 'medium' : 'low';

  return null;
}

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

function collect(index: CompanyIndex, query: CompanyQuery): Set<CompanyReference> {
  const found = new Set<CompanyReference>();
  const add = (bucket: CompanyReference[] | undefined): void => {
    bucket?.forEach((ref) => found.add(ref));
  };

  if (query.inn !== null) add(index.byInn.get(query.inn));
  if (query.email !== null) add(index.byEmail.get(query.email));
  if (query.phone !== null) add(index.byPhone.get(query.phone));
  if (query.name !== null) add(index.byName.get(query.name));

  return found;
}

function factorsFor(reference: CompanyReference, query: CompanyQuery): MatchFactor[] {
  const codes: FactorCode[] = [];

  if (query.inn !== null && innKey(reference.inn) === query.inn) codes.push('inn');
  if (query.email !== null && emailKey(reference.email) === query.email) codes.push('email');
  if (query.phone !== null && phoneKey(reference.phone) === query.phone) codes.push('phone');

  if (query.name !== null) {
    const names = [reference.legalName, reference.shortName, ...reference.aliases];
    if (names.some((name) => companyNameKey(name) === query.name)) codes.push('name');
  }

  if (query.city !== null && cityKey(reference.city) === query.city) codes.push('city');

  return codes.map((code) => ({ code, label: LABELS[code] }));
}

export function toQuery(values: {
  name?: string | null | undefined;
  inn?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  city?: string | null | undefined;
}): CompanyQuery {
  const name = values.name ? companyNameKey(values.name) : '';
  return {
    name: name === '' ? null : name,
    inn: values.inn ? innKey(values.inn) : null,
    email: values.email ? emailKey(values.email) : null,
    phone: values.phone ? phoneKey(values.phone) : null,
    city: values.city ? cityKey(values.city) : null,
  };
}

export function matchCompany(query: CompanyQuery, index: CompanyIndex): MatchOutcome {
  const matches: CompanyMatch[] = [];

  for (const reference of collect(index, query)) {
    const factors = factorsFor(reference, query);
    const confidence = confidenceOf(new Set(factors.map((factor) => factor.code)));
    if (confidence === null) continue;
    matches.push({ reference, confidence, factors });
  }

  if (matches.length === 0) return { kind: 'none' };

  matches.sort(
    (a, b) => RANK[b.confidence] - RANK[a.confidence] || b.factors.length - a.factors.length,
  );

  const best = matches[0]!;
  const rivals = matches.filter(
    (candidate) =>
      candidate.confidence === best.confidence && candidate.factors.length === best.factors.length,
  );

  // Неоднозначность не разрешается автоматически: решение остаётся за человеком.
  if (rivals.length > 1) return { kind: 'ambiguous', candidates: rivals };
  if (!best.reference.active) return { kind: 'inactive', match: best };

  return { kind: 'matched', match: best };
}
