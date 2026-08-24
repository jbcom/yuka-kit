import { describe, expect, it } from 'vitest';
import { GameEntity, Think } from 'yuka';
import { BossBrain } from '../goals/bossBrain.js';
import {
    ChaseEvaluator,
    FleeEvaluator,
    KeepDistanceEvaluator,
    MeleeAttackEvaluator,
    WanderEvaluator,
} from '../goals/evaluators.js';
import type { AIType } from '../core/types.js';
import { AI_TYPE_PRESETS, createBrainForType } from './aiTypes.js';

const ALL_TYPES: AIType[] = ['melee', 'ranged', 'pack', 'ambush', 'boss', 'passive'];

describe('AI_TYPE_PRESETS', () => {
    it('has a factory for every archetype', () => {
        for (const type of ALL_TYPES) {
            expect(typeof AI_TYPE_PRESETS[type]).toBe('function');
        }
    });

    it('produces fresh evaluator instances on every call (never shared)', () => {
        const first = AI_TYPE_PRESETS.melee();
        const second = AI_TYPE_PRESETS.melee();
        expect(first).not.toBe(second);
        expect(first[0]).not.toBe(second[0]);
    });

    it('melee bundles chase, melee attack, wander, and flee', () => {
        const evaluators = AI_TYPE_PRESETS.melee();
        expect(evaluators).toHaveLength(4);
        expect(evaluators[0]).toBeInstanceOf(ChaseEvaluator);
        expect(evaluators[1]).toBeInstanceOf(MeleeAttackEvaluator);
        expect(evaluators[2]).toBeInstanceOf(WanderEvaluator);
        expect(evaluators[3]).toBeInstanceOf(FleeEvaluator);
    });

    it('ranged bundles keep-distance, wander, and flee', () => {
        const evaluators = AI_TYPE_PRESETS.ranged();
        expect(evaluators).toHaveLength(3);
        expect(evaluators[0]).toBeInstanceOf(KeepDistanceEvaluator);
        expect(evaluators[1]).toBeInstanceOf(WanderEvaluator);
        expect(evaluators[2]).toBeInstanceOf(FleeEvaluator);
    });

    it('pack bundles aggressive chase, melee attack, and wander', () => {
        const evaluators = AI_TYPE_PRESETS.pack();
        expect(evaluators).toHaveLength(3);
        expect(evaluators[0]).toBeInstanceOf(ChaseEvaluator);
        expect(evaluators[1]).toBeInstanceOf(MeleeAttackEvaluator);
        expect(evaluators[2]).toBeInstanceOf(WanderEvaluator);
    });

    it('ambush bundles wander and melee attack', () => {
        const evaluators = AI_TYPE_PRESETS.ambush();
        expect(evaluators).toHaveLength(2);
        expect(evaluators[0]).toBeInstanceOf(WanderEvaluator);
        expect(evaluators[1]).toBeInstanceOf(MeleeAttackEvaluator);
    });

    it('boss fallback bundles chase and melee attack', () => {
        const evaluators = AI_TYPE_PRESETS.boss();
        expect(evaluators).toHaveLength(2);
        expect(evaluators[0]).toBeInstanceOf(ChaseEvaluator);
        expect(evaluators[1]).toBeInstanceOf(MeleeAttackEvaluator);
    });

    it('passive bundles wander only', () => {
        const evaluators = AI_TYPE_PRESETS.passive();
        expect(evaluators).toHaveLength(1);
        expect(evaluators[0]).toBeInstanceOf(WanderEvaluator);
    });
});

describe('createBrainForType', () => {
    it('creates a plain Think brain (not BossBrain) for non-boss types', () => {
        const entity = new GameEntity();
        const brain = createBrainForType(entity, 'melee');
        expect(brain).toBeInstanceOf(Think);
        expect(brain).not.toBeInstanceOf(BossBrain);
    });

    it('falls back to a simple chase+attack bundle for boss without phase data', () => {
        const entity = new GameEntity();
        const brain = createBrainForType(entity, 'boss');
        expect(brain).toBeInstanceOf(Think);
        expect(brain).not.toBeInstanceOf(BossBrain);
    });

    it('falls back to the simple bundle when bossPhases is an empty array', () => {
        const entity = new GameEntity();
        const brain = createBrainForType(entity, 'boss', []);
        expect(brain).not.toBeInstanceOf(BossBrain);
    });

    it('creates a full phase-aware BossBrain when bossPhases is provided', () => {
        const entity = new GameEntity();
        const brain = createBrainForType(entity, 'boss', [
            { healthThreshold: 1, attacks: [{ type: 'melee' }] },
        ]);
        expect(brain).toBeInstanceOf(BossBrain);
    });

    it('tags the entity with a _brain back-reference for every archetype', () => {
        for (const type of ALL_TYPES) {
            const entity = new GameEntity();
            createBrainForType(entity, type);
            expect((entity as { _brain?: Think })._brain).toBeInstanceOf(Think);
        }
    });
});
