import { applyActions } from '../domain/apply.js';
import {
  buildChangeSet,
  type ChangeAction,
  type ChangeSet,
  type RecordIssue,
  type SourceRecord,
} from '../domain/change-set.js';
import { fingerprint } from '../domain/fingerprint.js';
import type { ReferenceData } from '../domain/matching/index.js';
import {
  compareChangeSets,
  effectiveAfter,
  type ActionDecisionUpdate,
  type ActionExecutionResult,
  type ChangeSetDiff,
  type ChangeSetEvent,
  type ChangeSetStatus,
  type VersionedAction,
  type VersionedChangeSet,
} from '../domain/version.js';
import { InvalidChangeSetStateError } from '../infrastructure/change-set-store.js';
import type { SqliteChangeSetStore } from '../infrastructure/change-set-store.js';

export class ChangeSetConflictError extends Error {
  constructor(
    message: string,
    readonly actionIds: readonly string[],
  ) {
    super(message);
    this.name = 'ChangeSetConflictError';
  }
}

export interface PublishOutcome {
  readonly changeSet: VersionedChangeSet;
  readonly records: readonly SourceRecord[];
  readonly idempotent: boolean;
}

export class ChangeSetService {
  constructor(
    private readonly store: SqliteChangeSetStore,
    private readonly references: ReferenceData,
  ) {}

  create(records: readonly SourceRecord[], parentId?: string): VersionedChangeSet {
    return this.store.createDraft(buildChangeSet(records, this.references), records, {
      ...(parentId === undefined ? {} : { parentId }),
    });
  }

  list(status?: ChangeSetStatus): VersionedChangeSet[] {
    return this.store.list(status);
  }

  count(): number {
    return this.store.count();
  }

  get(id: string): VersionedChangeSet {
    return this.store.require(id);
  }

  updateDecisions(
    id: string,
    updates: readonly ActionDecisionUpdate[],
  ): VersionedChangeSet {
    return this.store.updateDecisions(id, updates);
  }

  history(id: string): ChangeSetEvent[] {
    return this.store.history(id);
  }

  diff(id: string, against: string): ChangeSetDiff {
    return compareChangeSets(this.store.require(against), this.store.require(id));
  }

  publish(id: string, records: readonly SourceRecord[]): PublishOutcome {
    const version = this.store.require(id);
    if (version.status === 'published' || version.status === 'superseded') {
      if (version.publishedRecords === undefined) {
        throw new InvalidChangeSetStateError('У опубликованной версии отсутствует результат');
      }
      return { changeSet: version, records: version.publishedRecords, idempotent: true };
    }
    if (version.status !== 'draft') {
      throw new InvalidChangeSetStateError('Опубликовать можно только draft-версию');
    }

    const accepted = version.actions.filter((action) => action.decision === 'accepted');
    if (fingerprint(records) !== version.sourceFingerprint) {
      const actionIds = accepted.map((action) => action.id);
      const message =
        'Исходные данные изменились после анализа. Создайте новую версию и подтвердите изменения заново.';
      this.store.recordConflict(id, actionIds, message);
      throw new ChangeSetConflictError(message, actionIds);
    }

    const rollbackConflicts = version.rollbackOfId === undefined
      ? []
      : accepted.filter((action) => {
          const record = records.find((candidate) => candidate.id === action.recordId);
          const current = record?.values[action.field] ?? null;
          return current !== action.before && current !== effectiveAfter(action);
        });
    if (rollbackConflicts.length > 0) {
      const actionIds = rollbackConflicts.map((action) => action.id);
      const message =
        'Откат заблокирован: одно или несколько значений больше не совпадают с опубликованной версией.';
      this.store.recordConflict(id, actionIds, message);
      throw new ChangeSetConflictError(message, actionIds);
    }

    const executableActions: ChangeAction[] = accepted.map((action) => ({
      kind: action.kind,
      id: action.id,
      recordId: action.recordId,
      field: action.field,
      ruleCode: action.ruleCode,
      ruleName: action.ruleName,
      reason: action.reason,
      group: action.group,
      before: action.before,
      after: effectiveAfter(action),
      ...(action.confidence === undefined ? {} : { confidence: action.confidence }),
      ...(action.evidence === undefined ? {} : { evidence: action.evidence }),
    }));
    const executable: ChangeSet = {
      id: version.id,
      sourceFingerprint: version.sourceFingerprint,
      createdAt: version.createdAt,
      actions: executableActions,
      issues: version.issues,
      summary: version.summary,
    };
    const applied = applyActions(records, executable, executableActions.map((action) => action.id));
    const executedAt = new Date().toISOString();
    const results: ActionExecutionResult[] = [
      ...applied.applied.map((action) => ({
        actionId: action.id,
        result: 'applied' as const,
        executedAt,
      })),
      ...applied.skipped.map((entry) => ({
        actionId: entry.actionId,
        result: 'skipped' as const,
        message: 'Значение уже применено',
        executedAt,
      })),
    ];
    const published = this.store.publish(id, applied.records, results);
    return { changeSet: published, records: applied.records, idempotent: false };
  }

  createRollback(id: string, records: readonly SourceRecord[]): VersionedChangeSet {
    const existing = this.store.findActiveRollback(id);
    if (existing !== undefined) return existing;

    const source = this.store.require(id);
    if (source.status !== 'published' && source.status !== 'superseded') {
      throw new InvalidChangeSetStateError(
        'Rollback можно создать только для опубликованной или superseded-версии',
      );
    }

    const actions: VersionedAction[] = source.actions
      .filter((action) => action.result === 'applied')
      .map((action) => ({
        kind: action.kind,
        id: `${action.id}::rollback::${source.id}`,
        recordId: action.recordId,
        field: action.field,
        ruleCode: `rollback:${action.ruleCode}`,
        ruleName: `Откат: ${action.ruleName}`,
        reason: `Компенсация опубликованной версии #${source.sequence}: ${action.reason}`,
        group: 'Откат',
        before: effectiveAfter(action),
        after: action.before,
        decision: 'pending',
        result: 'pending',
        ...(action.confidence === undefined ? {} : { confidence: action.confidence }),
        ...(action.evidence === undefined ? {} : { evidence: action.evidence }),
      }));

    const issues: RecordIssue[] = actions.flatMap((action) => {
      const record = records.find((candidate) => candidate.id === action.recordId);
      const current = record?.values[action.field] ?? null;
      if (current === action.before || current === action.after) return [];
      return [
        {
          recordId: action.recordId,
          field: action.field,
          code: 'ROLLBACK_VALUE_CHANGED',
          severity: 'warning' as const,
          message: 'Текущее значение отличается от результата исходной публикации',
        },
      ];
    });
    const normalizations = actions.filter((action) => action.kind === 'normalize').length;
    const matches = actions.filter((action) => action.kind === 'match').length;
    const draft: ChangeSet = {
      id: `rollback_${source.id}`,
      sourceFingerprint: fingerprint(records),
      createdAt: new Date().toISOString(),
      actions,
      issues,
      summary: {
        records: records.length,
        actions: actions.length,
        normalizations,
        matches,
        duplicates: actions.filter((action) => action.kind === 'duplicate').length,
        attention: issues.length,
        blocking: 0,
      },
    };
    return this.store.createDraft(draft, records, {
      parentId: source.id,
      rollbackOfId: source.id,
      actions,
      eventType: 'rollback.created',
    });
  }

  discard(id: string): VersionedChangeSet {
    return this.store.discard(id);
  }
}
