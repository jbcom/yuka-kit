import { describe, expect, it } from 'vitest';
import {
    AlignmentBehavior,
    ArriveBehavior,
    CohesionBehavior,
    GameEntity,
    ObstacleAvoidanceBehavior,
    SeekBehavior,
    SeparationBehavior,
    Vehicle,
} from 'yuka';
import {
    ALIGNMENT_WEIGHT,
    addBaseBehaviors,
    addFlockingBehaviors,
    clearDirectionalBehaviors,
    COHESION_WEIGHT,
    OBSTACLE_AVOIDANCE_WEIGHT,
    SEPARATION_WEIGHT,
} from './behaviors.js';

describe('addBaseBehaviors', () => {
    it('adds separation and obstacle avoidance with default weights', () => {
        const vehicle = new Vehicle();
        const obstacles = [new GameEntity()];
        addBaseBehaviors(vehicle, obstacles);

        const separation = vehicle.steering.behaviors.find(
            (b): b is SeparationBehavior => b instanceof SeparationBehavior,
        );
        const avoidance = vehicle.steering.behaviors.find(
            (b): b is ObstacleAvoidanceBehavior => b instanceof ObstacleAvoidanceBehavior,
        );
        expect(separation?.weight).toBe(SEPARATION_WEIGHT);
        expect(avoidance?.weight).toBe(OBSTACLE_AVOIDANCE_WEIGHT);
        expect(avoidance?.obstacles).toBe(obstacles);
    });

    it('honors custom separation and obstacle avoidance weights', () => {
        const vehicle = new Vehicle();
        addBaseBehaviors(vehicle, [], { separationWeight: 1.2, obstacleAvoidanceWeight: 0.9 });

        const separation = vehicle.steering.behaviors.find(
            (b): b is SeparationBehavior => b instanceof SeparationBehavior,
        );
        const avoidance = vehicle.steering.behaviors.find(
            (b): b is ObstacleAvoidanceBehavior => b instanceof ObstacleAvoidanceBehavior,
        );
        expect(separation?.weight).toBe(1.2);
        expect(avoidance?.weight).toBe(0.9);
    });
});

describe('addFlockingBehaviors', () => {
    it('adds alignment and cohesion with default weights', () => {
        const vehicle = new Vehicle();
        addFlockingBehaviors(vehicle);

        const alignment = vehicle.steering.behaviors.find(
            (b): b is AlignmentBehavior => b instanceof AlignmentBehavior,
        );
        const cohesion = vehicle.steering.behaviors.find(
            (b): b is CohesionBehavior => b instanceof CohesionBehavior,
        );
        expect(alignment?.weight).toBe(ALIGNMENT_WEIGHT);
        expect(cohesion?.weight).toBe(COHESION_WEIGHT);
    });

    it('honors custom alignment and cohesion weights', () => {
        const vehicle = new Vehicle();
        addFlockingBehaviors(vehicle, { alignmentWeight: 0.55, cohesionWeight: 0.65 });

        const alignment = vehicle.steering.behaviors.find(
            (b): b is AlignmentBehavior => b instanceof AlignmentBehavior,
        );
        const cohesion = vehicle.steering.behaviors.find(
            (b): b is CohesionBehavior => b instanceof CohesionBehavior,
        );
        expect(alignment?.weight).toBe(0.55);
        expect(cohesion?.weight).toBe(0.65);
    });
});

describe('clearDirectionalBehaviors', () => {
    it('drops seek/arrive but preserves separation, avoidance, alignment, and cohesion', () => {
        const vehicle = new Vehicle();
        addBaseBehaviors(vehicle, []);
        addFlockingBehaviors(vehicle);
        const seekBehavior = new SeekBehavior();
        vehicle.steering.add(seekBehavior);
        const arriveBehavior = new ArriveBehavior();
        vehicle.steering.add(arriveBehavior);

        expect(vehicle.steering.behaviors).toHaveLength(6);

        clearDirectionalBehaviors(vehicle);

        expect(vehicle.steering.behaviors).toHaveLength(4);
        expect(vehicle.steering.behaviors).not.toContain(seekBehavior);
        expect(vehicle.steering.behaviors).not.toContain(arriveBehavior);
        expect(vehicle.steering.behaviors.some((b) => b instanceof SeparationBehavior)).toBe(true);
        expect(vehicle.steering.behaviors.some((b) => b instanceof ObstacleAvoidanceBehavior)).toBe(true);
        expect(vehicle.steering.behaviors.some((b) => b instanceof AlignmentBehavior)).toBe(true);
        expect(vehicle.steering.behaviors.some((b) => b instanceof CohesionBehavior)).toBe(true);
    });

    it('leaves an already-empty steering manager empty', () => {
        const vehicle = new Vehicle();
        clearDirectionalBehaviors(vehicle);
        expect(vehicle.steering.behaviors).toHaveLength(0);
    });
});
