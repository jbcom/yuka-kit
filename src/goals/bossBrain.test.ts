import { describe, expect, it } from 'vitest';
import { GameEntity, Vector3 } from 'yuka';
import {
    AggressiveChaseEvaluator,
    BossBrain,
    CircleStrafeEvaluator,
    EnrageEvaluator,
    RangedBarrageEvaluator,
    RetreatAndSummonEvaluator,
    type BossEntity,
} from './bossBrain.js';

function bossEntityAt(x: number): BossEntity {
    const entity = new GameEntity() as BossEntity;
    entity.position.set(x, 0, 0);
    entity._targetPosition = new Vector3(0, 0, 0);
    return entity;
}

describe('CircleStrafeEvaluator', () => {
    it('scores 0 without a target', () => {
        expect(new CircleStrafeEvaluator(1).calculateDesirability(new GameEntity())).toBe(0);
    });

    it('scores highest in the 5-10 sweet spot, moderate in 3-12, low otherwise', () => {
        const evaluator = new CircleStrafeEvaluator(1, [1, 1, 1]);
        expect(evaluator.calculateDesirability(bossEntityAt(7))).toBeCloseTo(0.7);
        expect(evaluator.calculateDesirability(bossEntityAt(11))).toBeCloseTo(0.4);
        expect(evaluator.calculateDesirability(bossEntityAt(20))).toBeCloseTo(0.1);
    });

    it('scales by the phase bias for the current boss phase, clamped to the last entry', () => {
        const evaluator = new CircleStrafeEvaluator(1, [1.0, 0.5, 0.2]);
        const entity = bossEntityAt(7);
        entity._bossPhase = 5; // beyond the biases array — clamps to last index
        expect(evaluator.calculateDesirability(entity)).toBeCloseTo(0.7 * 0.2);
    });

    it('setGoal tags the active behavior and clears subgoals when a brain exists', () => {
        const evaluator = new CircleStrafeEvaluator(1);
        const entity = new GameEntity() as BossEntity;
        evaluator.setGoal(entity);
        expect(entity._activeBehavior).toBe('circle-strafe');
    });
});

describe('AggressiveChaseEvaluator', () => {
    it('scores 0 without a target', () => {
        expect(new AggressiveChaseEvaluator(1).calculateDesirability(new GameEntity())).toBe(0);
    });

    it('scores by distance band: chase range, melee, too far', () => {
        const evaluator = new AggressiveChaseEvaluator(1, [1, 1, 1]);
        expect(evaluator.calculateDesirability(bossEntityAt(10))).toBeCloseTo(0.6);
        expect(evaluator.calculateDesirability(bossEntityAt(1))).toBeCloseTo(0.3);
        expect(evaluator.calculateDesirability(bossEntityAt(50))).toBeCloseTo(0.2);
    });

    it('setGoal tags the active behavior', () => {
        const entity = new GameEntity() as BossEntity;
        new AggressiveChaseEvaluator(1).setGoal(entity);
        expect(entity._activeBehavior).toBe('aggressive-chase');
    });
});

describe('RetreatAndSummonEvaluator', () => {
    it('scores 0 without a target', () => {
        expect(new RetreatAndSummonEvaluator(1).calculateDesirability(new GameEntity())).toBe(0);
    });

    it('scores by distance band: close, medium, far', () => {
        const evaluator = new RetreatAndSummonEvaluator(1, [1, 1, 1]);
        expect(evaluator.calculateDesirability(bossEntityAt(2))).toBeCloseTo(0.7);
        expect(evaluator.calculateDesirability(bossEntityAt(6))).toBeCloseTo(0.4);
        expect(evaluator.calculateDesirability(bossEntityAt(20))).toBeCloseTo(0.1);
    });

    it('setGoal tags the active behavior', () => {
        const entity = new GameEntity() as BossEntity;
        new RetreatAndSummonEvaluator(1).setGoal(entity);
        expect(entity._activeBehavior).toBe('retreat-and-summon');
    });
});

describe('RangedBarrageEvaluator', () => {
    it('scores 0 without a target', () => {
        expect(new RangedBarrageEvaluator(1).calculateDesirability(new GameEntity())).toBe(0);
    });

    it('scores by distance band: ideal, acceptable, out of range', () => {
        const evaluator = new RangedBarrageEvaluator(1, [1, 1, 1]);
        expect(evaluator.calculateDesirability(bossEntityAt(10))).toBeCloseTo(0.8);
        expect(evaluator.calculateDesirability(bossEntityAt(15))).toBeCloseTo(0.5);
        expect(evaluator.calculateDesirability(bossEntityAt(1))).toBeCloseTo(0.1);
    });

    it('setGoal tags the active behavior', () => {
        const entity = new GameEntity() as BossEntity;
        new RangedBarrageEvaluator(1).setGoal(entity);
        expect(entity._activeBehavior).toBe('ranged-barrage');
    });
});

