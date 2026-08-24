import { describe, expect, it, vi } from 'vitest';
import { ArriveBehavior, FleeBehavior, PursuitBehavior, StateMachine, Vehicle, WanderBehavior } from 'yuka';
import type { AIVehicle } from '../../core/types.js';
import { setDt } from '../dt.js';
import { AttackState } from './AttackState.js';
import { ChaseState } from './ChaseState.js';
import { DeadState } from './DeadState.js';
import { FleeState } from './FleeState.js';
import { PatrolState } from './PatrolState.js';

/**
 * Wire a single state onto a fresh vehicle + StateMachine and enter it.
 * States read `owner.stateMachine` for their own transitions (the same
 * contract createFsm() establishes), so it must be attached here too.
 */
function withState<S extends { enter(owner: Vehicle): void }>(state: S) {
    const vehicle = new Vehicle() as AIVehicle;
    const fsm = new StateMachine(vehicle);
    vehicle.stateMachine = fsm;
    fsm.add('under-test', state as never);
    fsm.changeTo('under-test');
    return { vehicle, fsm };
}

describe('PatrolState', () => {
    it('adds a WanderBehavior on enter and removes it on exit', () => {
        const state = new PatrolState();
        const { vehicle } = withState(state);
        expect(vehicle.steering.behaviors.some((b) => b instanceof WanderBehavior)).toBe(true);
        state.exit(vehicle);
        expect(vehicle.steering.behaviors.some((b) => b instanceof WanderBehavior)).toBe(false);
    });

    it('does nothing on execute without a target', () => {
        const state = new PatrolState();
        const { vehicle } = withState(state);
        expect(() => state.execute(vehicle)).not.toThrow();
    });

    it('transitions to chase when the target enters detection range', () => {
        const chaseId = 'chase';
        const target = new Vehicle();
        target.position.set(1, 0, 0);
        const state = new PatrolState({ detectionRange: 5, chaseStateId: chaseId });
        const { vehicle, fsm } = withState(state);
        fsm.add(chaseId, new ChaseState() as never);
        state.setTarget(target);

        state.execute(vehicle);
        expect(fsm.currentState).toBe(fsm.states.get(chaseId));
    });

    it('stays on patrol when the target is outside detection range', () => {
        const target = new Vehicle();
        target.position.set(100, 0, 0);
        const state = new PatrolState({ detectionRange: 5, chaseStateId: 'chase' });
        const { vehicle, fsm } = withState(state);
        fsm.add('chase', new ChaseState() as never);
        state.setTarget(target);

        state.execute(vehicle);
        expect(fsm.currentState).toBe(state);
    });
});

describe('ChaseState', () => {
    it('adds a PursuitBehavior on enter when a target is set, none otherwise', () => {
        const withTarget = new ChaseState();
        withTarget.setTarget(new Vehicle());
        const { vehicle: v1 } = withState(withTarget);
        expect(v1.steering.behaviors.some((b) => b instanceof PursuitBehavior)).toBe(true);

        const withoutTarget = new ChaseState();
        const { vehicle: v2 } = withState(withoutTarget);
        expect(v2.steering.behaviors.some((b) => b instanceof PursuitBehavior)).toBe(false);
    });

    it('removes the PursuitBehavior on exit', () => {
        const state = new ChaseState();
        state.setTarget(new Vehicle());
        const { vehicle } = withState(state);
        state.exit(vehicle);
        expect(vehicle.steering.behaviors.some((b) => b instanceof PursuitBehavior)).toBe(false);
    });

    it('does nothing on execute without a target', () => {
        const state = new ChaseState();
        const { vehicle } = withState(state);
        expect(() => state.execute(vehicle)).not.toThrow();
    });

    it('transitions to attack within attack range', () => {
        const target = new Vehicle();
        target.position.set(1, 0, 0);
        const state = new ChaseState({ attackRange: 2, attackStateId: 'attack', patrolStateId: 'patrol' });
        state.setTarget(target);
        const { vehicle, fsm } = withState(state);
        fsm.add('attack', new AttackState() as never);
        fsm.add('patrol', new PatrolState() as never);

        state.execute(vehicle);
        expect(fsm.currentState).toBe(fsm.states.get('attack'));
    });

    it('transitions back to patrol beyond the lose range', () => {
        const target = new Vehicle();
        target.position.set(1000, 0, 0);
        const state = new ChaseState({ loseRange: 25, attackStateId: 'attack', patrolStateId: 'patrol' });
        state.setTarget(target);
        const { vehicle, fsm } = withState(state);
        fsm.add('attack', new AttackState() as never);
        fsm.add('patrol', new PatrolState() as never);

        state.execute(vehicle);
        expect(fsm.currentState).toBe(fsm.states.get('patrol'));
    });

    it('holds chase between attack range and lose range', () => {
        const target = new Vehicle();
        target.position.set(10, 0, 0);
        const state = new ChaseState({ attackRange: 2, loseRange: 25, attackStateId: 'attack', patrolStateId: 'patrol' });
        state.setTarget(target);
        const { vehicle, fsm } = withState(state);
        fsm.add('attack', new AttackState() as never);
        fsm.add('patrol', new PatrolState() as never);

        state.execute(vehicle);
        expect(fsm.currentState).toBe(state);
    });
});

