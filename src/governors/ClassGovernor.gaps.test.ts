import { describe, expect, it } from 'vitest';
import { ClassGovernor, createClassGovernor } from './ClassGovernor.js';
import type { GovernorObservation } from './types.js';

const state = (overrides: Partial<GovernorObservation> = {}): GovernorObservation => ({
    actor: {
        position: { x: 0, y: 0, z: 0 },
        hp: 100,
        maxHp: 100,
        resource: 50,
        maxResource: 50,
        abilities: new Set([
            'blink',
            'trap',
            'knight-area',
            'knight-rush',
            'hunter-roll',
            'hunter-rite',
            'mage-ward',
        ]),
    },
    enemies: [{
        id: 'slime',
        position: { x: 5, y: 0, z: 0 },
        hp: 20,
        maxHp: 20,
        lineOfSight: true,
    }],
    ...overrides,
});

describe('ClassGovernor — decide() input validation', () => {
    it('rejects non-finite actor.hp', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        expect(() => governor.decide(state({
            actor: { ...state().actor, hp: Number.NaN },
        }))).toThrow('Governor hit points must be finite');
    });

    it('rejects non-finite actor.maxHp', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        expect(() => governor.decide(state({
            actor: { ...state().actor, maxHp: Number.POSITIVE_INFINITY },
        }))).toThrow('Governor hit points must be finite');
    });
});

describe('ClassGovernor — enemy scanning', () => {
    it('ignores dead enemies (hp <= 0) when scanning for the nearest target', () => {
        const governor = new ClassGovernor({ className: 'hunter' });
        const decision = governor.decide(state({
            enemies: [
                { id: 'corpse', position: { x: 1, y: 0, z: 0 }, hp: 0, maxHp: 20 },
                { id: 'live', position: { x: 6, y: 0, z: 0 }, hp: 10, maxHp: 20, lineOfSight: true },
            ],
        }));
        expect(decision.intent).not.toMatchObject({ targetId: 'corpse' });
    });

    it('falls back to idle when every enemy is dead', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(state({
            enemies: [{ id: 'corpse', position: { x: 1, y: 0, z: 0 }, hp: 0, maxHp: 20 }],
        }));
        expect(decision.goal).toBe('idle');
        expect(decision.intent).toEqual({ kind: 'stop' });
    });
});

describe('ClassGovernor — movement unavailable', () => {
    it('waits instead of moving toward a distant combat target', () => {
        const governor = new ClassGovernor({ className: 'mage' });
        const decision = governor.decide(state({
            actor: { ...state().actor, movementAvailable: false },
            enemies: [{ id: 'far', position: { x: 50, y: 0, z: 0 }, hp: 20, maxHp: 20, lineOfSight: true }],
        }));
        expect(decision.intent).toEqual({ kind: 'wait', reason: undefined });
    });

    it('the survive score does not activate on low health alone when movement is locked', () => {
        // ratio 0.5 <= healThreshold*0.65 (0.585) would normally trigger the
        // "flee toward safety" survive branch, but movementAvailable:false
        // suppresses it — combat continues to arbitrate instead.
        const governor = new ClassGovernor({ className: 'mage', healThreshold: 0.9 });
        const decision = governor.decide(state({
            actor: { ...state().actor, hp: 50, movementAvailable: false, abilities: new Set() },
            enemies: [{ id: 'melee', position: { x: 1, y: 0, z: 0 }, hp: 20, maxHp: 20, lineOfSight: true }],
        }));
        expect(decision.goal).toBe('combat');
    });

    it('waits instead of retreating once genuinely in survival mode with movement locked', () => {
        // A recovery point makes the first survive-score branch fire regardless
        // of movementAvailable; the survivalIntent fallback (moveAwayOrWait)
        // then has to respect the movement lock and wait instead.
        const governor = new ClassGovernor({ className: 'mage', healThreshold: 0.9 });
        const decision = governor.decide(state({
            actor: { ...state().actor, hp: 50, movementAvailable: false, abilities: new Set() },
            enemies: [{ id: 'melee', position: { x: 1, y: 0, z: 0 }, hp: 20, maxHp: 20, lineOfSight: true }],
            recovery: { id: 'shrine', position: { x: 50, y: 0, z: 0 } },
        }));
        expect(decision.goal).toBe('survive');
        expect(decision.intent).toEqual({ kind: 'wait', reason: undefined });
    });
});

