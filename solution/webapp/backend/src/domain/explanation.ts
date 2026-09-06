import type { VersionedAction, VersionedChangeSet } from './version.js';

export interface ExplanationOutput {
  readonly summary: string;
  readonly evidence: readonly string[];
  readonly risks: readonly string[];
  readonly openQuestions: readonly string[];
  readonly recommendedActions: readonly string[];
}

export interface DisclosedAction {
  readonly actionRef: string;
  readonly recordRef: string;
  readonly kind: VersionedAction['kind'];
  readonly field: string;
  readonly ruleCode: string;
  readonly ruleName: string;
  readonly reason: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly decision: VersionedAction['decision'];
  readonly result: VersionedAction['result'];
  readonly confidence?: VersionedAction['confidence'];
  readonly evidence?: readonly string[];
}

export interface ExplanationPayload {
  readonly version: {
    readonly sequence: number;
    readonly status: VersionedChangeSet['status'];
    readonly isRollback: boolean;
  };
  readonly actions: readonly DisclosedAction[];
}

export interface ExplanationPreview {
  readonly actionIds: readonly string[];
  readonly fields: readonly string[];
  readonly payload: ExplanationPayload;
}

const EMAIL_FIELD = /email|e-mail/i;
const PHONE_FIELD = /phone|телефон/i;
const PERSON_FIELD = /(^|_)(fio|full_name|person_name|requester_name|employee_name|contact_name)($|_)/i;

function maskEmail(value: string): string {
  const separator = value.lastIndexOf('@');
  if (separator < 1) return '[email скрыт]';
  return `***${value.slice(separator)}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length < 2 ? '[телефон скрыт]' : `***${digits.slice(-2)}`;
}

function maskPerson(value: string): string {
  const initials = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1)}***`)
    .join(' ');
  return initials || '[ФИО скрыто]';
}

export function maskDisclosedValue(field: string, value: string | null): string | null {
  if (value === null) return null;
  if (EMAIL_FIELD.test(field)) return maskEmail(value);
  if (PHONE_FIELD.test(field)) return maskPhone(value);
  if (PERSON_FIELD.test(field)) return maskPerson(value);
  return value;
}

export function buildExplanationPreview(
  changeSet: VersionedChangeSet,
  actionIds: readonly string[],
): ExplanationPreview {
  const selected = new Set(actionIds);
  const recordRefs = new Map<string, string>();
  const actions = changeSet.actions
    .filter((action) => selected.has(action.id))
    .map((action, index): DisclosedAction => {
      let recordRef = recordRefs.get(action.recordId);
      if (recordRef === undefined) {
        recordRef = `record-${recordRefs.size + 1}`;
        recordRefs.set(action.recordId, recordRef);
      }
      return {
        actionRef: `action-${index + 1}`,
        recordRef,
        kind: action.kind,
        field: action.field,
        ruleCode: action.ruleCode,
        ruleName: action.ruleName,
        reason: action.reason,
        before: maskDisclosedValue(action.field, action.before),
        after: maskDisclosedValue(action.field, action.editedAfter ?? action.after),
        decision: action.decision,
        result: action.result,
        ...(action.confidence === undefined ? {} : { confidence: action.confidence }),
        ...(action.evidence === undefined ? {} : { evidence: action.evidence }),
      };
    });
  return {
    actionIds: changeSet.actions.filter((action) => selected.has(action.id)).map((action) => action.id),
    fields: [...new Set(actions.map((action) => action.field))].sort(),
    payload: {
      version: {
        sequence: changeSet.sequence,
        status: changeSet.status,
        isRollback: changeSet.rollbackOfId !== undefined,
      },
      actions,
    },
  };
}

export function isExplanationOutput(value: unknown): value is ExplanationOutput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = ['summary', 'evidence', 'risks', 'openQuestions', 'recommendedActions'];
  if (Object.keys(candidate).some((key) => !keys.includes(key))) return false;
  return typeof candidate.summary === 'string' && keys.slice(1).every((key) =>
    Array.isArray(candidate[key]) && candidate[key].every((entry) => typeof entry === 'string'),
  );
}
