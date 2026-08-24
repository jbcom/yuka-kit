import { describe, expect, it } from 'vitest';
import { BossTacticalAgent, TacticalCombatAgent } from './TacticalCombatAgent.js';

const observation = (distance: number) => ({
    position: { x: 0, y: 0, z: 0 },
    target: { x: distance, y: 0, z: 0 },
    targetId: 'hero',
    healthPct: 1,
});

describe('TacticalCombatAgent — constructor validation', () => {
    it('rejects a non-positive detectionRange', () => {
        expect(() => new TacticalCombatAgent({ tactic: 'melee', detectionRange: 0, attackRange: 2 }))
            .toThrow('detectionRange');
    });

    it('rejects a non-positive attackRange', () => {
        expect(() => new TacticalCombatAgent({ tactic: 'melee', detectionRange: 10, attackRange: -1 }))
            .toThrow('attackRange');
    });

    it('rejects a non-finite preferredRange', () => {
        expect(() => new TacticalCombatAgent({
            tactic: 'ranged',
            detectionRange: 10,
            attackRange: 5,
            preferredRange: Number.NaN,
        })).toThrow('preferredRange');
    });

    it('clamps retreatHealthPct into [0, 1]', () => {
        const highClamp = new TacticalCombatAgent({
            tactic: 'melee',
            detectionRange: 10,
            attackRange: 2,
            retreatHealthPct: 5,
        });
        // Clamped to 1: any health <= 1 triggers flee immediately.
        expect(highClamp.decide({ ...observation(1), healthPct: 0.99 })).toMatchObject({ behavior: 'flee' });

        const lowClamp = new TacticalCombatAgent({
            tactic: 'melee',
            detectionRange: 10,
            attackRange: 2,
            retreatHealthPct: -5,
        });
        // Clamped to 0: threshold > 0 is false, so flee never triggers.
        expect(lowClamp.decide({ ...observation(1), healthPct: 0 })).not.toMatchObject({ behavior: 'flee' });
    });
});

describe('TacticalCombatAgent — default intent fallbacks', () => {
    it('falls back to a generic attack action payload when no attackIntent is supplied', () => {
        const agent = new TacticalCombatAgent({ tactic: 'melee', detectionRange: 10, attackRange: 3 });
        const decision = agent.decide(observation(1));
        expect(decision.intent).toEqual({ kind: 'action', action: 'attack', payload: 'hero' });
    });

    it('falls back to a generic charge action payload when no chargeIntent is supplied', () => {
        const agent = new TacticalCombatAgent({
            tactic: 'charge',
            detectionRange: 10,
            attackRange: 2,
            preferredRange: 8,
        });
        const decision = agent.decide(observation(5));
        expect(decision.intent).toEqual({ kind: 'action', action: 'charge', payload: 'hero' });
    });
});

describe('BossTacticalAgent — constructor validation', () => {
    it('rejects an empty phases array', () => {
        expect(() => new BossTacticalAgent({
            phases: [],
            meleeRange: 2,
            rangedRange: 10,
            preferredRange: 6,
        })).toThrow('Boss phases are required');
    });

    it('rejects a non-positive meleeRange', () => {
        expect(() => new BossTacticalAgent({
            phases: [{ healthThreshold: 1, attacks: [{ type: 'melee' }] }],
            meleeRange: 0,
            rangedRange: 10,
            preferredRange: 6,
        })).toThrow('meleeRange');
    });

    it('rejects a non-positive rangedRange', () => {
        expect(() => new BossTacticalAgent({
            phases: [{ healthThreshold: 1, attacks: [{ type: 'melee' }] }],
            meleeRange: 2,
            rangedRange: -1,
            preferredRange: 6,
        })).toThrow('rangedRange');
    });

    it('rejects a non-positive preferredRange', () => {
        expect(() => new BossTacticalAgent({
            phases: [{ healthThreshold: 1, attacks: [{ type: 'melee' }] }],
            meleeRange: 2,
            rangedRange: 10,
            preferredRange: 0,
        })).toThrow('preferredRange');
    });

    it('rejects a non-positive moveSpeed when provided', () => {
        expect(() => new BossTacticalAgent({
            phases: [{ healthThreshold: 1, attacks: [{ type: 'melee' }] }],
            meleeRange: 2,
            rangedRange: 10,
            preferredRange: 6,
            moveSpeed: -3,
        })).toThrow('moveSpeed');
    });

    it('exposes currentPhase before any decide() call', () => {
        const boss = new BossTacticalAgent({
            phases: [{ healthThreshold: 1, attacks: [{ type: 'melee' }] }],
            meleeRange: 2,
            rangedRange: 10,
            preferredRange: 6,
        });
        expect(boss.currentPhase).toBe(0);
    });
});

