import {
    applyGoapEffects,
    assertGoapConditions,
    assertGoapWorldState,
    countUnsatisfied,
    goapStateKey,
    isGoapValue,
    type GoapConditions,
    type GoapEffects,
    type GoapWorldState,
} from './worldState.js';

/** A plannable action: pure data plus an optional state-dependent cost. */
export interface GoapAction {
    readonly id: string;
    /** Non-negative cost, or a function of the search state at this step. */
    readonly cost: number | ((state: GoapWorldState) => number);
    /** Lower bound for a function cost (default `0`). Used by the heuristic. */
    readonly minCost?: number;
    readonly preconditions: GoapConditions;
    readonly effects: GoapEffects;
}

export interface GoapPlanFound<Action extends GoapAction = GoapAction> {
    readonly found: true;
    readonly actions: readonly Action[];
    readonly cost: number;
    /** Search nodes expanded. */
    readonly expanded: number;
}

export interface GoapPlanNotFound {
    readonly found: false;
    /** `unreachable`: the search space is exhausted. `expansion-limit`: `maxExpansions` was hit. */
    readonly reason: 'unreachable' | 'expansion-limit';
    readonly expanded: number;
}

export type GoapPlanResult<Action extends GoapAction = GoapAction> =
    | GoapPlanFound<Action>
    | GoapPlanNotFound;

export interface GoapPlanOptions {
    /** Maximum nodes to expand before giving up (default 2048). */
    readonly maxExpansions?: number;
}

export const DEFAULT_GOAP_MAX_EXPANSIONS = 2048;

const isNonNegativeFinite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Throws a TypeError unless `action` is a well-formed `GoapAction`. */
export function validateGoapAction(action: unknown, label = 'GOAP action'): asserts action is GoapAction {
    if (typeof action !== 'object' || action === null) throw new TypeError(`${label} must be an object`);
    const candidate = action as Partial<GoapAction>;
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
        throw new TypeError(`${label}.id must be a non-empty string`);
    }
    const name = `GOAP action ${candidate.id}`;
    if (typeof candidate.cost === 'function') {
        if (candidate.minCost !== undefined && !isNonNegativeFinite(candidate.minCost)) {
            throw new TypeError(`${name} minCost must be a finite non-negative number`);
        }
    } else {
        if (!isNonNegativeFinite(candidate.cost)) {
            throw new TypeError(`${name} cost must be a finite non-negative number or a function`);
        }
        if (candidate.minCost !== undefined) {
            throw new TypeError(`${name} minCost is only meaningful for a function cost`);
        }
    }
    assertGoapConditions(candidate.preconditions, `${name} preconditions`);
    if (typeof candidate.effects !== 'object' || candidate.effects === null || Array.isArray(candidate.effects)) {
        throw new TypeError(`${name} effects must be a plain object`);
    }
    for (const [key, value] of Object.entries(candidate.effects)) {
        if (!isGoapValue(value)) {
            throw new TypeError(`${name} effects.${key} must be a string, boolean, or finite number`);
        }
    }
}

/** UTF-16 code-unit order: locale-independent, so plans never vary by runtime locale. */
export const compareGoapIds = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;

interface SearchNode<Action extends GoapAction> {
    readonly state: GoapWorldState;
    readonly key: string;
    readonly parent: SearchNode<Action> | null;
    readonly action: Action | null;
    readonly g: number;
    readonly f: number;
    readonly seq: number;
}

/** Total order: lowest f, then deepest g (fewer ties to expand), then insertion. */
const before = <A extends GoapAction>(left: SearchNode<A>, right: SearchNode<A>): boolean =>
    left.f !== right.f ? left.f < right.f
        : left.g !== right.g ? left.g > right.g
            : left.seq < right.seq;

class NodeHeap<A extends GoapAction> {
    readonly #items: SearchNode<A>[] = [];

    get size(): number {
        return this.#items.length;
    }

    push(node: SearchNode<A>): void {
        const items = this.#items;
        items.push(node);
        let index = items.length - 1;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (!before(items[index] as SearchNode<A>, items[parent] as SearchNode<A>)) break;
            [items[index], items[parent]] = [items[parent] as SearchNode<A>, items[index] as SearchNode<A>];
            index = parent;
        }
    }

    pop(): SearchNode<A> {
        const items = this.#items;
        const top = items[0] as SearchNode<A>;
        const last = items.pop() as SearchNode<A>;
        if (items.length > 0) {
            items[0] = last;
            let index = 0;
            for (;;) {
                const left = index * 2 + 1;
                const right = left + 1;
                let best = index;
                if (left < items.length && before(items[left] as SearchNode<A>, items[best] as SearchNode<A>)) best = left;
                if (right < items.length && before(items[right] as SearchNode<A>, items[best] as SearchNode<A>)) best = right;
                if (best === index) break;
                [items[index], items[best]] = [items[best] as SearchNode<A>, items[index] as SearchNode<A>];
                index = best;
            }
        }
        return top;
    }
}

