import { describe, expect, it } from 'vitest';
import {
    applyGoapEffects,
    conditionHolds,
    goapStateKey,
    planGoap,
    satisfiesGoapConditions,
    type GoapAction,
} from './index.js';

const act = (
    id: string,
    cost: GoapAction['cost'],
    preconditions: GoapAction['preconditions'],
    effects: GoapAction['effects'],
    minCost?: number,
): GoapAction => ({ id, cost, preconditions, effects, ...(minCost === undefined ? {} : { minCost }) });

// A reference scenario: arm up, close in, then finish the enemy by melee or by gun.
const brigand: GoapAction[] = [
    act('pickupAxe', 2, { hasWeapon: false }, { hasWeapon: true }),
    act('approach', 1, { inRange: false }, { inRange: true }),
    act('swing', 1, { hasWeapon: true, inRange: true }, { enemyDead: true }),
    act('shoot', 5, { hasGun: true }, { enemyDead: true }),
];
const brigandStart = { hasWeapon: false, inRange: false, hasGun: false, enemyDead: false };

const ids = (result: ReturnType<typeof planGoap>) => (result.found ? result.actions.map(({ id }) => id) : null);

describe('planGoap', () => {
    it('returns the cheapest plan', () => {
        const result = planGoap(brigandStart, { enemyDead: true }, brigand);
        expect(result.found).toBe(true);
        expect(ids(result)).toEqual(['approach', 'pickupAxe', 'swing']);
        expect(result.found && result.cost).toBe(4);
    });

    it('uses the only viable path', () => {
        const result = planGoap({ ...brigandStart, hasGun: true }, { enemyDead: true }, brigand.filter(({ id }) => id !== 'pickupAxe'));
        expect(ids(result)).toEqual(['shoot']);
    });

    it('returns an empty plan when the start already satisfies the goal', () => {
        expect(planGoap({ enemyDead: true }, { enemyDead: true }, brigand)).toEqual({
            found: true, actions: [], cost: 0, expanded: 0,
        });
    });

    it('stays optimal when one action fixes several goal conditions', () => {
        // Regression for the ported heuristic (unsatisfied × cheapest cost),
        // which overestimates here and returned the 2.4-cost x→y→z plan.
        const actions = [
            act('setup', 1, {}, { ready: true }),
            act('combo', 1, { ready: true }, { a: true, b: true, c: true }),
            act('x', 0.8, {}, { a: true }),
            act('y', 0.8, {}, { b: true }),
            act('z', 0.8, {}, { c: true }),
        ];
        const result = planGoap({}, { a: true, b: true, c: true }, actions);
        expect(ids(result)).toEqual(['setup', 'combo']);
        expect(result.found && result.cost).toBe(2);
    });

    it('is deterministic and independent of registration order', () => {
        const expected = planGoap(brigandStart, { enemyDead: true }, brigand);
        const permutations = [
            [...brigand].reverse(),
            [brigand[2], brigand[0], brigand[3], brigand[1]],
            [brigand[1], brigand[3], brigand[2], brigand[0]],
        ] as GoapAction[][];
        for (const permutation of permutations) {
            expect(planGoap(brigandStart, { enemyDead: true }, permutation)).toEqual(expected);
        }
        // Equal-cost alternatives are where registration order would leak in.
        const ties = [act('wait', 1, {}, { done: true }), act('hide', 1, {}, { done: true }), act('flee', 1, {}, { done: true })];
        for (const permutation of [ties, [...ties].reverse(), [ties[1], ties[2], ties[0]]] as GoapAction[][]) {
            expect(ids(planGoap({}, { done: true }, permutation))).toEqual(['flee']);
        }
    });

    it('orders ids by UTF-16 code units, not locale', () => {
        // Equal-cost alternatives: the lowest code-unit id wins the tie.
        const actions = [act('ä', 1, {}, { done: true }), act('a', 1, {}, { done: true }), act('B', 1, {}, { done: true })];
        expect(ids(planGoap({}, { done: true }, actions))).toEqual(['B']);
    });

    it('supports numeric and inequality predicates', () => {
        const actions = [
            act('rest', 2, { mana: { op: 'lt', value: 10 } }, { mana: 10 }),
            act('pulse', 1, { mana: { op: 'gte', value: 10 } }, { intruderScared: true }),
        ];
        expect(ids(planGoap({ mana: 4 }, { intruderScared: true }, actions))).toEqual(['rest', 'pulse']);
        expect(ids(planGoap({ mana: 12 }, { intruderScared: true }, actions))).toEqual(['pulse']);
        expect(ids(planGoap({}, { intruderScared: true }, actions))).toBeNull();
    });

    it('prices state-dependent costs against the search state', () => {
        // Bribing is cheap while the purse is full; the plan that spends the
        // purse first must pay the higher price.
        const actions = [
            act('spend', 1, { purse: 'full' }, { purse: 'empty', supplies: true }),
            act('bribe', (state) => (state.purse === 'full' ? 1 : 10), {}, { guardBribed: true }, 1),
        ];
        const result = planGoap({ purse: 'full' }, { supplies: true, guardBribed: true }, actions);
        expect(ids(result)).toEqual(['bribe', 'spend']);
        expect(result.found && result.cost).toBe(2);
    });

    it('reports unreachable goals explicitly', () => {
        const noWay = [act('wish', 1, { hasWeapon: true }, { enemyDead: true })];
        expect(planGoap(brigandStart, { enemyDead: true }, noWay)).toEqual({
            found: false, reason: 'unreachable', expanded: 1,
        });
        // Nothing writes the goal key: rejected without searching.
        expect(planGoap({}, { flying: true }, brigand)).toEqual({
            found: false, reason: 'unreachable', expanded: 0,
        });
        expect(planGoap({}, { flying: true }, [])).toEqual({ found: false, reason: 'unreachable', expanded: 0 });
    });

    it('reports an exhausted expansion budget separately from unreachability', () => {
        const counter = [act('inc', 1, {}, { done: false }), act('finish', 1, { ready: true }, { done: true })];
        const ladder = Array.from({ length: 8 }, (_, step) =>
            act(`step-${step}`, 1, step === 0 ? {} : { [`s${step - 1}`]: true }, { [`s${step}`]: true }));
        const goalAction = act('goal', 1, { s7: true }, { goal: true });
        const result = planGoap({}, { goal: true }, [...ladder, goalAction], { maxExpansions: 3 });
        expect(result).toEqual({ found: false, reason: 'expansion-limit', expanded: 3 });
        expect(planGoap({}, { goal: true }, [...ladder, goalAction]).found).toBe(true);
        expect(planGoap({}, { done: true }, counter)).toMatchObject({ found: false, reason: 'unreachable' });
    });

    it('rejects malformed input before searching', () => {
        const ok = act('ok', 1, {}, { done: true });
        expect(() => planGoap(null as never, {}, [ok])).toThrow(/start state/);
        expect(() => planGoap({ bad: Number.NaN }, {}, [ok])).toThrow(/start state\.bad/);
        expect(() => planGoap({}, { k: { op: 'gt', value: 'x' } } as never, [ok])).toThrow(/not valid for op gt/);
        expect(() => planGoap({}, { k: { op: 'between', value: 1 } } as never, [ok])).toThrow(/op must be one of/);
        expect(() => planGoap({}, { k: { op: 'eq' } } as never, [ok])).toThrow(/exactly the fields/);
        expect(() => planGoap({}, { k: [1] } as never, [ok])).toThrow(/value or a/);
        expect(() => planGoap({}, {}, [ok, ok])).toThrow(/Duplicate GOAP action id: ok/);
        expect(() => planGoap({}, {}, [act('', 1, {}, {})])).toThrow(/id must be a non-empty string/);
        expect(() => planGoap({}, {}, [null as never])).toThrow(/must be an object/);
        expect(() => planGoap({}, {}, [act('neg', -1, {}, {})])).toThrow(/cost must be a finite non-negative/);
        expect(() => planGoap({}, {}, [act('inf', Number.POSITIVE_INFINITY, {}, {})])).toThrow(/cost/);
        expect(() => planGoap({}, {}, [act('m', 1, {}, {}, 1)])).toThrow(/minCost is only meaningful/);
        expect(() => planGoap({}, {}, [act('fm', () => 1, {}, {}, -1)])).toThrow(/minCost must be/);
        expect(() => planGoap({}, {}, [{ id: 'e', cost: 1, preconditions: {}, effects: null } as never])).toThrow(/effects must be/);
        expect(() => planGoap({}, {}, [act('ev', 1, {}, { v: undefined as never })])).toThrow(/effects\.v/);
        expect(() => planGoap({}, {}, [ok], { maxExpansions: 0 })).toThrow(/maxExpansions/);
        expect(() => planGoap({}, {}, [ok], { maxExpansions: 1.5 })).toThrow(/maxExpansions/);
    });

    it('rejects a dynamic cost that is invalid or below its declared minCost', () => {
        expect(() => planGoap({}, { done: true }, [act('nan', () => Number.NaN, {}, { done: true })])).toThrow(/returned NaN/);
        expect(() => planGoap({}, { done: true }, [act('low', () => 1, {}, { done: true }, 2)])).toThrow(RangeError);
    });
});

