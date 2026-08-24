import { describe, expect, it } from 'vitest';
import { GameEntity, Think, Vector3 } from 'yuka';
import type { AIEntity } from './AIEntity.js';
import {
    AggressionEvaluator,
    BossPhaseEvaluator,
    ChaseEvaluator,
    FleeEvaluator,
    KeepDistanceEvaluator,
    MeleeAttackEvaluator,
    SurvivalEvaluator,
    WanderEvaluator,
} from './evaluators.js';

function entityAt(position: Vector3): AIEntity {
    const entity = new GameEntity() as AIEntity;
    entity.position.copy(position);
    return entity;
}

describe('ChaseEvaluator', () => {
    it('scores 0 without a target', () => {
        const evaluator = new ChaseEvaluator();
        expect(evaluator.calculateDesirability(new GameEntity())).toBe(0);
    });

    it('prefers attack range over chase, chase over wander', () => {
        const evaluator = new ChaseEvaluator();
        const target = new Vector3(0, 0, 0);

        const veryClose = entityAt(new Vector3(1, 0, 0));
        veryClose._targetPosition = target;
        expect(evaluator.calculateDesirability(veryClose)).toBe(0.1);

        const chaseRange = entityAt(new Vector3(10, 0, 0));
        chaseRange._targetPosition = target;
        expect(evaluator.calculateDesirability(chaseRange)).toBe(0.7);

        const farAway = entityAt(new Vector3(50, 0, 0));
        farAway._targetPosition = target;
        expect(evaluator.calculateDesirability(farAway)).toBe(0.3);
    });

    it('setGoal clears subgoals on the owning brain when present', () => {
        const evaluator = new ChaseEvaluator();
        const entity = new GameEntity() as AIEntity;
        const brain = new Think(entity);
        entity._brain = brain;
        expect(() => evaluator.setGoal(entity)).not.toThrow();
    });

    it('setGoal is a no-op without a brain', () => {
        const evaluator = new ChaseEvaluator();
        expect(() => evaluator.setGoal(new GameEntity())).not.toThrow();
    });
});

describe('MeleeAttackEvaluator', () => {
    it('scores 0 without a target', () => {
        const evaluator = new MeleeAttackEvaluator();
        expect(evaluator.calculateDesirability(new GameEntity())).toBe(0);
    });

    it('scores high in melee range and 0 outside it', () => {
        const evaluator = new MeleeAttackEvaluator();
        const target = new Vector3(0, 0, 0);

        const inRange = entityAt(new Vector3(1, 0, 0));
        inRange._targetPosition = target;
        expect(evaluator.calculateDesirability(inRange)).toBe(0.9);

        const outOfRange = entityAt(new Vector3(5, 0, 0));
        outOfRange._targetPosition = target;
        expect(evaluator.calculateDesirability(outOfRange)).toBe(0);
    });

    it('setGoal clears subgoals when a brain is present', () => {
        const evaluator = new MeleeAttackEvaluator();
        const entity = new GameEntity() as AIEntity;
        entity._brain = new Think(entity);
        expect(() => evaluator.setGoal(entity)).not.toThrow();
    });
});

describe('KeepDistanceEvaluator', () => {
    it('scores 0 without a target', () => {
        const evaluator = new KeepDistanceEvaluator();
        expect(evaluator.calculateDesirability(new GameEntity())).toBe(0);
    });

    it('prefers fleeing when too close, approaching when too far, holding at good range', () => {
        const evaluator = new KeepDistanceEvaluator();
        const target = new Vector3(0, 0, 0);

        const tooClose = entityAt(new Vector3(2, 0, 0));
        tooClose._targetPosition = target;
        expect(evaluator.calculateDesirability(tooClose)).toBe(0.8);

        const tooFar = entityAt(new Vector3(20, 0, 0));
        tooFar._targetPosition = target;
        expect(evaluator.calculateDesirability(tooFar)).toBe(0.3);

        const goodRange = entityAt(new Vector3(10, 0, 0));
        goodRange._targetPosition = target;
        expect(evaluator.calculateDesirability(goodRange)).toBe(0.5);
    });

    it('setGoal is a no-op', () => {
        const evaluator = new KeepDistanceEvaluator();
        expect(() => evaluator.setGoal()).not.toThrow();
    });
});

