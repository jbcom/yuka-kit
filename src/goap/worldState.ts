/**
 * GOAP world-state vocabulary: flat records of primitive values, conditions
 * (equality or numeric/inequality predicates), and set-only effects.
 */

export type GoapValue = string | number | boolean;

/** A flat snapshot of the facts the planner reasons about. */
export type GoapWorldState = Readonly<Record<string, GoapValue>>;

/** A predicate over one world-state value. */
export type GoapPredicate =
    | { readonly op: 'eq' | 'neq'; readonly value: GoapValue }
    | { readonly op: 'lt' | 'lte' | 'gt' | 'gte'; readonly value: number };

/** A bare value means equality. */
export type GoapCondition = GoapValue | GoapPredicate;

export type GoapConditions = Readonly<Record<string, GoapCondition>>;

/** Effects set values; they never compute from the previous value. */
export type GoapEffects = Readonly<Record<string, GoapValue>>;

const PREDICATE_OPS = new Set(['eq', 'neq', 'lt', 'lte', 'gt', 'gte']);
const NUMERIC_OPS = new Set(['lt', 'lte', 'gt', 'gte']);

export function isGoapValue(value: unknown): value is GoapValue {
    return typeof value === 'string'
        || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

/** Throws a TypeError naming `label` unless `value` is a flat record of GOAP values. */
export function assertGoapWorldState(value: unknown, label: string): asserts value is GoapWorldState {
    if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object`);
    for (const [key, entry] of Object.entries(value)) {
        if (!isGoapValue(entry)) {
            throw new TypeError(`${label}.${key} must be a string, boolean, or finite number`);
        }
    }
}

/** Throws a TypeError naming `label` unless `value` is a valid condition record. */
export function assertGoapConditions(value: unknown, label: string): asserts value is GoapConditions {
    if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object`);
    for (const [key, condition] of Object.entries(value)) {
        if (isGoapValue(condition)) continue;
        if (!isPlainRecord(condition)) {
            throw new TypeError(`${label}.${key} must be a value or a { op, value } predicate`);
        }
        const keys = Object.keys(condition);
        if (keys.length !== 2 || !('op' in condition) || !('value' in condition)) {
            throw new TypeError(`${label}.${key} must have exactly the fields op and value`);
        }
        const { op, value: operand } = condition;
        if (typeof op !== 'string' || !PREDICATE_OPS.has(op)) {
            throw new TypeError(`${label}.${key}.op must be one of eq, neq, lt, lte, gt, gte`);
        }
        if (NUMERIC_OPS.has(op) ? !(typeof operand === 'number' && Number.isFinite(operand)) : !isGoapValue(operand)) {
            throw new TypeError(`${label}.${key}.value is not valid for op ${op}`);
        }
    }
}

/** True when `actual` satisfies `condition`. A missing value fails everything except `neq`. */
export function conditionHolds(actual: GoapValue | undefined, condition: GoapCondition): boolean {
    if (typeof condition !== 'object') return actual === condition;
    switch (condition.op) {
        case 'eq': return actual === condition.value;
        case 'neq': return actual !== condition.value;
        default:
            if (typeof actual !== 'number') return false;
            switch (condition.op) {
                case 'lt': return actual < condition.value;
                case 'lte': return actual <= condition.value;
                case 'gt': return actual > condition.value;
                default: return actual >= condition.value;
            }
    }
}

/** Own-property read, so a key like `toString` or `__proto__` is just missing. */
const ownValue = (state: GoapWorldState, key: string): GoapValue | undefined =>
    Object.hasOwn(state, key) ? state[key] : undefined;

/** True when every condition holds in `state`. */
export function satisfiesGoapConditions(state: GoapWorldState, conditions: GoapConditions): boolean {
    return countUnsatisfied(state, conditions) === 0;
}

/** Number of conditions that do not hold in `state`. */
export function countUnsatisfied(state: GoapWorldState, conditions: GoapConditions): number {
    let unsatisfied = 0;
    for (const [key, condition] of Object.entries(conditions)) {
        if (!conditionHolds(ownValue(state, key), condition)) unsatisfied += 1;
    }
    return unsatisfied;
}

/** A new state with `effects` applied; `state` is not modified. */
export function applyGoapEffects(state: GoapWorldState, effects: GoapEffects): GoapWorldState {
    return { ...state, ...effects };
}

/**
 * Canonical key for closed-set lookups: sorted keys with type-tagged values,
 * so `1`, `'1'` and `true` never collide and effect order never matters.
 */
export function goapStateKey(state: GoapWorldState): string {
    return JSON.stringify(Object.keys(state).sort().map((key) => [key, state[key]]));
}