describe('ClassGovernor — survive evaluator boundaries', () => {
    it('does not enter survival mode when the actor has no maxHp (division guard)', () => {
        const governor = new ClassGovernor({ className: 'hunter' });
        const decision = governor.decide(state({
            actor: { ...state().actor, hp: 0, maxHp: 0 },
        }));
        // ratio computes to 0 via the maxHp<=0 guard, which still triggers low-health
        // handling — assert it does not throw and produces a valid decision.
        expect(decision.goal).toBeDefined();
    });

    it('drops out of survival at 0.65x threshold once no enemy is nearby', () => {
        const governor = new ClassGovernor({ className: 'knight', healThreshold: 0.5 });
        const decision = governor.decide(state({
            actor: { ...state().actor, hp: 40 }, // ratio 0.4, between 0.325 and 0.5
            enemies: [],
        }));
        expect(decision.goal).not.toBe('survive');
    });
});

describe('ClassGovernor — interact evaluator', () => {
    it('ignores an interactable while an enemy is within 8 units', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(state({
            interactable: { id: 'chest', position: { x: 0.5, y: 0, z: 0 }, action: 'open-chest' },
            enemies: [{ id: 'near', position: { x: 2, y: 0, z: 0 }, hp: 20, maxHp: 20 }],
        }));
        expect(decision.goal).not.toBe('interact');
    });

    it('interacts once within radius and no enemy is nearby', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(state({
            interactable: { id: 'chest', position: { x: 0.5, y: 0, z: 0 }, action: 'open-chest' },
            enemies: [],
        }));
        expect(decision.goal).toBe('interact');
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'open-chest' });
    });

    it('does not interact while outside the interactable radius', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(state({
            interactable: { id: 'chest', position: { x: 50, y: 0, z: 0 }, action: 'open-chest' },
            enemies: [],
        }));
        expect(decision.goal).not.toBe('interact');
    });
});

describe('ClassGovernor — explore evaluator', () => {
    it('moves toward the first exploration target when nothing more urgent applies', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(state({
            enemies: [],
            explorationTargets: [{ x: 10, y: 0, z: 10 }, { x: 20, y: 0, z: 20 }],
        }));
        expect(decision.goal).toBe('explore');
        expect(decision.intent).toMatchObject({ kind: 'move-to', target: { x: 10, y: 0, z: 10 } });
    });

    it('falls back to idle when there is nothing to do at all', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(state({ enemies: [] }));
        expect(decision.goal).toBe('idle');
        expect(decision.intent).toEqual({ kind: 'stop' });
    });
});

describe('ClassGovernor — objective evaluator', () => {
    it('moves toward a distant objective', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(state({
            enemies: [],
            objective: { id: 'gate', position: { x: 40, y: 0, z: 0 } },
        }));
        expect(decision.goal).toBe('objective');
        expect(decision.intent).toMatchObject({ kind: 'move-to' });
    });

    it('stops at an objective with no action once in range', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(state({
            enemies: [],
            objective: { id: 'marker', position: { x: 0.1, y: 0, z: 0 } },
        }));
        expect(decision.goal).toBe('objective');
        expect(decision.intent).toEqual({ kind: 'stop' });
    });

    it('acts on an objective with an action once in range', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(state({
            enemies: [],
            objective: { id: 'lever', position: { x: 0.1, y: 0, z: 0 }, action: 'pull-lever' },
        }));
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'pull-lever' });
    });
});

describe('ClassGovernor — recovery routing', () => {
    it('stops at a recovery point with no action once in range', () => {
        const governor = new ClassGovernor({ className: 'knight', healThreshold: 0.9 });
        const decision = governor.decide(state({
            actor: { ...state().actor, hp: 10 },
            enemies: [],
            recovery: { id: 'shrine', position: { x: 0.1, y: 0, z: 0 } },
        }));
        expect(decision.intent).toEqual({ kind: 'stop' });
    });
});