describe('BossTacticalAgent — aggressive-chase / enrage behavior branches', () => {
    const meleeHeavyPhases = [
        { healthThreshold: 1, attacks: [{ type: 'melee' as const }, { type: 'melee' as const }] },
        { healthThreshold: 0.65, attacks: [{ type: 'melee' as const }, { type: 'melee' as const }] },
    ];

    it('moves toward the target when out of melee range during aggressive-chase', () => {
        const boss = new BossTacticalAgent({
            phases: meleeHeavyPhases,
            meleeRange: 2,
            rangedRange: 10,
            preferredRange: 6,
        });
        // Phase 1's higher aggressive-chase bias (health 0.5 crosses the 0.65
        // threshold) outweighs CircleStrafeEvaluator's shrinking phase bias at
        // distance 3, so aggressive-chase legitimately wins arbitration here.
        const decision = boss.decide({ ...observation(3), healthPct: 0.5 });
        expect(decision.behavior).toBe('aggressive-chase');
        expect(decision.intent).toMatchObject({ kind: 'move-to' });
    });

    it('does not melee when attackReady is explicitly false, even in range', () => {
        const boss = new BossTacticalAgent({
            phases: meleeHeavyPhases,
            meleeRange: 5,
            rangedRange: 10,
            preferredRange: 6,
        });
        const decision = boss.decide({ ...observation(1), healthPct: 0.5, attackReady: false });
        expect(decision.behavior).toBe('aggressive-chase');
        expect(decision.intent).toMatchObject({ kind: 'move-to' });
    });

    it('uses the custom meleeIntent when supplied and in range', () => {
        const boss = new BossTacticalAgent({
            phases: meleeHeavyPhases,
            meleeRange: 5,
            rangedRange: 10,
            preferredRange: 6,
            meleeIntent: () => ({ kind: 'action', action: 'boss-smash' }),
        });
        const decision = boss.decide({ ...observation(1), healthPct: 0.5 });
        expect(decision.intent).toEqual({ kind: 'action', action: 'boss-smash' });
    });
});

describe('BossTacticalAgent — retreat-and-summon without a summonIntent', () => {
    it('moves away from the target when summonReady is false', () => {
        const boss = new BossTacticalAgent({
            phases: [
                { healthThreshold: 1, attacks: [{ type: 'ranged' }] },
                { healthThreshold: 0.65, attacks: [{ type: 'summon' }] },
            ],
            meleeRange: 2,
            rangedRange: 14,
            preferredRange: 8,
        });
        const decision = boss.decide({ ...observation(3), healthPct: 0.5, summonReady: false });
        expect(decision.behavior).toBe('retreat-and-summon');
        expect(decision.intent).toMatchObject({ kind: 'move-away' });
    });

    it('moves away from the target when no summonIntent callback is configured at all', () => {
        const boss = new BossTacticalAgent({
            phases: [
                { healthThreshold: 1, attacks: [{ type: 'ranged' }] },
                { healthThreshold: 0.65, attacks: [{ type: 'summon' }] },
            ],
            meleeRange: 2,
            rangedRange: 14,
            preferredRange: 8,
        });
        const decision = boss.decide({ ...observation(3), healthPct: 0.5 });
        expect(decision.intent).toMatchObject({ kind: 'move-away' });
    });
});

