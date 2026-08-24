import { describe, expect, it, vi } from 'vitest';
import { GameEntity, Vehicle } from 'yuka';
import { createEntityManager, manage, stepAI } from './EntityManager.js';
import { createCombatVehicle, createVehicle } from './VehicleFactory.js';
import type { AIVehicle } from './types.js';

describe('createVehicle', () => {
    it('applies mass and maxForce defaults derived from speed', () => {
        const vehicle = createVehicle({ speed: 5 });
        expect(vehicle.maxSpeed).toBe(5);
        expect(vehicle.mass).toBe(1);
        expect(vehicle.maxForce).toBe(10);
    });

    it('honors explicit mass and maxForce', () => {
        const vehicle = createVehicle({ speed: 5, mass: 2, maxForce: 3 });
        expect(vehicle.mass).toBe(2);
        expect(vehicle.maxForce).toBe(3);
    });
});

describe('createCombatVehicle', () => {
    it('wires the onAttack callback onto the attack state', () => {
        const onAttack = vi.fn();
        const target = new Vehicle();
        target.position.set(0, 0, 0);
        const vehicle = createCombatVehicle(
            { speed: 3 },
            { target, onAttack, initialState: 'attack', attack: { chaseRange: 100 } },
        );
        vehicle.stateMachine.currentState?.execute?.(vehicle);
        expect(onAttack).toHaveBeenCalledWith(vehicle);
    });

    it('supports entering the dead state directly', () => {
        const vehicle = createCombatVehicle({ speed: 3 }, { initialState: 'dead' });
        expect(vehicle.active).toBe(false);
    });

    it('does not throw when neither target nor onAttack are provided', () => {
        expect(() => createCombatVehicle({ speed: 3 })).not.toThrow();
    });
});

describe('createEntityManager / manage', () => {
    it('creates an independent manager per call', () => {
        const a = createEntityManager();
        const b = createEntityManager();
        expect(a).not.toBe(b);
    });

    it('manage adds the entity and returns it for chaining', () => {
        const manager = createEntityManager();
        const entity = new GameEntity();
        expect(manage(manager, entity)).toBe(entity);
        expect(manager.entities).toContain(entity);
    });
});

describe('stepAI', () => {
    it('skips entities without an attached stateMachine', () => {
        const manager = createEntityManager();
        const plainEntity = manage(manager, new GameEntity());
        expect(() => stepAI(manager, 1 / 60)).not.toThrow();
        expect(manager.entities).toContain(plainEntity);
    });

    it('updates dt and steps the FSM for combat vehicles, then ticks brains', () => {
        const manager = createEntityManager();
        const target = new Vehicle();
        target.position.set(0, 0, 0);
        const enemy: AIVehicle = manage(
            manager,
            createCombatVehicle({ speed: 4 }, { target, patrol: { detectionRange: 100 } }),
        );

        const brains = { updateAll: vi.fn() } as unknown as import('../goals/BrainRegistry.js').BrainRegistry;
        stepAI(manager, 1 / 60, brains);

        expect(enemy.stateMachine.currentState).not.toBeNull();
        expect(brains.updateAll).toHaveBeenCalledTimes(1);
    });

    it('runs without a brain registry', () => {
        const manager = createEntityManager();
        expect(() => stepAI(manager, 1 / 60)).not.toThrow();
    });

    it('tolerates a manager whose entities collection is undefined', () => {
        const bareManager = { entities: undefined, update: () => {} } as unknown as ReturnType<typeof createEntityManager>;
        expect(() => stepAI(bareManager, 1 / 60)).not.toThrow();
    });
});
