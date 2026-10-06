import { describe, expect, it } from 'vitest';
import { GameEntity, Goal, Think } from 'yuka';
import { createBrain } from '../goals/BrainRegistry.js';
import { WanderEvaluator } from '../goals/evaluators.js';
import {
    GoapActionRegistry,
    GoapGoalEvaluator,
    GoapPlanGoal,
    validateGoapPlanSnapshot,
    type GoapActionDefinition,
    type GoapEffects,
    type GoapPlanGoalOptions,
    type GoapValue,
} from './index.js';

class Companion extends GameEntity {
    facts: Record<string, GoapValue> = {};
    log: string[] = [];
    created: string[] = [];
}

/** A step that takes `duration` updates, then applies its effects (or fails). */
class StepGoal extends Goal {
    #ticks = 0;
    constructor(
        owner: Companion,
        readonly id: string,
        readonly effects: GoapEffects,
        readonly duration: number,
        readonly outcome: () => 'complete' | 'fail' | 'complete-without-effect',
        readonly onComplete?: (owner: Companion) => void,
    ) {
        super(owner);
    }

    execute(): void {
        this.#ticks += 1;
        if (this.#ticks < this.duration) return;
        const owner = this.owner as Companion;
        const outcome = this.outcome();
        if (outcome === 'fail') {
            this.status = Goal.STATUS.FAILED;
            return;
        }
        owner.log.push(this.id);
        if (outcome === 'complete') Object.assign(owner.facts, this.effects);
        this.onComplete?.(owner);
        this.status = Goal.STATUS.COMPLETED;
    }
}

interface StepOptions {
    duration?: number;
    outcomes?: Array<'complete' | 'fail' | 'complete-without-effect'>;
    onComplete?: (owner: Companion) => void;
    isAvailable?: (owner: Companion) => boolean;
}

const step = (
    id: string,
    cost: number,
    preconditions: GoapActionDefinition<Companion>['preconditions'],
    effects: GoapEffects,
    options: StepOptions = {},
): GoapActionDefinition<Companion> => {
    const outcomes = [...(options.outcomes ?? [])];
    return {
        id,
        cost,
        preconditions,
        effects,
        ...(options.isAvailable ? { isAvailable: options.isAvailable } : {}),
        createGoal: (owner) => {
            owner.created.push(id);
            return new StepGoal(owner, id, effects, options.duration ?? 1, () => outcomes.shift() ?? 'complete', options.onComplete);
        },
    };
};

const startFacts = (): Record<string, GoapValue> => ({
    targetKnown: true, near: false, torchLit: true, claimed: false,
});

function claimRegistry(overrides: Partial<Record<string, StepOptions>> = {}) {
    const registry = new GoapActionRegistry<Companion>();
    registry.register(step('approach', 2, { targetKnown: true }, { near: true }, overrides.approach));
    registry.register(step('extinguish', 1, { near: true, torchLit: true }, { torchLit: false }, overrides.extinguish));
    registry.register(step('claim', 1, { near: true, torchLit: false }, { claimed: true }, overrides.claim));
    registry.register(step('lash', 3, {}, { torchLit: false }, overrides.lash));
    return registry;
}

const options = (
    registry: GoapActionRegistry<Companion>,
    extra: Partial<GoapPlanGoalOptions<Companion>> = {},
): GoapPlanGoalOptions<Companion> => ({
    goalId: 'claim',
    goal: { claimed: true },
    registry,
    sense: (owner) => ({ ...owner.facts }),
    ...extra,
});

function runUntilSettled(goal: Goal, limit = 50): number {
    for (let tick = 1; tick <= limit; tick += 1) {
        goal.execute();
        if (goal.completed() || goal.failed()) return tick;
    }
    throw new Error('goal did not settle');
}

describe('GoapPlanGoal', () => {
    it('plans on activation and runs each action as a Yuka subgoal', () => {
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const goal = new GoapPlanGoal(owner, options(claimRegistry()));
        expect(goal.plan).toEqual([]);
        expect(goal.currentActionId).toBeNull();
        goal.execute();
        expect(goal.active()).toBe(true);
        expect(goal.plan).toEqual(['approach', 'extinguish', 'claim']);
        expect(goal.step).toBe(1);
        expect(goal.currentActionId).toBe('extinguish');
        runUntilSettled(goal);
        expect(goal.completed()).toBe(true);
        expect(owner.log).toEqual(['approach', 'extinguish', 'claim']);
        expect(owner.facts.claimed).toBe(true);
        expect(goal.replans).toBe(0);
        expect(goal.currentActionId).toBeNull();
    });

    it('completes immediately when the goal already holds', () => {
        const owner = Object.assign(new Companion(), { facts: { ...startFacts(), claimed: true } });
        const goal = new GoapPlanGoal(owner, options(claimRegistry()));
        goal.execute();
        expect(goal.completed()).toBe(true);
        expect(owner.created).toEqual([]);
    });

    it('replans when a step precondition goes stale', () => {
        let fled = false;
        const registry = claimRegistry({
            approach: {
                onComplete: (owner) => {
                    if (!fled) {
                        fled = true;
                        owner.facts.near = false; // the intruder stepped away
                    }
                },
            },
        });
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const goal = new GoapPlanGoal(owner, options(registry));
        runUntilSettled(goal);
        expect(goal.completed()).toBe(true);
        expect(goal.replans).toBe(1);
        expect(owner.log).toEqual(['approach', 'approach', 'extinguish', 'claim']);
    });

    it('replans when isAvailable turns false before a step runs', () => {
        let staffCharged = true;
        const registry = claimRegistry({
            extinguish: { isAvailable: () => staffCharged },
            approach: { onComplete: () => { staffCharged = false; } },
        });
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const goal = new GoapPlanGoal(owner, options(registry));
        runUntilSettled(goal);
        expect(goal.completed()).toBe(true);
        expect(owner.log).toEqual(['approach', 'lash', 'claim']);
    });

    it('replans after a failed step and fails once maxReplans is spent', () => {
        const recovers = claimRegistry({ claim: { outcomes: ['fail'] } });
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const goal = new GoapPlanGoal(owner, options(recovers));
        runUntilSettled(goal);
        expect(goal.completed()).toBe(true);
        expect(goal.replans).toBe(1);

        const hopeless = claimRegistry({ claim: { outcomes: ['fail', 'fail', 'fail'] } });
        const stuck = Object.assign(new Companion(), { facts: startFacts() });
        const failing = new GoapPlanGoal(stuck, options(hopeless, { maxReplans: 2 }));
        runUntilSettled(failing);
        expect(failing.failed()).toBe(true);
        expect(failing.lastFailure).toEqual({ reason: 'replan-limit', expanded: 0 });
        expect(failing.plan).toEqual([]);
        expect(failing.hasSubgoals()).toBe(false);
    });

    it('replans when the goal still does not hold after the last step', () => {
        const registry = claimRegistry({ claim: { outcomes: ['complete-without-effect'] } });
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const goal = new GoapPlanGoal(owner, options(registry));
        runUntilSettled(goal);
        expect(goal.completed()).toBe(true);
        expect(goal.replans).toBe(1);
        expect(owner.log).toEqual(['approach', 'extinguish', 'claim', 'claim']);
    });

    it('fails with the planner reason when no plan exists, and replans from scratch afterwards', () => {
        const owner = Object.assign(new Companion(), { facts: { ...startFacts(), targetKnown: false, torchLit: false } });
        const goal = new GoapPlanGoal(owner, options(claimRegistry()));
        goal.execute();
        expect(goal.failed()).toBe(true);
        expect(goal.lastFailure).toEqual({ reason: 'unreachable', expanded: 1 });

        owner.facts.targetKnown = true;
        goal.replanIfFailed();
        runUntilSettled(goal);
        expect(goal.completed()).toBe(true);
        expect(goal.lastFailure).toBeNull();
    });

    it('lets contributed item actions change the plan and revoking restore it', () => {
        const registry = claimRegistry();
        registry.contribute('item:sun-staff', [step('emit-pulse', 0.5, {}, { torchLit: false })]);
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const goal = new GoapPlanGoal(owner, options(registry));
        goal.execute();
        expect(goal.plan).toEqual(['emit-pulse', 'approach', 'claim']);

        registry.revoke('item:sun-staff');
        const fresh = new GoapPlanGoal(Object.assign(new Companion(), { facts: startFacts() }), options(registry));
        fresh.execute();
        expect(fresh.plan).toEqual(['approach', 'extinguish', 'claim']);
    });

    it('rejects invalid options', () => {
        const owner = new Companion();
        const registry = claimRegistry();
        expect(() => new GoapPlanGoal(owner, options(registry, { goalId: '' }))).toThrow(/goalId/);
        expect(() => new GoapPlanGoal(owner, options(registry, { goal: null as never }))).toThrow(/GOAP goal claim/);
        expect(() => new GoapPlanGoal(owner, options(registry, { sense: 1 as never }))).toThrow(/sense must be a function/);
        expect(() => new GoapPlanGoal(owner, options({} as never))).toThrow(/registry must be/);
        expect(() => new GoapPlanGoal(owner, options(registry, { maxReplans: -1 }))).toThrow(/maxReplans/);
    });
});

describe('GoapPlanGoal persistence', () => {
    it('round-trips mid-plan progress through JSON without calling game code on restore', () => {
        const registry = claimRegistry({ extinguish: { duration: 3 } });
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const goal = new GoapPlanGoal(owner, options(registry));
        goal.execute(); // approach completes; extinguish starts
        goal.execute();
        const snapshot = JSON.parse(JSON.stringify(goal.snapshot()));
        expect(snapshot).toEqual({
            schema: 'arcade-ai-yuka-goap-plan', version: 1, goalId: 'claim',
            plan: ['approach', 'extinguish', 'claim'], step: 1, replans: 0, status: 'active',
        });

        const loaded = Object.assign(new Companion(), { facts: { ...owner.facts } });
        let sensed = 0;
        const restored = new GoapPlanGoal(loaded, options(registry, {
            sense: (agent) => {
                sensed += 1;
                return { ...agent.facts };
            },
        }));
        restored.restore(snapshot);
        expect(loaded.created).toEqual([]);
        expect(sensed).toBe(0);
        expect(restored.inactive()).toBe(true);
        expect(restored.plan).toEqual(['approach', 'extinguish', 'claim']);
        runUntilSettled(restored);
        expect(restored.completed()).toBe(true);
        expect(loaded.log).toEqual(['extinguish', 'claim']);
        expect(restored.replans).toBe(0);
    });

    it('restores settled and not-yet-planned goals', () => {
        const registry = claimRegistry();
        const fresh = new GoapPlanGoal(new Companion(), options(registry));
        const unplanned = fresh.snapshot();
        expect(unplanned).toMatchObject({ plan: [], step: 0, status: 'inactive' });

        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const target = new GoapPlanGoal(owner, options(registry));
        target.restore(unplanned);
        runUntilSettled(target);
        expect(target.completed()).toBe(true);

        target.restore({ ...unplanned, plan: ['approach', 'extinguish', 'claim'], step: 3, status: 'completed' });
        expect(target.completed()).toBe(true);
        target.restore({ ...unplanned, status: 'failed', replans: 2 });
        expect(target.failed()).toBe(true);
        expect(target.plan).toEqual([]);
    });

    it('validates before changing anything', () => {
        const registry = claimRegistry();
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const goal = new GoapPlanGoal(owner, options(registry, { maxReplans: 2 }));
        goal.execute();
        const good = goal.snapshot();
        const attempts: Array<[unknown, RegExp]> = [
            [{ ...good, goalId: 'guard' }, /for goal guard, not claim/],
            [{ ...good, plan: ['approach', 'teleport'] }, /unknown action: teleport/],
            [{ ...good, replans: 3 }, /exceed maxReplans 2/],
            [{ ...good, step: 3 }, /no remaining action/],
            [{ ...good, step: 4 }, /step must be an integer from 0 through 3/],
            [{ ...good, schema: 'other' }, /Unsupported GOAP plan snapshot/],
            [{ ...good, version: 2 }, /Unsupported GOAP plan snapshot/],
            [{ ...good, status: 'paused' }, /status must be/],
            [{ ...good, plan: [''] }, /plan\[0\] must be a non-empty string/],
            [{ ...good, plan: 'approach' }, /plan must be an array/],
            [{ ...good, extra: 1 }, /unknown field: extra/],
            [null, /must be an object/],
        ];
        for (const [snapshot, error] of attempts) {
            expect(() => goal.restore(snapshot)).toThrow(error);
            expect(goal.snapshot()).toEqual(good);
        }
        expect(validateGoapPlanSnapshot(JSON.parse(JSON.stringify(good)))).toEqual(good);
    });
});

describe('GoapGoalEvaluator with Think', () => {
    const evaluatorFor = (registry: GoapActionRegistry<Companion>, extra = {}) =>
        new GoapGoalEvaluator<Companion>({ ...options(registry), desirability: () => 0.8, ...extra });

    it('lets Think pick the GOAP goal and run its plan to completion', () => {
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const brain = createBrain(owner, [evaluatorFor(claimRegistry()), new WanderEvaluator()]);
        brain.execute();
        const current = brain.currentSubgoal();
        expect(current).toBeInstanceOf(GoapPlanGoal);
        expect((current as GoapPlanGoal<Companion>).plan).toEqual(['approach', 'extinguish', 'claim']);
        for (let tick = 0; tick < 10; tick += 1) brain.execute();
        expect(owner.log).toEqual(['approach', 'extinguish', 'claim']);
        expect(owner.facts.claimed).toBe(true);
    });

    it('scores an impossible goal 0 so Think picks something else', () => {
        const owner = Object.assign(new Companion(), { facts: { ...startFacts(), targetKnown: false, torchLit: false } });
        const goap = evaluatorFor(claimRegistry());
        expect(goap.calculateDesirability(owner)).toBe(0);
        const brain = createBrain(owner, [goap, new WanderEvaluator()]);
        brain.execute();
        expect(brain.currentSubgoal()).toBeNull();
        expect(owner.created).toEqual([]);
    });

    it('can skip the feasibility check and leave failure to the goal', () => {
        const owner = Object.assign(new Companion(), { facts: { ...startFacts(), targetKnown: false, torchLit: false } });
        const goap = evaluatorFor(claimRegistry(), { requirePlan: false });
        expect(goap.calculateDesirability(owner)).toBe(0.8);
        const brain = createBrain(owner, [goap]);
        brain.arbitrate();
        const goal = brain.currentSubgoal() as GoapPlanGoal<Companion>;
        goal.execute();
        expect(goal.lastFailure?.reason).toBe('unreachable');
    });

    it('keeps the running plan when Think re-arbitrates to the same goal', () => {
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const brain = createBrain(owner, [evaluatorFor(claimRegistry({ extinguish: { duration: 5 } }))]);
        brain.execute();
        brain.execute();
        const running = brain.currentSubgoal();
        brain.arbitrate();
        expect(brain.currentSubgoal()).toBe(running);
        expect(owner.created).toEqual(['approach', 'extinguish']);
    });

    it('applies characterBias and skips planning for non-positive desirability', () => {
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        let planned = 0;
        const evaluator = evaluatorFor(claimRegistry(), {
            characterBias: 0.5,
            desirability: () => 0,
            sense: (agent: Companion) => {
                planned += 1;
                return { ...agent.facts };
            },
        });
        expect(evaluator.characterBias).toBe(0.5);
        expect(evaluator.calculateDesirability(owner)).toBe(0);
        expect(planned).toBe(0);
    });

    it('accepts an explicit brain lookup and rejects a missing brain or bad desirability', () => {
        const owner = Object.assign(new Companion(), { facts: startFacts() });
        const brain = new Think(owner);
        const evaluator = evaluatorFor(claimRegistry(), { brain: () => brain });
        evaluator.calculateDesirability(owner);
        evaluator.setGoal(owner);
        expect(brain.currentSubgoal()).toBeInstanceOf(GoapPlanGoal);

        expect(() => evaluatorFor(claimRegistry()).setGoal(new Companion())).toThrow(/needs a Think brain/);
        expect(() => evaluatorFor(claimRegistry(), { desirability: () => Number.NaN }).calculateDesirability(owner))
            .toThrow(/must be finite/);
        expect(() => evaluatorFor(claimRegistry(), { desirability: 1 })).toThrow(/desirability must be a function/);
    });
});