function resolveCost(action: GoapAction, state: GoapWorldState): number {
    if (typeof action.cost === 'number') return action.cost;
    const cost = action.cost(state);
    if (!isNonNegativeFinite(cost)) {
        throw new TypeError(`GOAP action ${action.id} cost function returned ${String(cost)}; expected a finite non-negative number`);
    }
    if (cost < (action.minCost ?? 0)) {
        throw new RangeError(`GOAP action ${action.id} cost ${cost} is below its declared minCost ${action.minCost}`);
    }
    return cost;
}

const reconstruct = <A extends GoapAction>(node: SearchNode<A>): A[] => {
    const path: A[] = [];
    for (let current: SearchNode<A> | null = node; current?.action; current = current.parent) {
        path.push(current.action);
    }
    return path.reverse();
};

/**
 * A* over world states. Returns a cheapest action sequence that makes every
 * `goal` condition hold, or an explicit not-found result. Deterministic:
 * actions expand in `id` order, so registration order never changes a plan.
 */
export function planGoap<Action extends GoapAction>(
    start: GoapWorldState,
    goal: GoapConditions,
    actions: readonly Action[],
    options: GoapPlanOptions = {},
): GoapPlanResult<Action> {
    assertGoapWorldState(start, 'GOAP start state');
    assertGoapConditions(goal, 'GOAP goal');
    const maxExpansions = options.maxExpansions ?? DEFAULT_GOAP_MAX_EXPANSIONS;
    if (!Number.isSafeInteger(maxExpansions) || maxExpansions < 1) {
        throw new TypeError('GOAP maxExpansions must be a positive safe integer');
    }
    const seen = new Set<string>();
    actions.forEach((action, index) => {
        validateGoapAction(action, `GOAP actions[${index}]`);
        if (seen.has(action.id)) throw new TypeError(`Duplicate GOAP action id: ${action.id}`);
        seen.add(action.id);
    });
    const ordered = [...actions].sort((left, right) => compareGoapIds(left.id, right.id));

    // Admissible heuristic: every unsatisfied goal condition needs some action
    // that writes its key, one action can fix at most `maxFixes` of them, and
    // each action costs at least `cheapest`.
    const goalKeys = new Set(Object.keys(goal));
    let maxFixes = 0;
    let cheapest = Number.POSITIVE_INFINITY;
    for (const action of ordered) {
        maxFixes = Math.max(maxFixes, Object.keys(action.effects).filter((key) => goalKeys.has(key)).length);
        cheapest = Math.min(cheapest, typeof action.cost === 'number' ? action.cost : action.minCost ?? 0);
    }
    const heuristic = (state: GoapWorldState): number => {
        const unsatisfied = countUnsatisfied(state, goal);
        if (unsatisfied === 0) return 0;
        return Math.ceil(unsatisfied / maxFixes) * cheapest;
    };

    if (countUnsatisfied(start, goal) === 0) return { found: true, actions: [], cost: 0, expanded: 0 };
    if (maxFixes === 0) return { found: false, reason: 'unreachable', expanded: 0 };

    let seq = 0;
    const startKey = goapStateKey(start);
    const open = new NodeHeap<Action>();
    open.push({ state: start, key: startKey, parent: null, action: null, g: 0, f: heuristic(start), seq: seq++ });
    const bestCost = new Map<string, number>([[startKey, 0]]);
    let expanded = 0;

    while (open.size > 0) {
        const node = open.pop();
        if (node.g > (bestCost.get(node.key) as number)) continue; // stale duplicate
        if (countUnsatisfied(node.state, goal) === 0) {
            return { found: true, actions: reconstruct(node), cost: node.g, expanded };
        }
        if (expanded >= maxExpansions) return { found: false, reason: 'expansion-limit', expanded };
        expanded += 1;
        for (const action of ordered) {
            if (countUnsatisfied(node.state, action.preconditions) !== 0) continue;
            const state = applyGoapEffects(node.state, action.effects);
            const key = goapStateKey(state);
            const g = node.g + resolveCost(action, node.state);
            const known = bestCost.get(key);
            if (known !== undefined && known <= g) continue;
            bestCost.set(key, g);
            open.push({ state, key, parent: node, action, g, f: g + heuristic(state), seq: seq++ });
        }
    }
    return { found: false, reason: 'unreachable', expanded };
}
