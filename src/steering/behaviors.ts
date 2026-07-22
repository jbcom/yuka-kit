/**
 * Steering-behavior group helpers (from pond-warfare's yuka-behaviors.ts,
 * genericized: weights configurable per call, defaults preserved).
 */
import { AlignmentBehavior, CohesionBehavior, ObstacleAvoidanceBehavior, SeparationBehavior, } from 'yuka';
import type { GameEntity, Vehicle } from 'yuka';
/** Default weight for separation force relative to other steering behaviors. */
export const SEPARATION_WEIGHT = 0.6;
/** Default weight for alignment force during formation movement. */
export const ALIGNMENT_WEIGHT = 0.3;
/** Default weight for cohesion force during formation movement. */
export const COHESION_WEIGHT = 0.4;
/** Default weight for obstacle avoidance. */
export const OBSTACLE_AVOIDANCE_WEIGHT = 0.3;
export interface BaseBehaviorOptions {
    separationWeight?: number;
    obstacleAvoidanceWeight?: number;
}
/** Add standard separation + obstacle avoidance behaviors to a vehicle. */
export function addBaseBehaviors(
    vehicle: Vehicle,
    obstacles: GameEntity[],
    options: BaseBehaviorOptions = {},
): void {
    const separation = new SeparationBehavior();
    separation.weight = options.separationWeight ?? SEPARATION_WEIGHT;
    vehicle.steering.add(separation);
    const obstacleAvoidance = new ObstacleAvoidanceBehavior(obstacles);
    obstacleAvoidance.weight = options.obstacleAvoidanceWeight ?? OBSTACLE_AVOIDANCE_WEIGHT;
    vehicle.steering.add(obstacleAvoidance);
}
export interface FlockingBehaviorOptions {
    alignmentWeight?: number;
    cohesionWeight?: number;
}
/** Add flocking behaviors (alignment + cohesion) to a vehicle. */
export function addFlockingBehaviors(
    vehicle: Vehicle,
    options: FlockingBehaviorOptions = {},
): void {
    const alignment = new AlignmentBehavior();
    alignment.weight = options.alignmentWeight ?? ALIGNMENT_WEIGHT;
    vehicle.steering.add(alignment);
    const cohesion = new CohesionBehavior();
    cohesion.weight = options.cohesionWeight ?? COHESION_WEIGHT;
    vehicle.steering.add(cohesion);
}
/**
 * Clear directional behaviors (seek, arrive, pursuit, flee, wander)
 * from a vehicle while preserving separation, obstacle avoidance,
 * and flocking behaviors.
 */
export function clearDirectionalBehaviors(vehicle: Vehicle): void {
    const keep = [];
    for (const b of vehicle.steering.behaviors) {
        if (b instanceof SeparationBehavior ||
            b instanceof ObstacleAvoidanceBehavior ||
            b instanceof AlignmentBehavior ||
            b instanceof CohesionBehavior) {
            keep.push(b);
        }
    }
    vehicle.steering.clear();
    for (const b of keep) {
        vehicle.steering.add(b);
    }
}