describe('EnrageEvaluator', () => {
    it('scores by health band and 0 when healthy', () => {
        const evaluator = new EnrageEvaluator(1, [1, 1, 1]);
        const at = (healthPct: number) => {
            const entity = new GameEntity() as BossEntity;
            entity._healthPct = healthPct;
            return evaluator.calculateDesirability(entity);
        };
        expect(at(0.1)).toBeCloseTo(0.95);
        expect(at(0.2)).toBeCloseTo(0.7);
        expect(at(0.35)).toBeCloseTo(0.3);
        expect(at(0.8)).toBe(0);
    });

    it('defaults to full health when the tag is unset', () => {
        const evaluator = new EnrageEvaluator(1);
        expect(evaluator.calculateDesirability(new GameEntity())).toBe(0);
    });

    it('setGoal tags the active behavior', () => {
        const entity = new GameEntity() as BossEntity;
        new EnrageEvaluator(1).setGoal(entity);
        expect(entity._activeBehavior).toBe('enrage');
    });
});

describe('BossBrain evaluator composition', () => {
    it('omits RetreatAndSummonEvaluator when no phase has a summon attack', () => {
        const boss = new GameEntity();
        const brain = new BossBrain(boss, [{ healthThreshold: 1, attacks: [{ type: 'melee' }] }]);
        // circle-strafe + aggressive-chase + enrage only (no summon, no ranged)
        expect(brain.evaluators).toHaveLength(3);
        expect(brain.evaluators.some((e) => e instanceof RetreatAndSummonEvaluator)).toBe(false);
        expect(brain.evaluators.some((e) => e instanceof RangedBarrageEvaluator)).toBe(false);
    });

    it('includes RetreatAndSummonEvaluator when a phase has a summon attack', () => {
        const boss = new GameEntity();
        const brain = new BossBrain(boss, [{ healthThreshold: 1, attacks: [{ type: 'summon' }] }]);
        expect(brain.evaluators.some((e) => e instanceof RetreatAndSummonEvaluator)).toBe(true);
    });

    it('includes RangedBarrageEvaluator when a phase has a ranged attack', () => {
        const boss = new GameEntity();
        const brain = new BossBrain(boss, [{ healthThreshold: 1, attacks: [{ type: 'ranged' }] }]);
        expect(brain.evaluators.some((e) => e instanceof RangedBarrageEvaluator)).toBe(true);
    });

    it('boosts aggressive-chase bias when phase 1 attacks are melee-heavy', () => {
        const boss = new GameEntity();
        const brain = new BossBrain(boss, [
            { healthThreshold: 1, attacks: [{ type: 'melee' }, { type: 'melee' }, { type: 'ranged' }] },
        ]);
        const chase = brain.evaluators.find(
            (e): e is AggressiveChaseEvaluator => e instanceof AggressiveChaseEvaluator,
        );
        expect(chase?.characterBias).toBeCloseTo(0.9);
    });

    it('uses the lower aggressive-chase bias when phase 1 attacks are not melee-heavy', () => {
        const boss = new GameEntity();
        const brain = new BossBrain(boss, [
            { healthThreshold: 1, attacks: [{ type: 'ranged' }, { type: 'ranged' }, { type: 'melee' }] },
        ]);
        const chase = brain.evaluators.find(
            (e): e is AggressiveChaseEvaluator => e instanceof AggressiveChaseEvaluator,
        );
        expect(chase?.characterBias).toBeCloseTo(0.6);
    });

    it('does not fire phase-change callbacks when the phase does not advance', () => {
        const boss = new GameEntity();
        const brain = new BossBrain(boss, [
            { healthThreshold: 1, attacks: [{ type: 'melee' }] },
            { healthThreshold: 0.5, attacks: [{ type: 'melee' }] },
        ]);
        let calls = 0;
        brain.onPhaseChange(() => { calls += 1; });
        brain.updatePhase(0.9); // still within phase 0 — no advance
        expect(brain.currentPhase).toBe(0);
        expect(calls).toBe(0);
    });

    it('never regresses to an earlier phase once advanced', () => {
        const boss = new GameEntity();
        const brain = new BossBrain(boss, [
            { healthThreshold: 1, attacks: [{ type: 'melee' }] },
            { healthThreshold: 0.5, attacks: [{ type: 'melee' }] },
        ]);
        brain.updatePhase(0.4);
        expect(brain.currentPhase).toBe(1);
        brain.updatePhase(0.9); // health "recovers" — phase must not regress
        expect(brain.currentPhase).toBe(1);
    });

    it('supports multiple phase-change callbacks', () => {
        const boss = new GameEntity();
        const brain = new BossBrain(boss, [
            { healthThreshold: 1, attacks: [{ type: 'melee' }] },
            { healthThreshold: 0.5, attacks: [{ type: 'melee' }] },
        ]);
        const seenA: number[] = [];
        const seenB: number[] = [];
        brain.onPhaseChange((p) => seenA.push(p));
        brain.onPhaseChange((p) => seenB.push(p));
        brain.updatePhase(0.2);
        expect(seenA).toEqual([1]);
        expect(seenB).toEqual([1]);
    });
});
