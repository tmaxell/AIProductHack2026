import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import type { ChangeSet, SourceRecord } from '../domain/change-set.js';
import type {
  ActionDecisionUpdate,
  ActionExecutionResult,
  ChangeSetEvent,
  ChangeSetStatus,
  VersionedAction,
  VersionedChangeSet,
} from '../domain/version.js';
import { CHANGE_SET_MIGRATIONS } from './change-set-migrations.js';

type SqlRow = Record<string, SQLOutputValue>;

export class StoredChangeSetNotFoundError extends Error {
  constructor(readonly changeSetId: string) {
    super(`Набор изменений ${changeSetId} не найден`);
    this.name = 'StoredChangeSetNotFoundError';
  }
}

export class InvalidChangeSetStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidChangeSetStateError';
  }
}

export class UnknownStoredActionsError extends Error {
  constructor(readonly actionIds: readonly string[]) {
    super(`Действия не входят в сохранённую версию: ${actionIds.join(', ')}`);
    this.name = 'UnknownStoredActionsError';
  }
}

function parseJson<T>(value: SQLOutputValue): T {
  return JSON.parse(String(value)) as T;
}

function optionalString(row: SqlRow, key: string): string | undefined {
  const value = row[key];
  return value === null || value === undefined ? undefined : String(value);
}

function requiredString(row: SqlRow, key: string): string {
  return String(row[key]);
}

export interface CreateDraftOptions {
  readonly parentId?: string;
  readonly rollbackOfId?: string;
  readonly actions?: readonly VersionedAction[];
  readonly eventType?: string;
}

