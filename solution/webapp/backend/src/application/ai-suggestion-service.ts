import {
  ExplanationUnavailableError,
  type ExplanationProvider,
} from './explanation-provider.js';
import { acceptSuggestions, collectAmbiguous } from '../domain/ai-suggestion.js';
import { actionId, type ChangeAction } from '../domain/change-set.js';
import type { SqliteChangeSetStore } from '../infrastructure/change-set-store.js';
import type { VersionedChangeSet } from '../domain/version.js';

const AI_RULE = {
  code: 'ai_ambiguous_value',
  name: 'Спорное значение (AI)',
  reason: 'Разбор опечатки или сокращения по справочнику с помощью AI',
  group: 'Спорные',
} as const;

export interface AiSuggestionOutcome {
  readonly changeSet: VersionedChangeSet;
  readonly requested: number;
  readonly added: number;
  readonly rejected: number;
}

export class ChangeSetAiSuggestionService {
  constructor(
    private readonly store: SqliteChangeSetStore,
    private readonly provider?: ExplanationProvider,
  ) {}

  /** Сколько спорных значений ждёт разбора; вызывается без обращения наружу. */
  pending(changeSetId: string): number {
    return collectAmbiguous(this.store.require(changeSetId)).items.length;
  }

  /**
   * Явное действие пользователя: только здесь данные уходят во внешний сервис.
   * Ответ модели не применяется, а становится обычным предложением со статусом
   * pending — оно попадёт в данные только при публикации версии.
   */
  async suggest(changeSetId: string): Promise<AiSuggestionOutcome> {
    if (this.provider === undefined) throw new ExplanationUnavailableError();

    const changeSet = this.store.require(changeSetId);
    const request = collectAmbiguous(changeSet);
    if (request.items.length === 0) {
      return { changeSet, requested: 0, added: 0, rejected: 0 };
    }

    const suggestions = await this.provider.suggest(request);
    const { accepted, rejected } = acceptSuggestions(request, suggestions);

    const existing = new Set(changeSet.actions.map((action) => action.id));
    const actions: ChangeAction[] = accepted
      .map((suggestion): ChangeAction => ({
        kind: 'ai',
        id: actionId(suggestion.recordId, `${AI_RULE.code}:${suggestion.field}`),
        recordId: suggestion.recordId,
        field: suggestion.field,
        ruleCode: AI_RULE.code,
        ruleName: AI_RULE.name,
        reason: AI_RULE.reason,
        group: AI_RULE.group,
        before: suggestion.before,
        after: suggestion.value,
        confidence: suggestion.confidence,
        evidence: [suggestion.reason],
      }))
      .filter((action) => !existing.has(action.id));

    return {
      changeSet: this.store.appendActions(changeSetId, actions),
      requested: request.items.length,
      added: actions.length,
      rejected,
    };
  }
}