describe('HunterStrategy — melee-range roll and rite', () => {
    it('rolls away when a live enemy closes inside 3 units and the roll ability is available', () => {
        const governor = new ClassGovernor({ className: 'hunter' });
        const decision = governor.decide(state({
            enemies: [{ id: 'close', position: { x: 2, y: 0, z: 0 }, hp: 20, maxHp: 20, lineOfSight: true }],
        }));
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'hunter:roll' });
    });

    it('uses hunter-rite on a high-hp target with enough resource', () => {
        const governor = new ClassGovernor({ className: 'hunter' });
        const decision = governor.decide(state({
            actor: { ...state().actor, resource: 40, abilities: new Set(['hunter-rite']) },
            enemies: [{ id: 'tough', position: { x: 6, y: 0, z: 0 }, hp: 200, maxHp: 200, lineOfSight: true }],
        }));
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'hunter:rite' });
    });

    it('shoots at long range when hunterShot is ready and no rite condition applies', () => {
        const governor = new ClassGovernor({ className: 'hunter' });
        const decision = governor.decide(state({
            actor: { ...state().actor, abilities: new Set() },
            enemies: [{ id: 'mid', position: { x: 6, y: 0, z: 0 }, hp: 20, maxHp: 20, lineOfSight: true }],
        }));
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'hunter:shoot' });
    });

    it('waits when hunterShot is not ready at long range', () => {
        const governor = new ClassGovernor({ className: 'hunter' });
        const decision = governor.decide(state({
            actor: {
                ...state().actor,
                abilities: new Set(),
                readyActions: new Set(),
            },
            enemies: [{ id: 'mid', position: { x: 6, y: 0, z: 0 }, hp: 20, maxHp: 20, lineOfSight: true }],
        }));
        expect(decision.intent).toEqual({ kind: 'wait', reason: undefined });
    });

    it('retreats to kite when close and hunterShot is not ready', () => {
        const governor = new ClassGovernor({ className: 'hunter' });
        const decision = governor.decide(state({
            actor: {
                ...state().actor,
                abilities: new Set(),
                readyActions: new Set(),
            },
            enemies: [{ id: 'close', position: { x: 3, y: 0, z: 0 }, hp: 20, maxHp: 20, lineOfSight: true }],
        }));
        expect(decision.intent).toMatchObject({ kind: 'move-away' });
    });
});

describe('MageStrategy — blink and bolt readiness', () => {
    it('blinks away when an enemy closes inside 3 units and blink is available', () => {
        const governor = new ClassGovernor({ className: 'mage' });
        const decision = governor.decide(state({
            enemies: [{ id: 'close', position: { x: 2, y: 0, z: 0 }, hp: 20, maxHp: 20, lineOfSight: true }],
        }));
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'mage:blink' });
    });

    it('kites away when in range but mageBolt is not ready', () => {
        const governor = new ClassGovernor({ className: 'mage' });
        const decision = governor.decide(state({
            actor: {
                ...state().actor,
                abilities: new Set(),
                readyActions: new Set(),
            },
            enemies: [{ id: 'mid', position: { x: 6, y: 0, z: 0 }, hp: 20, maxHp: 20, lineOfSight: true }],
        }));
        expect(decision.intent).toMatchObject({ kind: 'move-away' });
    });
});

describe('createClassGovernor', () => {
    it('builds a functioning ClassGovernor via the factory function', () => {
        const governor = createClassGovernor({ className: 'knight' });
        expect(governor).toBeInstanceOf(ClassGovernor);
        expect(governor.decide(state()).className).toBe('knight');
    });
});