describe('world-state helpers', () => {
    it('treats missing and inherited keys as missing', () => {
        expect(conditionHolds(undefined, { op: 'neq', value: 1 })).toBe(true);
        expect(conditionHolds(undefined, 1)).toBe(false);
        expect(conditionHolds(undefined, { op: 'gte', value: 0 })).toBe(false);
        expect(conditionHolds('3', { op: 'lt', value: 5 })).toBe(false);
        expect(satisfiesGoapConditions({}, { toString: { op: 'neq', value: 'x' } })).toBe(true);
        expect(satisfiesGoapConditions({}, { constructor: { op: 'eq', value: 'x' } })).toBe(false);
    });

    it('evaluates every predicate operator', () => {
        expect(conditionHolds(2, { op: 'eq', value: 2 })).toBe(true);
        expect(conditionHolds(2, { op: 'lt', value: 2 })).toBe(false);
        expect(conditionHolds(2, { op: 'lte', value: 2 })).toBe(true);
        expect(conditionHolds(2, { op: 'gt', value: 2 })).toBe(false);
        expect(conditionHolds(2, { op: 'gte', value: 2 })).toBe(true);
    });

    it('keys states canonically with type-tagged values', () => {
        expect(goapStateKey({ a: 1, b: true })).toBe(goapStateKey({ b: true, a: 1 }));
        expect(goapStateKey({ a: 1 })).not.toBe(goapStateKey({ a: '1' }));
        expect(goapStateKey({ a: true })).not.toBe(goapStateKey({ a: 'true' }));
    });

    it('applies effects without mutating the input', () => {
        const state = { a: 1 };
        expect(applyGoapEffects(state, { a: 2, b: 'x' })).toEqual({ a: 2, b: 'x' });
        expect(state).toEqual({ a: 1 });
    });
});
