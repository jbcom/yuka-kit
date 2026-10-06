import { describe, expect, it } from 'vitest';
import { GameEntity, Goal } from 'yuka';
import { GoapActionRegistry, type GoapActionDefinition } from './index.js';

class Agent extends GameEntity {
    canSwim = false;
}

const define = (
    id: string,
    extra: Partial<GoapActionDefinition<Agent>> = {},
): GoapActionDefinition<Agent> => ({
    id,
    cost: 1,
    preconditions: {},
    effects: { [id]: true },
    createGoal: (owner) => new Goal(owner),
    ...extra,
});

describe('GoapActionRegistry', () => {
    it('registers, lists in id order, and removes through the returned undo', () => {
        const registry = new GoapActionRegistry<Agent>();
        const undoB = registry.register(define('b'));
        registry.register(define('a'));
        expect(registry.list().map(({ id }) => id)).toEqual(['a', 'b']);
        expect(registry.size).toBe(2);
        expect(registry.has('b')).toBe(true);
        expect(registry.get('b')?.id).toBe('b');
        expect(registry.sourceOf('b')).toBe('base');
        undoB();
        expect(registry.has('b')).toBe(false);
        expect(registry.get('b')).toBeUndefined();
        expect(registry.sourceOf('b')).toBeUndefined();
    });

    it('lets equipment contribute and revoke a group of actions', () => {
        const registry = new GoapActionRegistry<Agent>();
        registry.register(define('walk'));
        registry.contribute('item:sun-staff', [define('emit-pulse'), define('blind')]);
        expect(registry.sourceOf('emit-pulse')).toBe('item:sun-staff');
        expect(registry.revoke('item:sun-staff')).toBe(2);
        expect(registry.list().map(({ id }) => id)).toEqual(['walk']);
        expect(registry.revoke('item:sun-staff')).toBe(0);
    });

    it('contributes all or nothing', () => {
        const registry = new GoapActionRegistry<Agent>();
        registry.register(define('walk'));
        expect(() => registry.contribute('item:x', [define('new'), define('walk')])).toThrow(/Duplicate GOAP action id: walk/);
        expect(() => registry.contribute('item:x', [define('dup'), define('dup')])).toThrow(/Duplicate/);
        expect(() => registry.contribute('item:x', [define('ok'), define('bad', { cost: -1 })])).toThrow(/cost/);
        expect(registry.list().map(({ id }) => id)).toEqual(['walk']);
    });

    it('never lets a stale undo remove a re-registered action', () => {
        const registry = new GoapActionRegistry<Agent>();
        const undo = registry.register(define('walk'));
        undo();
        const replacement = define('walk', { cost: 2 });
        registry.register(replacement);
        undo();
        expect(registry.get('walk')).toBe(replacement);
    });

    it('binds an undo to its registration, not to a reused definition object', () => {
        const registry = new GoapActionRegistry<Agent>();
        const pulse = define('emit-pulse');
        const unequipOld = registry.contribute('item:sun-staff', [pulse]);
        registry.revoke('item:sun-staff');
        registry.contribute('item:sun-staff', [pulse]); // re-equipped
        unequipOld(); // delayed cleanup from the earlier equip
        expect(registry.get('emit-pulse')).toBe(pulse);
    });

    it('filters actions by isAvailable for the owner', () => {
        const registry = new GoapActionRegistry<Agent>();
        registry.register(define('swim', { isAvailable: (owner) => owner.canSwim }));
        registry.register(define('walk'));
        const agent = new Agent();
        expect(registry.actionsFor(agent).map(({ id }) => id)).toEqual(['walk']);
        agent.canSwim = true;
        expect(registry.actionsFor(agent).map(({ id }) => id)).toEqual(['swim', 'walk']);
    });

    it('validates definitions and sources', () => {
        const registry = new GoapActionRegistry<Agent>();
        expect(() => registry.register(define('a'), '')).toThrow(/source must be a non-empty string/);
        expect(() => registry.revoke('')).toThrow(/source/);
        expect(() => registry.contribute('s', null as never)).toThrow(/must be an array/);
        expect(() => registry.register(define('a', { createGoal: undefined as never }))).toThrow(/createGoal must be a function/);
        expect(() => registry.register(define('a', { isAvailable: true as never }))).toThrow(/isAvailable must be a function/);
        expect(registry.size).toBe(0);
    });
});