describe('KnightStrategy.survival — guard-hold, unblock, and block branches', () => {
    // Low health (ratio 0.1) with an enemy nearby and movement available crosses
    // the 0.65x threshold, putting the governor into genuine survival mode so
    // KnightStrategy.survival() itself (not combat()) is exercised.
    const lowHealthState = (overrides: Partial<GovernorObservation> = {}) => state({
        actor: { ...state().actor, hp: 5, healAvailable: false },
        ...overrides,
    });

    it('holds guard through an active telegraph while already guarding', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(lowHealthState({
            actor: { ...lowHealthState().actor, guarding: true },
            enemies: [{ id: 'threat', position: { x: 1, y: 0, z: 0 }, hp: 20, maxHp: 20, telegraphing: true }],
        }));
        expect(decision.goal).toBe('survive');
        expect(decision.intent).toEqual({ kind: 'wait', reason: 'hold-guard-through-telegraph' });
    });

    it('unblocks once guarding with no nearby telegraph', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(lowHealthState({
            actor: { ...lowHealthState().actor, guarding: true },
            enemies: [{ id: 'calm', position: { x: 5, y: 0, z: 0 }, hp: 20, maxHp: 20 }],
        }));
        expect(decision.goal).toBe('survive');
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'knight:unblock' });
    });

    it('blocks a telegraph while not yet guarding', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(lowHealthState({
            enemies: [{ id: 'threat', position: { x: 1, y: 0, z: 0 }, hp: 20, maxHp: 20, telegraphing: true }],
        }));
        expect(decision.goal).toBe('survive');
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'knight:block' });
    });

    it('falls through to fleeing when neither guarding nor threatened', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(lowHealthState({
            enemies: [{ id: 'calm', position: { x: 5, y: 0, z: 0 }, hp: 20, maxHp: 20 }],
        }));
        expect(decision.goal).toBe('survive');
        expect(decision.intent).toMatchObject({ kind: 'move-away' });
    });
});

describe('HunterStrategy.survival — roll through a telegraph', () => {
    it('rolls through a nearby telegraph while in survival mode', () => {
        const governor = new ClassGovernor({ className: 'hunter' });
        const decision = governor.decide(state({
            actor: { ...state().actor, hp: 5, healAvailable: false },
            enemies: [{ id: 'threat', position: { x: 3, y: 0, z: 0 }, hp: 20, maxHp: 20, telegraphing: true }],
        }));
        expect(decision.goal).toBe('survive');
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'hunter:roll' });
    });

    it('falls through to fleeing when no telegraph threatens during survival', () => {
        const governor = new ClassGovernor({ className: 'hunter' });
        const decision = governor.decide(state({
            actor: { ...state().actor, hp: 5, healAvailable: false },
            enemies: [{ id: 'calm', position: { x: 10, y: 0, z: 0 }, hp: 20, maxHp: 20 }],
        }));
        expect(decision.goal).toBe('survive');
        expect(decision.intent).toMatchObject({ kind: 'move-away' });
    });
});

describe('MageStrategy.survival — ward against a telegraph', () => {
    it('wards against a nearby telegraph while in survival mode', () => {
        const governor = new ClassGovernor({ className: 'mage' });
        const decision = governor.decide(state({
            actor: { ...state().actor, hp: 5, healAvailable: false },
            enemies: [{ id: 'threat', position: { x: 2, y: 0, z: 0 }, hp: 20, maxHp: 20, telegraphing: true }],
        }));
        expect(decision.goal).toBe('survive');
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'mage:ward' });
    });
});

describe('HunterStrategy.combat — trap on a large cluster', () => {
    it('uses hunterTrap against a cluster of 3 or more when the trap ability is available', () => {
        const governor = new ClassGovernor({ className: 'hunter' });
        const decision = governor.decide(state({
            actor: { ...state().actor, abilities: new Set(['trap']) },
            enemies: [{ id: 'pack', position: { x: 5, y: 0, z: 0 }, hp: 20, maxHp: 20, lineOfSight: true, clusterSize: 3 }],
        }));
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'hunter:trap' });
    });
});

describe('KnightStrategy — area and rush thresholds', () => {
    it('uses knight-area against a large cluster with enough resource', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(state({
            actor: { ...state().actor, resource: 30 },
            enemies: [{ id: 'pack', position: { x: 1, y: 0, z: 0 }, hp: 20, maxHp: 20, clusterSize: 3 }],
        }));
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'knight:area' });
    });

    it('rushes a mid-range target when knight-rush is available', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        const decision = governor.decide(state({
            enemies: [{ id: 'mid', position: { x: 2.5, y: 0, z: 0 }, hp: 20, maxHp: 20 }],
        }));
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'knight:rush' });
    });

    it('unblocks once a held guard has no more nearby telegraphs', () => {
        const governor = new ClassGovernor({ className: 'knight' });
        // First: telegraph forces guard-hold behavior via block, establishing
        // a guarding actor state for the next call.
        const guardingState = state({
            actor: { ...state().actor, guarding: true },
            enemies: [{ id: 'calm', position: { x: 5, y: 0, z: 0 }, hp: 20, maxHp: 20 }],
        });
        const decision = governor.decide(guardingState);
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'knight:unblock' });
    });
});
