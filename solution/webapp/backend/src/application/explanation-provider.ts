import type { ExplanationOutput, ExplanationPayload } from '../domain/explanation.js';

export interface ExplanationProvider {
  readonly model: string;
  explain(payload: ExplanationPayload): Promise<ExplanationOutput>;
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
