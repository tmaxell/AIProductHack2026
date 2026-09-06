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

export const EXPLANATION_PROMPT_VERSION = 'change-set-copilot-v2';

/**
 * Набор действий можно задать областью, а не перечислением. На полной выгрузке
 * в Change Set десятки тысяч действий, и список их идентификаторов не проходит
 * ограничение размера тела запроса.
 */
export type ExplanationScope = 'accepted' | 'not-rejected';

export class EmptyExplanationScopeError extends Error {
  constructor(readonly scope: ExplanationScope) {
    super(`В области «${scope}» нет действий для объяснения`);
    this.name = 'EmptyExplanationScopeError';
  }
}

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

  private resolve(
    changeSetId: string,
    selection: { actionIds?: readonly string[]; scope?: ExplanationScope },
  ): { changeSet: ReturnType<SqliteChangeSetStore['require']>; actionIds: readonly string[] } {
    const changeSet = this.store.require(changeSetId);

    if (selection.actionIds !== undefined) {
      const known = new Set(changeSet.actions.map((action) => action.id));
      const unknown = selection.actionIds.filter((actionId) => !known.has(actionId));
      if (unknown.length > 0) throw new UnknownStoredActionsError(unknown);
      return { changeSet, actionIds: selection.actionIds };
    }

    const scope = selection.scope ?? 'not-rejected';
    const actionIds = changeSet.actions
      .filter((action) =>
        scope === 'accepted' ? action.decision === 'accepted' : action.decision !== 'rejected',
      )
      .map((action) => action.id);
    if (actionIds.length === 0) throw new EmptyExplanationScopeError(scope);

    return { changeSet, actionIds };
  }

  preview(
    changeSetId: string,
    selection: { actionIds?: readonly string[]; scope?: ExplanationScope },
    instruction?: string,
  ): ExplanationPreview {
    const { changeSet, actionIds } = this.resolve(changeSetId, selection);
    return buildExplanationPreview(changeSet, actionIds, instruction);
  }

  async explain(
    changeSetId: string,
    selection: { actionIds?: readonly string[]; scope?: ExplanationScope },
    instruction?: string,
  ): Promise<StoredExplanation> {
    if (this.provider === undefined) throw new ExplanationUnavailableError();
    const preview = this.preview(changeSetId, selection, instruction);
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
