import {
  ExplanationProviderError,
  ExplanationUnavailableError,
  type ExplanationProvider,
} from './explanation-provider.js';
import { buildExplanationPreview, type ExplanationPreview } from '../domain/explanation.js';
import {
  UnknownStoredActionsError,
  type SqliteChangeSetStore,
  type StoredExplanation,
} from '../infrastructure/change-set-store.js';

export const EXPLANATION_PROMPT_VERSION = 'change-set-explanation-v1';

export class ChangeSetExplanationService {
  constructor(
    private readonly store: SqliteChangeSetStore,
    private readonly provider?: ExplanationProvider,
  ) {}

  get available(): boolean {
    return this.provider !== undefined;
  }

  get model(): string | undefined {
    return this.provider?.model;
  }

  preview(changeSetId: string, actionIds: readonly string[]): ExplanationPreview {
    const changeSet = this.store.require(changeSetId);
    const known = new Set(changeSet.actions.map((action) => action.id));
    const unknown = actionIds.filter((actionId) => !known.has(actionId));
    if (unknown.length > 0) throw new UnknownStoredActionsError(unknown);
    return buildExplanationPreview(changeSet, actionIds);
  }

  async explain(changeSetId: string, actionIds: readonly string[]): Promise<StoredExplanation> {
    if (this.provider === undefined) throw new ExplanationUnavailableError();
    const preview = this.preview(changeSetId, actionIds);
    const attempt = this.store.createExplanation(
      changeSetId,
      this.provider.model,
      EXPLANATION_PROMPT_VERSION,
      preview,
    );
    try {
      return this.store.completeExplanation(attempt.id, await this.provider.explain(preview.payload));
    } catch (error) {
      if (error instanceof ExplanationProviderError) {
        this.store.failExplanation(attempt.id, error.code, error.message);
        throw error;
      }
      this.store.failExplanation(attempt.id, 'provider_error', 'Не удалось получить AI-объяснение');
      throw new ExplanationProviderError('Не удалось получить AI-объяснение', 'provider_error');
    }
  }

  list(changeSetId: string): StoredExplanation[] {
    return this.store.listExplanations(changeSetId);
  }
}
