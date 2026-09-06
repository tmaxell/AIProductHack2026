import type { ChangeAction, ChangeSet, SourceRecord } from './change-set.js';

export type SkipReason = 'already-applied';

export interface SkippedAction {
  readonly actionId: string;
  readonly reason: SkipReason;
}

export interface ApplyOutcome {
  readonly records: readonly SourceRecord[];
  readonly applied: readonly ChangeAction[];
  readonly skipped: readonly SkippedAction[];
}

export class UnknownActionsError extends Error {
  constructor(readonly actionIds: readonly string[]) {
    super(`Действия не входят в набор изменений: ${actionIds.join(', ')}`);
    this.name = 'UnknownActionsError';
  }
}

/**
 * Применяет только выбранные действия. Повторный вызов с тем же набором
 * ничего не меняет: действие, значение которого уже совпадает с целевым,
 * попадает в skipped, а не применяется второй раз.
 */
export function applyActions(
  records: readonly SourceRecord[],
  changeSet: ChangeSet,
  selectedIds: readonly string[],
): ApplyOutcome {
  const byId = new Map(changeSet.actions.map((action) => [action.id, action]));
  const unknown = selectedIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) throw new UnknownActionsError(unknown);

  const perRecord = new Map<string, ChangeAction[]>();
  const applied: ChangeAction[] = [];
  const skipped: SkippedAction[] = [];

  for (const id of new Set(selectedIds)) {
    const action = byId.get(id);
    if (action === undefined) continue;
    const bucket = perRecord.get(action.recordId) ?? [];
    bucket.push(action);
    perRecord.set(action.recordId, bucket);
  }

  const next = records.map((record) => {
    const pending = perRecord.get(record.id);
    if (pending === undefined) return record;

    const values: Record<string, string | null> = { ...record.values };
    for (const action of pending) {
      if (values[action.field] === action.after) {
        skipped.push({ actionId: action.id, reason: 'already-applied' });
        continue;
      }
      values[action.field] = action.after;
      applied.push(action);
    }
    return { id: record.id, values };
  });

  return { records: next, applied, skipped };
}
