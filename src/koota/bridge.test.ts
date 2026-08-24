import { describe, expect, it } from 'vitest';
import { createWorld, trait } from 'koota';
import { Vehicle } from 'yuka';
import { createCombatVehicle } from '../core/VehicleFactory.js';
import { AIBridge } from './bridge.js';
import { AIMemory, AIState, Intent } from './traits.js';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ x: 0, y: 0, z: 0 });
const Health = trait({ current: 100, max: 100 });

function makeBridge(includeHealth = true) {
    return new AIBridge({
        Position,
        Velocity,
        ...(includeHealth ? { Health } : {}),
    });
}

describe('AIBridge.syncToKoota', () => {
    it('writes the vehicle velocity onto the entity Velocity trait', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity);
        const bridge = makeBridge();
        const vehicle = new Vehicle();
        vehicle.velocity.set(1, 2, 3);

        bridge.syncToKoota(vehicle, entity);
        expect(entity.get(Velocity)).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('writes the resolved FSM state name onto AIState when the entity has it', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity, AIState);
        const bridge = makeBridge();
        const vehicle = createCombatVehicle({ speed: 2 }, { initialState: 'chase' });

        bridge.syncToKoota(vehicle, entity);
        expect(entity.get(AIState)).toEqual({ state: 'chase' });
    });

    it('does not write AIState when the entity lacks the trait', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity);
        const bridge = makeBridge();
        const vehicle = createCombatVehicle({ speed: 2 }, { initialState: 'chase' });

        expect(() => bridge.syncToKoota(vehicle, entity)).not.toThrow();
        expect(entity.has(AIState)).toBe(false);
    });

    it('falls back to "idle" when the vehicle has no attached FSM', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity, AIState);
        const bridge = makeBridge();
        const vehicle = new Vehicle();

        bridge.syncToKoota(vehicle, entity);
        expect(entity.get(AIState)).toEqual({ state: 'idle' });
    });
});

describe('AIBridge.syncFromKoota', () => {
    it('pulls the entity Position into the vehicle position', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity);
        entity.set(Position, { x: 5, y: 0, z: 7 });
        const bridge = makeBridge();
        const vehicle = new Vehicle();

        bridge.syncFromKoota(vehicle, entity);
        expect(vehicle.position).toMatchObject({ x: 5, y: 0, z: 7 });
    });

    it('does nothing to position when the entity has no Position trait set', () => {
        const world = createWorld();
        const entity = world.spawn(Velocity);
        const bridge = new AIBridge({ Position, Velocity });
        const vehicle = new Vehicle();
        vehicle.position.set(9, 9, 9);

        bridge.syncFromKoota(vehicle, entity);
        expect(vehicle.position).toMatchObject({ x: 9, y: 9, z: 9 });
    });

    it('transitions an attached FSM to dead once Health.current reaches 0', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity, Health);
        entity.set(Health, { current: 0, max: 100 });
        const bridge = makeBridge();
        const vehicle = createCombatVehicle({ speed: 2 });

        bridge.syncFromKoota(vehicle, entity);
        expect(vehicle.stateMachine.in('dead')).toBe(true);
    });

    it('does not re-trigger the dead transition once already dead', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity, Health);
        entity.set(Health, { current: 0, max: 100 });
        const bridge = makeBridge();
        const vehicle = createCombatVehicle({ speed: 2 }, { initialState: 'dead' });

        expect(() => bridge.syncFromKoota(vehicle, entity)).not.toThrow();
        expect(vehicle.stateMachine.in('dead')).toBe(true);
    });

    it('does nothing when Health is above zero', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity, Health);
        entity.set(Health, { current: 50, max: 100 });
        const bridge = makeBridge();
        const vehicle = createCombatVehicle({ speed: 2 });

        bridge.syncFromKoota(vehicle, entity);
        expect(vehicle.stateMachine.in('dead')).toBe(false);
    });

    it('skips death handling entirely when no Health trait is configured', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity);
        const bridge = makeBridge(false);
        const vehicle = createCombatVehicle({ speed: 2 });

        expect(() => bridge.syncFromKoota(vehicle, entity)).not.toThrow();
        expect(vehicle.stateMachine.in('dead')).toBe(false);
    });

    it('does nothing to the FSM when the vehicle has none attached', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity, Health);
        entity.set(Health, { current: 0, max: 100 });
        const bridge = makeBridge();
        const vehicle = new Vehicle();

        expect(() => bridge.syncFromKoota(vehicle, entity)).not.toThrow();
    });

    it('honors a custom deadStateId', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity, Health);
        entity.set(Health, { current: 0, max: 100 });
        const bridge = new AIBridge({ Position, Velocity, Health, deadStateId: 'chase' });
        const vehicle = createCombatVehicle({ speed: 2 }, { initialState: 'patrol' });

        bridge.syncFromKoota(vehicle, entity);
        expect(vehicle.stateMachine.in('chase')).toBe(true);
    });
});

describe('AIBridge.setDt', () => {
    it('stores frame dt on the vehicle for FSM states to read', () => {
        const bridge = makeBridge();
        const vehicle = new Vehicle();
        expect(() => bridge.setDt(vehicle, 1 / 30)).not.toThrow();
    });
});

describe('AIBridge.rememberSighting', () => {
    it('records a sighting into AIMemory when the entity has the trait', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity, AIMemory);
        const bridge = makeBridge();

        bridge.rememberSighting(entity, { x: 1, y: 2, z: 3 }, 42);
        expect(entity.get(AIMemory)).toEqual({
            lastSeenX: 1,
            lastSeenY: 2,
            lastSeenZ: 3,
            lastSeenTime: 42,
        });
    });

    it('does nothing when the entity lacks the AIMemory trait', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity);
        const bridge = makeBridge();

        expect(() => bridge.rememberSighting(entity, { x: 1, y: 2, z: 3 }, 42)).not.toThrow();
        expect(entity.has(AIMemory)).toBe(false);
    });
});

describe('AIBridge.writeIntent', () => {
    it('writes the active goal name onto the Intent trait when present', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity, Intent);
        const bridge = makeBridge();

        bridge.writeIntent(entity, 'chase-target');
        expect(entity.get(Intent)).toEqual({ goal: 'chase-target' });
    });

    it('does nothing when the entity lacks the Intent trait', () => {
        const world = createWorld();
        const entity = world.spawn(Position, Velocity);
        const bridge = makeBridge();

        expect(() => bridge.writeIntent(entity, 'chase-target')).not.toThrow();
        expect(entity.has(Intent)).toBe(false);
    });
});