describe('AttackState', () => {
    it('does nothing on execute without a target', () => {
        const state = new AttackState();
        const { vehicle } = withState(state);
        expect(() => state.execute(vehicle)).not.toThrow();
    });

    it('adds an ArriveBehavior on enter and removes it on exit', () => {
        const state = new AttackState();
        const { vehicle } = withState(state);
        expect(vehicle.steering.behaviors.some((b) => b instanceof ArriveBehavior)).toBe(true);
        state.exit(vehicle);
        expect(vehicle.steering.behaviors.some((b) => b instanceof ArriveBehavior)).toBe(false);
    });

    it('transitions back to chase when the target leaves chase range', () => {
        const target = new Vehicle();
        target.position.set(1000, 0, 0);
        const state = new AttackState({ chaseRange: 4, chaseStateId: 'chase' });
        state.setTarget(target);
        const { vehicle, fsm } = withState(state);
        fsm.add('chase', new ChaseState() as never);

        state.execute(vehicle);
        expect(fsm.currentState).toBe(fsm.states.get('chase'));
    });

    it('fires onAttack once the cooldown elapses and resets it', () => {
        const target = new Vehicle();
        target.position.set(0.1, 0, 0);
        const onAttack = vi.fn();
        const state = new AttackState({ chaseRange: 4, attackCooldown: 1 });
        state.setTarget(target);
        state.onAttack = onAttack;
        const { vehicle, fsm } = withState(state);
        fsm.add('chase', new ChaseState() as never);
        setDt(vehicle, 1 / 60);

        // First execute (cooldownRemaining starts at 0) fires immediately.
        state.execute(vehicle);
        expect(onAttack).toHaveBeenCalledTimes(1);
        expect(onAttack).toHaveBeenCalledWith(vehicle);

        // Immediately after, cooldown is not yet elapsed.
        state.execute(vehicle);
        expect(onAttack).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onAttack is never assigned', () => {
        const target = new Vehicle();
        target.position.set(0, 0, 0);
        const state = new AttackState({ chaseRange: 4 });
        state.setTarget(target);
        const { vehicle } = withState(state);
        setDt(vehicle, 1 / 60);
        expect(() => state.execute(vehicle)).not.toThrow();
    });
});

describe('DeadState', () => {
    it('clears steering, deactivates the owner, and marks itself for cleanup', () => {
        const state = new DeadState();
        expect(state.markedForCleanup).toBe(false);
        const { vehicle } = withState(state);
        expect(vehicle.active).toBe(false);
        expect(state.markedForCleanup).toBe(true);
    });

    it('execute and exit are no-ops', () => {
        const state = new DeadState();
        const { vehicle } = withState(state);
        expect(() => state.execute()).not.toThrow();
        expect(() => state.exit()).not.toThrow();
        expect(vehicle.active).toBe(false);
    });
});

describe('FleeState', () => {
    it('does nothing on execute without a target', () => {
        const state = new FleeState();
        const { vehicle } = withState(state);
        expect(() => state.execute(vehicle)).not.toThrow();
    });

    it('adds a FleeBehavior on enter when a target is set, none otherwise', () => {
        const withTarget = new FleeState();
        const target = new Vehicle();
        target.position.set(5, 0, 0);
        withTarget.setTarget(target);
        const { vehicle: v1 } = withState(withTarget);
        expect(v1.steering.behaviors.some((b) => b instanceof FleeBehavior)).toBe(true);

        const withoutTarget = new FleeState();
        const { vehicle: v2 } = withState(withoutTarget);
        expect(v2.steering.behaviors.some((b) => b instanceof FleeBehavior)).toBe(false);
    });

    it('removes the FleeBehavior on exit', () => {
        const state = new FleeState();
        const target = new Vehicle();
        state.setTarget(target);
        const { vehicle } = withState(state);
        state.exit(vehicle);
        expect(vehicle.steering.behaviors.some((b) => b instanceof FleeBehavior)).toBe(false);
    });

    it('returns to the configured state once beyond the safe range', () => {
        const target = new Vehicle();
        target.position.set(0, 0, 0);
        const state = new FleeState({ safeRange: 10, returnStateId: 'patrol' });
        state.setTarget(target);
        const { vehicle, fsm } = withState(state);
        fsm.add('patrol', new PatrolState() as never);
        vehicle.position.set(1000, 0, 0);

        state.execute(vehicle);
        expect(fsm.currentState).toBe(fsm.states.get('patrol'));
    });

    it('stays fleeing while inside the safe range', () => {
        const target = new Vehicle();
        target.position.set(0, 0, 0);
        const state = new FleeState({ safeRange: 20, returnStateId: 'patrol' });
        state.setTarget(target);
        const { vehicle, fsm } = withState(state);
        fsm.add('patrol', new PatrolState() as never);
        vehicle.position.set(1, 0, 0);

        state.execute(vehicle);
        expect(fsm.currentState).toBe(state);
    });

    it('defaults panicDistance to safeRange when not provided', () => {
        const state = new FleeState({ safeRange: 12 });
        const target = new Vehicle();
        state.setTarget(target);
        const { vehicle } = withState(state);
        const flee = vehicle.steering.behaviors.find((b): b is FleeBehavior => b instanceof FleeBehavior);
        expect(flee?.panicDistance).toBe(12);
    });
});
