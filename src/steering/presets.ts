/**
 * One-liner steering presets over a Vehicle: create the behavior, set its
 * weight, add it to the vehicle's steering manager, and return it so the
 * caller can later `vehicle.steering.remove(behavior)`.
 */
import { ArriveBehavior, EvadeBehavior, FleeBehavior, PursuitBehavior, SeekBehavior, WanderBehavior, } from 'yuka';
import type { MovingEntity, Vector3, Vehicle } from 'yuka';
/** Seek a (live) target position. */
export function seek(vehicle: Vehicle, target: Vector3, weight = 1): SeekBehavior {
    const behavior = new SeekBehavior(target);
    behavior.weight = weight;
    vehicle.steering.add(behavior);
    return behavior;
}
/** Flee from a (live) target position. */
export function flee(vehicle: Vehicle, target: Vector3, panicDistance = 10, weight = 1): FleeBehavior {
    const behavior = new FleeBehavior(target, panicDistance);
    behavior.weight = weight;
    vehicle.steering.add(behavior);
    return behavior;
}
/** Arrive at a (live) target position with deceleration. */
export function arrive(vehicle: Vehicle, target: Vector3, deceleration = 3, tolerance = 0, weight = 1): ArriveBehavior {
    const behavior = new ArriveBehavior(target, deceleration, tolerance);
    behavior.weight = weight;
    vehicle.steering.add(behavior);
    return behavior;
}
/** Pursue a moving target (predicts its future position). */
export function pursuit(vehicle: Vehicle, evader: MovingEntity, predictionFactor = 1, weight = 1): PursuitBehavior {
    const behavior = new PursuitBehavior(evader, predictionFactor);
    behavior.weight = weight;
    vehicle.steering.add(behavior);
    return behavior;
}
/** Evade a moving pursuer. */
export function evade(vehicle: Vehicle, pursuer: MovingEntity, panicDistance = 10, predictionFactor = 1, weight = 1): EvadeBehavior {
    const behavior = new EvadeBehavior(pursuer, panicDistance, predictionFactor);
    behavior.weight = weight;
    vehicle.steering.add(behavior);
    return behavior;
}
/** Wander randomly. */
export function wander(vehicle: Vehicle, weight = 1): WanderBehavior {
    const behavior = new WanderBehavior();
    behavior.weight = weight;
    vehicle.steering.add(behavior);
    return behavior;
}