describe('BossTacticalAgent — ranged-barrage distance bands', () => {
    // A two-phase ranged-only boss: at health 0.5 (phase 1), RangedBarrageEvaluator's
    // phase bias (0.5) has decayed less than CircleStrafeEvaluator's (0.4/1.0),
    // so ranged-barrage genuinely wins arbitration across distances 8-16.
    const rangedPhases = [
        { healthThreshold: 1, attacks: [{ type: 'ranged' as const }] },
        { healthThreshold: 0.65, attacks: [{ type: 'ranged' as const }] },
    ];
    // preferredRange 14 puts its 0.7x retreat threshold at 9.8 — high enough
    // that distances 8-9 both win ranged-barrage arbitration AND fall under
    // that threshold, reaching the "too close, retreat" sub-branch for real.
    const bossOptions = {
        phases: rangedPhases,
        meleeRange: 2,
        rangedRange: 13,
        preferredRange: 14,
        rangedIntent: () => ({ kind: 'action' as const, action: 'volley' }),
    };

    it('retreats when too close (under 0.7x preferredRange) for a ranged barrage', () => {
        const boss = new BossTacticalAgent(bossOptions);
        const decision = boss.decide({ ...observation(8), healthPct: 0.5 });
        expect(decision.behavior).toBe('ranged-barrage');
        expect(decision.intent).toMatchObject({ kind: 'move-away' });
    });

    it('approaches when beyond rangedRange for a ranged barrage', () => {
        const boss = new BossTacticalAgent(bossOptions);
        const decision = boss.decide({ ...observation(15), healthPct: 0.5 });
        expect(decision.behavior).toBe('ranged-barrage');
        expect(decision.intent).toMatchObject({ kind: 'move-to' });
    });

    it('waits on cooldown when rangedReady is false at good range', () => {
        const boss = new BossTacticalAgent(bossOptions);
        const decision = boss.decide({ ...observation(12), healthPct: 0.5, rangedReady: false });
        expect(decision.behavior).toBe('ranged-barrage');
        expect(decision.intent).toEqual({ kind: 'wait', reason: 'boss-ranged-cooldown' });
    });

    it('waits when no rangedIntent is configured at all, even ready', () => {
        const boss = new BossTacticalAgent({
            phases: rangedPhases,
            meleeRange: 2,
            rangedRange: 13,
            preferredRange: 14,
        });
        const decision = boss.decide({ ...observation(12), healthPct: 0.5 });
        expect(decision.behavior).toBe('ranged-barrage');
        expect(decision.intent).toEqual({ kind: 'wait', reason: 'boss-ranged-cooldown' });
    });

    it('fires the ranged intent when ready and at good range', () => {
        const boss = new BossTacticalAgent(bossOptions);
        const decision = boss.decide({ ...observation(12), healthPct: 0.5 });
        expect(decision.intent).toEqual({ kind: 'action', action: 'volley' });
    });
});

describe('TacticalCombatAgent — hold fallback', () => {
    it('holds when engaged, in range, but attackReady is false and no other evaluator applies', () => {
        const agent = new TacticalCombatAgent({ tactic: 'melee', detectionRange: 10, attackRange: 3 });
        const decision = agent.decide({ ...observation(1), attackReady: false });
        expect(decision.behavior).toBe('hold');
        expect(decision.intent).toEqual({ kind: 'wait', reason: 'combat-hold' });
    });
});

describe('BossTacticalAgent — circle-strafe orbit target', () => {
    it('computes an orbit point offset from the target at the preferred range', () => {
        const boss = new BossTacticalAgent({
            phases: [{ healthThreshold: 1, attacks: [{ type: 'ranged' }] }],
            meleeRange: 2,
            rangedRange: 10,
            preferredRange: 8,
        });
        // Distance 7 lands in CircleStrafeEvaluator's 5-10 sweet spot.
        const decision = boss.decide({ ...observation(7), healthPct: 0.9 });
        expect(decision.behavior).toBe('circle-strafe');
        expect(decision.intent.kind).toBe('move-to');
        if (decision.intent.kind === 'move-to') {
            const dist = Math.hypot(
                decision.intent.target.x - observation(7).target.x,
                decision.intent.target.z - observation(7).target.z,
            );
            expect(dist).toBeCloseTo(8, 1);
        }
    });

    it('orbits in the opposite direction when orbitSign is -1', () => {
        const clockwise = new BossTacticalAgent({
            phases: [{ healthThreshold: 1, attacks: [{ type: 'ranged' }] }],
            meleeRange: 2,
            rangedRange: 10,
            preferredRange: 8,
            orbitSign: 1,
        });
        const counterClockwise = new BossTacticalAgent({
            phases: [{ healthThreshold: 1, attacks: [{ type: 'ranged' }] }],
            meleeRange: 2,
            rangedRange: 10,
            preferredRange: 8,
            orbitSign: -1,
        });
        const a = clockwise.decide({ ...observation(7), healthPct: 0.9 });
        const b = counterClockwise.decide({ ...observation(7), healthPct: 0.9 });
        expect(a.intent).not.toEqual(b.intent);
    });

    it('falls back to a stable orbit direction when position exactly coincides with target', () => {
        const boss = new BossTacticalAgent({
            phases: [{ healthThreshold: 1, attacks: [{ type: 'ranged' }] }],
            meleeRange: 2,
            rangedRange: 10,
            preferredRange: 8,
        });
        // position === target collapses dx/dz to 0; the 0.0001 length floor
        // prevents a division by zero.
        const coincident = { position: { x: 5, y: 0, z: 5 }, target: { x: 5, y: 0, z: 5 }, healthPct: 0.9 };
        expect(() => boss.decide(coincident)).not.toThrow();
    });
});
