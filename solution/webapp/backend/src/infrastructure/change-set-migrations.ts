export interface Migration {
  readonly version: number;
  readonly sql: string;
}

export const CHANGE_SET_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE change_sets (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'superseded', 'discarded')),
        source_fingerprint TEXT NOT NULL,
        source_records_json TEXT NOT NULL,
        published_records_json TEXT,
        issues_json TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        parent_id TEXT REFERENCES change_sets(id),
        rollback_of_id TEXT REFERENCES change_sets(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT
      );

      CREATE TABLE change_set_actions (
        change_set_id TEXT NOT NULL REFERENCES change_sets(id) ON DELETE RESTRICT,
        action_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('normalize', 'match', 'duplicate')),
        record_id TEXT NOT NULL,
        field TEXT NOT NULL,
        rule_code TEXT NOT NULL,
        rule_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        action_group TEXT NOT NULL,
        before_value TEXT,
        after_value TEXT,
        confidence TEXT CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
        evidence_json TEXT,
        decision TEXT NOT NULL DEFAULT 'pending'
          CHECK (decision IN ('pending', 'accepted', 'rejected')),
        edited_after TEXT,
        edited_after_set INTEGER NOT NULL DEFAULT 0 CHECK (edited_after_set IN (0, 1)),
        result TEXT NOT NULL DEFAULT 'pending'
          CHECK (result IN ('pending', 'applied', 'skipped', 'conflict', 'failed')),
        result_message TEXT,
        executed_at TEXT,
        PRIMARY KEY (change_set_id, action_id)
      );

      CREATE TABLE change_set_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        change_set_id TEXT NOT NULL REFERENCES change_sets(id) ON DELETE RESTRICT,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_change_sets_status_created
        ON change_sets(status, created_at DESC);
      CREATE INDEX idx_change_sets_parent ON change_sets(parent_id);
      CREATE INDEX idx_change_set_events_version
        ON change_set_events(change_set_id, id);
      CREATE UNIQUE INDEX idx_active_rollback_draft
        ON change_sets(rollback_of_id)
        WHERE rollback_of_id IS NOT NULL AND status = 'draft';
    `,
  },
];
