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
  readonly instruction?: string;
  readonly coverage?: {
    readonly totalActions: number;
    readonly sampledActions: number;
    readonly byRule: Readonly<Record<string, number>>;
    readonly byDecision: Readonly<Record<string, number>>;
    readonly byResult: Readonly<Record<string, number>>;
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

/** Сколько примеров действий уходит в модель. Агрегат coverage покрывает весь набор. */
export const EXPLANATION_SAMPLE_LIMIT = 40;

/**
 * Примеры выбираются по кругу правил, а не подряд.
 *
 * Прежняя эвристика сортировала по ruleCode и брала первые 20 плюс по одному
 * на каждое следующее правило. На полной выгрузке это давало 20 примеров
 * алфавитно первого правила и по одному на остальные, то есть модель
 * рассуждала о наборе по нерепрезентативной выборке. Заодно от этого страдал
 * disclosure: поле fields перечисляет только те поля, значения которых реально
 * ушли, и недосчитывало правила, не попавшие в выборку.
 *
 * Порядок детерминирован: правила по коду, действия внутри правила по id.
 */
function sampleByRule<T extends { readonly ruleCode: string; readonly id: string }>(
  actions: readonly T[],
  limit: number,
): T[] {
  if (actions.length <= limit) return [...actions];

  const byRule = new Map<string, T[]>();
  for (const action of [...actions].sort((left, right) => left.id.localeCompare(right.id))) {
    const bucket = byRule.get(action.ruleCode);
    if (bucket === undefined) byRule.set(action.ruleCode, [action]);
    else bucket.push(action);
  }

  const buckets = [...byRule.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) => bucket);

  const picked: T[] = [];
  for (let round = 0; picked.length < limit; round += 1) {
    let added = false;
    for (const bucket of buckets) {
      const next = bucket[round];
      if (next === undefined) continue;
      picked.push(next);
      added = true;
      if (picked.length === limit) break;
    }
    if (!added) break;
  }

  return picked;
}

/**
 * Поля, значение которых — идентификатор другой записи пространства. Их нельзя
 * маскировать по шаблону значения: наружу должен уходить тот же псевдоним,
 * которым обозначена сама запись.
 */
const RECORD_REF_FIELDS = new Set(['duplicate_of']);
const COMPANY_REF_FIELDS = new Set(['company_ref_id']);

export function buildExplanationPreview(
  changeSet: VersionedChangeSet,
  actionIds: readonly string[],
  instruction?: string,
): ExplanationPreview {
  const selected = new Set(actionIds);
  const recordRefs = new Map<string, string>();
  const companyRefs = new Map<string, string>();

  const pseudonym = (refs: Map<string, string>, prefix: string, id: string): string => {
    let ref = refs.get(id);
    if (ref === undefined) {
      ref = `${prefix}-${refs.size + 1}`;
      refs.set(id, ref);
    }
    return ref;
  };

  /** Ссылка на запись заменяется псевдонимом, обычное значение маскируется. */
  const disclose = (field: string, value: string | null): string | null => {
    if (value === null || value === '') return maskDisclosedValue(field, value);
    if (RECORD_REF_FIELDS.has(field)) return pseudonym(recordRefs, 'record', value);
    if (COMPANY_REF_FIELDS.has(field)) return pseudonym(companyRefs, 'company', value);
    return maskDisclosedValue(field, value);
  };
  const selectedActions = changeSet.actions.filter((action) => selected.has(action.id));
  const countBy = (key: 'ruleCode' | 'decision' | 'result'): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const action of selectedActions) counts[action[key]] = (counts[action[key]] ?? 0) + 1;
    return counts;
  };
  const actions = sampleByRule(selectedActions, EXPLANATION_SAMPLE_LIMIT)
    .map((action, index): DisclosedAction => {
      return {
        actionRef: `action-${index + 1}`,
        recordRef: pseudonym(recordRefs, 'record', action.recordId),
        kind: action.kind,
        field: action.field,
        ruleCode: action.ruleCode,
        ruleName: action.ruleName,
        reason: action.reason,
        before: disclose(action.field, action.before),
        after: disclose(action.field, action.editedAfter ?? action.after),
        decision: action.decision,
        result: action.result,
        ...(action.confidence === undefined ? {} : { confidence: action.confidence }),
        ...(action.evidence === undefined ? {} : { evidence: action.evidence }),
      };
    });
  return {
    actionIds: selectedActions.map((action) => action.id),
    fields: [...new Set(actions.map((action) => action.field))].sort(),
    payload: {
      version: {
        sequence: changeSet.sequence,
        status: changeSet.status,
        isRollback: changeSet.rollbackOfId !== undefined,
      },
      ...(instruction === undefined || instruction.trim() === ''
        ? {}
        : { instruction: instruction.trim() }),
      coverage: {
        totalActions: selectedActions.length,
        sampledActions: actions.length,
        byRule: countBy('ruleCode'),
        byDecision: countBy('decision'),
        byResult: countBy('result'),
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
