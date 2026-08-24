import { describe, expect, it } from 'vitest';
import {
    ArriveBehavior,
    EvadeBehavior,
    FleeBehavior,
    MovingEntity,
    PursuitBehavior,
    SeekBehavior,
    Vector3,
    Vehicle,
    WanderBehavior,
} from 'yuka';
import { arrive, evade, flee, pursuit, seek, wander } from './presets.js';

describe('steering presets', () => {
    it('seek adds a SeekBehavior targeting the given position with default weight', () => {
        const vehicle = new Vehicle();
        const target = new Vector3(1, 0, 2);
        const behavior = seek(vehicle, target);
        expect(behavior).toBeInstanceOf(SeekBehavior);
        expect(behavior.target).toBe(target);
        expect(behavior.weight).toBe(1);
        expect(vehicle.steering.behaviors).toContain(behavior);
    });

    it('seek honors a custom weight', () => {
        const vehicle = new Vehicle();
        const behavior = seek(vehicle, new Vector3(), 2.5);
        expect(behavior.weight).toBe(2.5);
    });

    it('flee adds a FleeBehavior with the given panic distance and weight', () => {
        const vehicle = new Vehicle();
        const target = new Vector3(3, 0, 4);
        const behavior = flee(vehicle, target, 8, 0.5);
        expect(behavior).toBeInstanceOf(FleeBehavior);
        expect(behavior.target).toBe(target);
        expect(behavior.panicDistance).toBe(8);
        expect(behavior.weight).toBe(0.5);
        expect(vehicle.steering.behaviors).toContain(behavior);
    });

    it('flee falls back to default panic distance and weight', () => {
        const vehicle = new Vehicle();
        const behavior = flee(vehicle, new Vector3());
        expect(behavior.panicDistance).toBe(10);
        expect(behavior.weight).toBe(1);
    });

    it('arrive adds an ArriveBehavior with deceleration and tolerance', () => {
        const vehicle = new Vehicle();
        const target = new Vector3(5, 0, 0);
        const behavior = arrive(vehicle, target, 2, 1, 0.8);
        expect(behavior).toBeInstanceOf(ArriveBehavior);
        expect(behavior.target).toBe(target);
        expect(behavior.deceleration).toBe(2);
        expect(behavior.tolerance).toBe(1);
        expect(behavior.weight).toBe(0.8);
        expect(vehicle.steering.behaviors).toContain(behavior);
    });

    it('arrive falls back to default deceleration, tolerance, and weight', () => {
        const vehicle = new Vehicle();
        const behavior = arrive(vehicle, new Vector3());
        expect(behavior.deceleration).toBe(3);
        expect(behavior.tolerance).toBe(0);
        expect(behavior.weight).toBe(1);
    });

    it('pursuit adds a PursuitBehavior targeting a moving evader', () => {
        const vehicle = new Vehicle();
        const evader = new MovingEntity();
        const behavior = pursuit(vehicle, evader, 2, 0.6);
        expect(behavior).toBeInstanceOf(PursuitBehavior);
        expect(behavior.evader).toBe(evader);
        expect(behavior.predictionFactor).toBe(2);
        expect(behavior.weight).toBe(0.6);
        expect(vehicle.steering.behaviors).toContain(behavior);
    });

    it('pursuit falls back to default prediction factor and weight', () => {
        const vehicle = new Vehicle();
        const behavior = pursuit(vehicle, new MovingEntity());
        expect(behavior.predictionFactor).toBe(1);
        expect(behavior.weight).toBe(1);
    });

    it('evade adds an EvadeBehavior fleeing a moving pursuer', () => {
        const vehicle = new Vehicle();
        const pursuer = new MovingEntity();
        const behavior = evade(vehicle, pursuer, 12, 1.5, 0.4);
        expect(behavior).toBeInstanceOf(EvadeBehavior);
        expect(behavior.pursuer).toBe(pursuer);
        expect(behavior.panicDistance).toBe(12);
        expect(behavior.predictionFactor).toBe(1.5);
        expect(behavior.weight).toBe(0.4);
        expect(vehicle.steering.behaviors).toContain(behavior);
    });

    it('evade falls back to default panic distance, prediction factor, and weight', () => {
        const vehicle = new Vehicle();
        const behavior = evade(vehicle, new MovingEntity());
        expect(behavior.panicDistance).toBe(10);
        expect(behavior.predictionFactor).toBe(1);
        expect(behavior.weight).toBe(1);
    });

    it('wander adds a WanderBehavior with the given weight', () => {
        const vehicle = new Vehicle();
        const behavior = wander(vehicle, 0.3);
        expect(behavior).toBeInstanceOf(WanderBehavior);
        expect(behavior.weight).toBe(0.3);
        expect(vehicle.steering.behaviors).toContain(behavior);
    });

    it('wander falls back to default weight', () => {
        const vehicle = new Vehicle();
        const behavior = wander(vehicle);
        expect(behavior.weight).toBe(1);
    });
});