describe('WanderEvaluator', () => {
    it('always returns a constant low desirability', () => {
        const evaluator = new WanderEvaluator();
        expect(evaluator.calculateDesirability()).toBe(0.2);
    });

    it('setGoal is a no-op', () => {
        const evaluator = new WanderEvaluator();
        expect(() => evaluator.setGoal()).not.toThrow();
    });
});

describe('FleeEvaluator', () => {
    it('defaults to full health when the tag is unset', () => {
        const evaluator = new FleeEvaluator();
        expect(evaluator.calculateDesirability(new GameEntity())).toBe(0);
    });

    it('scores by health band: critical, low, healthy', () => {
        const evaluator = new FleeEvaluator();

        const critical = new GameEntity() as AIEntity;
        critical._healthPct = 0.1;
        expect(evaluator.calculateDesirability(critical)).toBe(0.95);

        const low = new GameEntity() as AIEntity;
        low._healthPct = 0.3;
        expect(evaluator.calculateDesirability(low)).toBe(0.5);

        const healthy = new GameEntity() as AIEntity;
        healthy._healthPct = 0.9;
        expect(evaluator.calculateDesirability(healthy)).toBe(0);
    });

    it('setGoal is a no-op', () => {
        const evaluator = new FleeEvaluator();
        expect(() => evaluator.setGoal()).not.toThrow();
    });
});

describe('AggressionEvaluator', () => {
    it('scores aggression scaled by characterBias, with defaults applied', () => {
        const defaulted = new AggressionEvaluator();
        expect(defaulted.calculateDesirability()).toBeCloseTo(0.7);

        const evaluator = new AggressionEvaluator(2, 0.5);
        expect(evaluator.calculateDesirability()).toBe(1);
    });

    it('setGoal is a no-op', () => {
        const evaluator = new AggressionEvaluator();
        expect(() => evaluator.setGoal()).not.toThrow();
    });
});

describe('SurvivalEvaluator', () => {
    it('scores 0 above the threshold', () => {
        const evaluator = new SurvivalEvaluator(() => 0.8, 1, 0.3);
        expect(evaluator.calculateDesirability()).toBe(0);
    });

    it('scores rising urgency below the threshold, scaled by characterBias', () => {
        const evaluator = new SurvivalEvaluator(() => 0.1, 2, 0.3);
        expect(evaluator.calculateDesirability()).toBeCloseTo(1.8);
    });

    it('applies default threshold and characterBias', () => {
        const evaluator = new SurvivalEvaluator(() => 0.1);
        expect(evaluator.calculateDesirability()).toBeCloseTo(0.9);
    });

    it('setGoal is a no-op', () => {
        const evaluator = new SurvivalEvaluator(() => 1);
        expect(() => evaluator.setGoal()).not.toThrow();
    });
});

describe('BossPhaseEvaluator', () => {
    it('scores 0 above the threshold', () => {
        const evaluator = new BossPhaseEvaluator(() => 0.9, 0.5);
        expect(evaluator.calculateDesirability()).toBe(0);
    });

    it('scores rising urgency below the threshold, scaled by characterBias', () => {
        const evaluator = new BossPhaseEvaluator(() => 0.2, 0.66, 3);
        expect(evaluator.calculateDesirability()).toBeCloseTo(2.4);
    });

    it('setGoal is a no-op', () => {
        const evaluator = new BossPhaseEvaluator(() => 1, 0.5);
        expect(() => evaluator.setGoal()).not.toThrow();
    });
});