export class SqliteChangeSetStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    const rows = this.db.prepare('SELECT version FROM schema_migrations').all() as SqlRow[];
    const applied = new Set(rows.map((row) => Number(row.version)));
    for (const migration of CHANGE_SET_MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      this.transaction(() => {
        this.db.exec(migration.sql);
        this.db
          .prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(migration.version, new Date().toISOString());
      });
    }
  }

  private transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = run();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  createDraft(
    changeSet: ChangeSet,
    records: readonly SourceRecord[],
    options: CreateDraftOptions = {},
  ): VersionedChangeSet {
    const id = `cs_${randomUUID()}`;
    const actions: readonly VersionedAction[] =
      options.actions ??
      changeSet.actions.map((action) => ({
        ...action,
        decision: 'pending' as const,
        result: 'pending' as const,
      }));
    const eventType = options.eventType ?? 'draft.created';

    this.transaction(() => {
      if (options.parentId !== undefined) this.require(options.parentId);
      if (options.rollbackOfId !== undefined) this.require(options.rollbackOfId);
      this.db
        .prepare(
          `INSERT INTO change_sets(
             id, status, source_fingerprint, source_records_json, issues_json, summary_json,
             parent_id, rollback_of_id, created_at, updated_at
           ) VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          changeSet.sourceFingerprint,
          JSON.stringify(records),
          JSON.stringify(changeSet.issues),
          JSON.stringify(changeSet.summary),
          options.parentId ?? null,
          options.rollbackOfId ?? null,
          changeSet.createdAt,
          changeSet.createdAt,
        );

      const insertAction = this.db.prepare(
        `INSERT INTO change_set_actions(
           change_set_id, action_id, position, kind, record_id, field, rule_code, rule_name,
           reason, action_group, before_value, after_value, confidence, evidence_json,
           decision, edited_after, edited_after_set, result, result_message, executed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      actions.forEach((action, position) => {
        insertAction.run(
          id,
          action.id,
          position,
          action.kind,
          action.recordId,
          action.field,
          action.ruleCode,
          action.ruleName,
          action.reason,
          action.group,
          action.before,
          action.after,
          action.confidence ?? null,
          action.evidence === undefined ? null : JSON.stringify(action.evidence),
          action.decision,
          action.editedAfter ?? null,
          action.editedAfter === undefined ? 0 : 1,
          action.result,
          action.resultMessage ?? null,
          action.executedAt ?? null,
        );
      });
      this.insertEvent(id, eventType, {
        actions: actions.length,
        parentId: options.parentId ?? null,
        rollbackOfId: options.rollbackOfId ?? null,
      });
    });

    return this.require(id);
  }

  list(status?: ChangeSetStatus): VersionedChangeSet[] {
    const rows = (
      status === undefined
        ? this.db.prepare('SELECT id FROM change_sets ORDER BY sequence DESC').all()
        : this.db
            .prepare('SELECT id FROM change_sets WHERE status = ? ORDER BY sequence DESC')
            .all(status)
    ) as SqlRow[];
    return rows.map((row) => this.require(requiredString(row, 'id')));
  }

  get(id: string): VersionedChangeSet | undefined {
    const row = this.db.prepare('SELECT * FROM change_sets WHERE id = ?').get(id) as
      | SqlRow
      | undefined;
    if (row === undefined) return undefined;
    const actionRows = this.db
      .prepare('SELECT * FROM change_set_actions WHERE change_set_id = ? ORDER BY position')
      .all(id) as SqlRow[];
    const actions = actionRows.map((actionRow): VersionedAction => {
      const action: VersionedAction = {
        id: requiredString(actionRow, 'action_id'),
        kind: requiredString(actionRow, 'kind') as VersionedAction['kind'],
        recordId: requiredString(actionRow, 'record_id'),
        field: requiredString(actionRow, 'field'),
        ruleCode: requiredString(actionRow, 'rule_code'),
        ruleName: requiredString(actionRow, 'rule_name'),
        reason: requiredString(actionRow, 'reason'),
        group: requiredString(actionRow, 'action_group'),
        before: optionalString(actionRow, 'before_value') ?? null,
        after: optionalString(actionRow, 'after_value') ?? null,
        decision: requiredString(actionRow, 'decision') as VersionedAction['decision'],
        result: requiredString(actionRow, 'result') as VersionedAction['result'],
      };
      const confidence = optionalString(actionRow, 'confidence');
      const evidence = actionRow.evidence_json;
      const resultMessage = optionalString(actionRow, 'result_message');
      const executedAt = optionalString(actionRow, 'executed_at');
      if (confidence !== undefined) {
        (action as { confidence: VersionedAction['confidence'] }).confidence =
          confidence as VersionedAction['confidence'];
      }
      if (evidence !== null && evidence !== undefined) {
        (action as { evidence: readonly string[] }).evidence = parseJson<readonly string[]>(evidence);
      }
      if (Number(actionRow.edited_after_set) === 1) {
        (action as { editedAfter: string | null }).editedAfter =
          optionalString(actionRow, 'edited_after') ?? null;
      }
      if (resultMessage !== undefined) {
        (action as { resultMessage: string }).resultMessage = resultMessage;
      }
      if (executedAt !== undefined) (action as { executedAt: string }).executedAt = executedAt;
      return action;
    });

    const version: VersionedChangeSet = {
      id: requiredString(row, 'id'),
      sequence: Number(row.sequence),
      status: requiredString(row, 'status') as ChangeSetStatus,
      sourceFingerprint: requiredString(row, 'source_fingerprint'),
      sourceRecords: parseJson<readonly SourceRecord[]>(requiredString(row, 'source_records_json')),
      createdAt: requiredString(row, 'created_at'),
      updatedAt: requiredString(row, 'updated_at'),
      actions,
      issues: parseJson<VersionedChangeSet['issues']>(requiredString(row, 'issues_json')),
      summary: parseJson<VersionedChangeSet['summary']>(requiredString(row, 'summary_json')),
    };
    const publishedRecords = row.published_records_json;
    const parentId = optionalString(row, 'parent_id');
    const rollbackOfId = optionalString(row, 'rollback_of_id');
    const publishedAt = optionalString(row, 'published_at');
    if (publishedRecords !== null && publishedRecords !== undefined) {
      (version as { publishedRecords: readonly SourceRecord[] }).publishedRecords =
        parseJson<readonly SourceRecord[]>(publishedRecords);
    }
    if (parentId !== undefined) (version as { parentId: string }).parentId = parentId;
    if (rollbackOfId !== undefined) {
      (version as { rollbackOfId: string }).rollbackOfId = rollbackOfId;
    }
    if (publishedAt !== undefined) (version as { publishedAt: string }).publishedAt = publishedAt;
    return version;
  }

  require(id: string): VersionedChangeSet {
    const version = this.get(id);
    if (version === undefined) throw new StoredChangeSetNotFoundError(id);
    return version;
  }

  updateDecisions(id: string, updates: readonly ActionDecisionUpdate[]): VersionedChangeSet {
    this.transaction(() => {
      const version = this.require(id);
      if (version.status !== 'draft') {
        throw new InvalidChangeSetStateError('Решения можно изменять только у draft-версии');
      }
      const known = new Set(version.actions.map((action) => action.id));
      const unknown = updates.map((entry) => entry.actionId).filter((actionId) => !known.has(actionId));
      if (unknown.length > 0) throw new UnknownStoredActionsError(unknown);
      const update = this.db.prepare(
        `UPDATE change_set_actions
         SET decision = ?, edited_after = ?, edited_after_set = ?, result = 'pending',
             result_message = NULL, executed_at = NULL
         WHERE change_set_id = ? AND action_id = ?`,
      );
      for (const entry of updates) {
        update.run(
          entry.decision,
          entry.editedAfter ?? null,
          entry.editedAfter === undefined ? 0 : 1,
          id,
          entry.actionId,
        );
      }
      const now = new Date().toISOString();
      this.db.prepare('UPDATE change_sets SET updated_at = ? WHERE id = ?').run(now, id);
      this.insertEvent(id, 'decisions.updated', {
        actions: updates.map((entry) => ({
          actionId: entry.actionId,
          decision: entry.decision,
          editedAfter: entry.editedAfter ?? null,
        })),
      });
    });
    return this.require(id);
  }

  recordConflict(id: string, actionIds: readonly string[], message: string): VersionedChangeSet {
    this.transaction(() => {
      this.requireDraft(id);
      const now = new Date().toISOString();
      const update = this.db.prepare(
        `UPDATE change_set_actions
         SET result = 'conflict', result_message = ?, executed_at = ?
         WHERE change_set_id = ? AND action_id = ?`,
      );
      for (const actionId of actionIds) update.run(message, now, id, actionId);
      this.db.prepare('UPDATE change_sets SET updated_at = ? WHERE id = ?').run(now, id);
      this.insertEvent(id, 'publish.conflict', { actionIds, message });
    });
    return this.require(id);
  }

  publish(
    id: string,
    records: readonly SourceRecord[],
    results: readonly ActionExecutionResult[],
  ): VersionedChangeSet {
    this.transaction(() => {
      this.requireDraft(id);
      const updateResult = this.db.prepare(
        `UPDATE change_set_actions
         SET result = ?, result_message = ?, executed_at = ?
         WHERE change_set_id = ? AND action_id = ?`,
      );
      for (const result of results) {
        updateResult.run(
          result.result,
          result.message ?? null,
          result.executedAt,
          id,
          result.actionId,
        );
      }
      const now = new Date().toISOString();
      const previousPublished = this.db
        .prepare("SELECT id FROM change_sets WHERE status = 'published' AND id <> ?")
        .all(id) as SqlRow[];
      this.db
        .prepare(
          `UPDATE change_sets SET status = 'superseded', updated_at = ?
           WHERE status = 'published' AND id <> ?`,
        )
        .run(now, id);
      for (const previous of previousPublished) {
        this.insertEvent(requiredString(previous, 'id'), 'superseded', { supersededBy: id });
      }
      this.db
        .prepare(
          `UPDATE change_sets SET status = 'published', published_records_json = ?,
             published_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(JSON.stringify(records), now, now, id);
      this.insertEvent(id, 'published', {
        applied: results.filter((entry) => entry.result === 'applied').length,
        skipped: results.filter((entry) => entry.result === 'skipped').length,
      });
    });
    return this.require(id);
  }

  discard(id: string): VersionedChangeSet {
    this.transaction(() => {
      this.requireDraft(id);
      const now = new Date().toISOString();
      this.db
        .prepare("UPDATE change_sets SET status = 'discarded', updated_at = ? WHERE id = ?")
        .run(now, id);
      this.insertEvent(id, 'discarded', {});
    });
    return this.require(id);
  }

  findActiveRollback(sourceId: string): VersionedChangeSet | undefined {
    const row = this.db
      .prepare(
        "SELECT id FROM change_sets WHERE rollback_of_id = ? AND status = 'draft' ORDER BY sequence DESC LIMIT 1",
      )
      .get(sourceId) as SqlRow | undefined;
    return row === undefined ? undefined : this.require(requiredString(row, 'id'));
  }

  history(id: string): ChangeSetEvent[] {
    this.require(id);
    const rows = this.db
      .prepare('SELECT * FROM change_set_events WHERE change_set_id = ? ORDER BY id')
      .all(id) as SqlRow[];
    return rows.map((row) => ({
      id: Number(row.id),
      changeSetId: requiredString(row, 'change_set_id'),
      type: requiredString(row, 'event_type'),
      createdAt: requiredString(row, 'created_at'),
      payload: parseJson<Readonly<Record<string, unknown>>>(requiredString(row, 'payload_json')),
    }));
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM change_sets').get() as SqlRow;
    return Number(row.count);
  }

  private requireDraft(id: string): VersionedChangeSet {
    const version = this.require(id);
    if (version.status !== 'draft') {
      throw new InvalidChangeSetStateError(`Версия ${id} уже неизменяема (${version.status})`);
    }
    return version;
  }

  private insertEvent(
    changeSetId: string,
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    this.db
      .prepare(
        'INSERT INTO change_set_events(change_set_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(changeSetId, type, JSON.stringify(payload), new Date().toISOString());
  }
}
