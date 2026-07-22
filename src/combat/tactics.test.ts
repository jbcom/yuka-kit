import { describe, expect, it } from 'vitest';
import { BossTacticalAgent, TacticalCombatAgent } from './TacticalCombatAgent.js';

const observation = (distance: number) => ({
    position: { x: 0, y: 0, z: 0 },
    target: { x: distance, y: 0, z: 0 },
    targetId: 'hero',
    healthPct: 1,
});

describe('Yuka tactical combat intents', () => {
    it('arbitrates melee approach, attack, disengage, and survival', () => {
        const agent = new TacticalCombatAgent({
            tactic: 'melee',
            detectionRange: 12,
            attackRange: 2,
            retreatHealthPct: 0.2,
        });

        expect(agent.decide(observation(8))).toMatchObject({
            behavior: 'approach',
            intent: { kind: 'move-to' },
        });
        expect(agent.decide(observation(1))).toMatchObject({
            behavior: 'attack',
            intent: { kind: 'action', action: 'attack' },
        });
        expect(agent.decide(observation(20))).toMatchObject({
            behavior: 'dormant',
            intent: { kind: 'wait' },
        });
        expect(agent.decide({ ...observation(1), healthPct: 0.1 })).toMatchObject({
            behavior: 'flee',
            intent: { kind: 'move-away' },
        });
    });

    it('keeps ranged enemies in band and gives chargers a distinct opening', () => {
        const ranged = new TacticalCombatAgent({
            tactic: 'ranged',
            detectionRange: 14,
            attackRange: 11,
            preferredRange: 7,
        });
        expect(ranged.decide(observation(3))).toMatchObject({ behavior: 'retreat' });
        expect(ranged.decide(observation(8))).toMatchObject({ behavior: 'attack' });
        expect(ranged.decide(observation(13))).toMatchObject({ behavior: 'approach' });

        const charger = new TacticalCombatAgent({
            tactic: 'charge',
            detectionRange: 12,
            attackRange: 2,
            preferredRange: 7,
        });
        expect(charger.decide(observation(6))).toMatchObject({
            behavior: 'charge',
            intent: { kind: 'action', action: 'charge' },
        });
        expect(charger.decide({ ...observation(6), chargeReady: false })).toMatchObject({
            behavior: 'approach',
        });
    });

    it('keeps ambushers dormant until detected or alerted', () => {
        const ambusher = new TacticalCombatAgent({
            tactic: 'ambush',
            detectionRange: 4,
            attackRange: 2,
        });

        expect(ambusher.decide({ ...observation(8), targetVisible: true })).toMatchObject({
            behavior: 'dormant',
            intent: { kind: 'wait', reason: 'target-unseen' },
        });
        expect(
            ambusher.decide({ ...observation(8), targetVisible: false, alerted: true }),
        ).toMatchObject({ behavior: 'approach', intent: { kind: 'move-to' } });
    });

    it('turns BossBrain phases and winning behaviors into actionable intents', () => {
        const boss = new BossTacticalAgent({
            phases: [
                { healthThreshold: 1, attacks: [{ type: 'ranged' }] },
                { healthThreshold: 0.65, attacks: [{ type: 'summon' }] },
                { healthThreshold: 0.3, attacks: [{ type: 'melee' }] },
            ],
            meleeRange: 2,
            rangedRange: 14,
            preferredRange: 8,
            rangedIntent: () => ({ kind: 'action', action: 'volley' }),
            summonIntent: () => ({ kind: 'action', action: 'summon' }),
        });

        const phaseTwo = boss.decide({ ...observation(3), healthPct: 0.5 });
        expect(phaseTwo).toMatchObject({
            phase: 1,
            behavior: 'retreat-and-summon',
            intent: { kind: 'action', action: 'summon' },
        });

        const enraged = boss.decide({ ...observation(1), healthPct: 0.15 });
        expect(enraged).toMatchObject({
            phase: 2,
            behavior: 'enrage',
            intent: { kind: 'action', action: 'attack' },
        });
    });

    it('rejects invalid tactical inputs at the shared boundary', () => {
        expect(
            () => new TacticalCombatAgent({
                tactic: 'melee',
                detectionRange: 10,
                attackRange: 2,
                moveSpeed: 0,
            }),
        ).toThrow('moveSpeed');

        const boss = new BossTacticalAgent({
            phases: [{ healthThreshold: 1, attacks: [{ type: 'melee' }] }],
            meleeRange: 2,
            rangedRange: 10,
            preferredRange: 6,
        });
        expect(() => boss.decide({ ...observation(2), healthPct: Number.NaN })).toThrow(
            'healthPct',
        );
    });
});
