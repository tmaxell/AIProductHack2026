import type {
  ChangeAction,
  ChangeSetSummary,
  RecordIssue,
  SourceRecord,
} from './change-set.js';

export type ChangeSetStatus = 'draft' | 'published' | 'superseded' | 'discarded';
export type ActionDecision = 'pending' | 'accepted' | 'rejected';
export type ActionResult = 'pending' | 'applied' | 'skipped' | 'conflict' | 'failed';

export interface VersionedAction extends ChangeAction {
  readonly decision: ActionDecision;
  readonly editedAfter?: string | null;
  readonly result: ActionResult;
  readonly resultMessage?: string;
  readonly executedAt?: string;
}

export interface VersionedChangeSet {
  readonly id: string;
  readonly sequence: number;
  readonly status: ChangeSetStatus;
  readonly sourceFingerprint: string;
  readonly sourceRecords: readonly SourceRecord[];
  readonly publishedRecords?: readonly SourceRecord[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt?: string;
  readonly parentId?: string;
  readonly rollbackOfId?: string;
  readonly actions: readonly VersionedAction[];
  readonly issues: readonly RecordIssue[];
  readonly summary: ChangeSetSummary;
}

export interface ChangeSetEvent {
  readonly id: number;
  readonly changeSetId: string;
  readonly type: string;
  readonly createdAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ActionDecisionUpdate {
  readonly actionId: string;
  readonly decision: ActionDecision;
  readonly editedAfter?: string | null;
}

export interface ActionExecutionResult {
  readonly actionId: string;
  readonly result: ActionResult;
  readonly message?: string;
  readonly executedAt: string;
}

export interface ActionDiff {
  readonly key: string;
  readonly before?: VersionedAction;
  readonly after?: VersionedAction;
}

export interface ChangeSetDiff {
  readonly baseId: string;
  readonly targetId: string;
  readonly added: readonly ActionDiff[];
  readonly removed: readonly ActionDiff[];
  readonly changed: readonly ActionDiff[];
}

export function effectiveAfter(action: VersionedAction): string | null {
  return action.editedAfter !== undefined ? action.editedAfter : action.after;
}

function logicalKey(action: VersionedAction): string {
  return `${action.recordId}\u0000${action.field}\u0000${action.ruleCode}`;
}

function comparable(action: VersionedAction): string {
  return JSON.stringify({
    before: action.before,
    after: effectiveAfter(action),
    decision: action.decision,
    result: action.result,
  });
}

export function compareChangeSets(
  base: VersionedChangeSet,
  target: VersionedChangeSet,
): ChangeSetDiff {
  const before = new Map(base.actions.map((action) => [logicalKey(action), action]));
  const after = new Map(target.actions.map((action) => [logicalKey(action), action]));
  const added: ActionDiff[] = [];
  const removed: ActionDiff[] = [];
  const changed: ActionDiff[] = [];

  for (const [key, action] of after) {
    const previous = before.get(key);
    if (previous === undefined) added.push({ key, after: action });
    else if (comparable(previous) !== comparable(action)) {
      changed.push({ key, before: previous, after: action });
    }
  }
  for (const [key, action] of before) {
    if (!after.has(key)) removed.push({ key, before: action });
  }

  return { baseId: base.id, targetId: target.id, added, removed, changed };
}
