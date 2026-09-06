import type { ExplanationOutput, ExplanationPayload } from '../domain/explanation.js';
import type { AiSuggestion, AmbiguousRequest } from '../domain/ai-suggestion.js';

export interface ExplanationProvider {
  readonly model: string;
  explain(payload: ExplanationPayload): Promise<ExplanationOutput>;
  /** Разбор спорных значений: модель выбирает из переданного словаря. */
  suggest(request: AmbiguousRequest): Promise<readonly AiSuggestion[]>;
}

export class ExplanationProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = 'ExplanationProviderError';
  }
}

export class ExplanationUnavailableError extends Error {
  constructor() {
    super('AI-объяснение не настроено: на backend отсутствует GROQ_API_KEY');
    this.name = 'ExplanationUnavailableError';
  }
}
