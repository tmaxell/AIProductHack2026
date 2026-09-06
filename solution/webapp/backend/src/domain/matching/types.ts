export interface CompanyReference {
  readonly id: string;
  readonly legalName: string;
  readonly shortName: string;
  readonly inn: string;
  readonly email: string;
  readonly phone: string;
  readonly city: string;
  readonly aliases: readonly string[];
  readonly active: boolean;
}

export type FactorCode = 'inn' | 'email' | 'phone' | 'name' | 'city';

export interface MatchFactor {
  readonly code: FactorCode;
  readonly label: string;
}

/**
 * Уровень уверенности, а не вероятность. Эталонной разметки у команды нет,
 * поэтому числовой score был бы необоснованным: глоссарий требует
 * калиброванной оценки, а откалибровать её сейчас не на чем.
 * Уровень выводится из состава совпавших признаков и всегда сопровождается
 * их перечнем, чтобы решение оставалось объяснимым.
 */
export type Confidence = 'high' | 'medium' | 'low';

export interface CompanyMatch {
  readonly reference: CompanyReference;
  readonly confidence: Confidence;
  readonly factors: readonly MatchFactor[];
}

export type MatchOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'matched'; readonly match: CompanyMatch }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly CompanyMatch[] }
  | { readonly kind: 'inactive'; readonly match: CompanyMatch };
