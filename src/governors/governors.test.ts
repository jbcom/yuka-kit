import { describe, expect, it } from 'vitest';
import { Think } from 'yuka';
import { ClassGovernor } from './ClassGovernor.js';
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

describe('ClassGovernor', () => {
    it('uses actual Yuka Think brains with three distinct combat styles', () => {
        const knight = new ClassGovernor({ className: 'knight' });
        const hunter = new ClassGovernor({ className: 'hunter' });
        const mage = new ClassGovernor({ className: 'mage' });
        expect(knight.brain).toBeInstanceOf(Think);
        expect(hunter.brain).toBeInstanceOf(Think);
        expect(mage.brain).toBeInstanceOf(Think);

        expect(knight.decide(state()).intent).toMatchObject({ kind: 'move-to' });
        expect(hunter.decide(state()).intent).toMatchObject({ kind: 'action', action: 'hunter:shoot' });
        expect(mage.decide(state()).intent).toMatchObject({ kind: 'action', action: 'mage:bolt' });
    });

    it('prioritizes class tactics and survival over generic movement', () => {
        const knight = new ClassGovernor({ className: 'knight' });
        expect(knight.decide(state({
            enemies: [{ id: 'boss', position: { x: 1, y: 0, z: 0 }, hp: 100, maxHp: 100, telegraphing: true }],
        })).intent).toMatchObject({ kind: 'action', action: 'knight:block' });

        const mage = new ClassGovernor({ className: 'mage' });
        expect(mage.decide(state({
            enemies: [{ id: 'pack', position: { x: 5, y: 0, z: 0 }, hp: 30, maxHp: 30, clusterSize: 4 }],
        })).intent).toMatchObject({ kind: 'action', action: 'mage:cast-area' });

        const hunter = new ClassGovernor({ className: 'hunter' });
        expect(hunter.decide(state({
            actor: { ...state().actor, hp: 10, healAvailable: true },
        })).intent).toMatchObject({ kind: 'action', action: 'use-heal' });
    });

    it('follows authored recovery waypoints and interacts on arrival', () => {
        const knight = new ClassGovernor({ className: 'knight', healThreshold: 0.4 });
        const recoveringActor = { ...state().actor, hp: 35 };
        const recovery = {
            id: 'road-cache',
            position: { x: 3, y: 0, z: 2 },
            arrivalRadius: 0.25,
        };

        expect(knight.decide(state({ actor: recoveringActor, recovery }))).toMatchObject({
            goal: 'survive',
            intent: { kind: 'move-to', target: recovery.position },
        });
        expect(knight.decide(state({
            actor: { ...recoveringActor, position: recovery.position },
            recovery: { ...recovery, action: 'interact' },
        }))).toMatchObject({
            goal: 'survive',
            intent: { kind: 'action', action: 'interact', payload: { targetId: 'road-cache' } },
        });
    });

    it('uses class defense before continuing a pressured recovery route', () => {
        const knight = new ClassGovernor({ className: 'knight', healThreshold: 0.4 });
        const decision = knight.decide(state({
            actor: { ...state().actor, hp: 30 },
            enemies: [{
                id: 'reed-lurker',
                position: { x: 2, y: 0, z: 0 },
                hp: 80,
                maxHp: 80,
                telegraphing: true,
            }],
            recovery: {
                id: 'islet-cache',
                position: { x: 6, y: 0, z: 4 },
            },
        }));

        expect(decision).toMatchObject({
            goal: 'survive',
            intent: { kind: 'action', action: 'knight:block' },
        });
    });

    it('governs every distinct class ability exposed by a game', () => {
        const knight = new ClassGovernor({ className: 'knight' });
        expect(knight.decide(state({
            enemies: [{ id: 'pack', position: { x: 1, y: 0, z: 0 }, hp: 60, maxHp: 60, clusterSize: 3 }],
        })).intent).toMatchObject({ kind: 'action', action: 'knight:area' });
        expect(knight.decide(state({
            enemies: [{ id: 'skirmisher', position: { x: 3, y: 0, z: 0 }, hp: 60, maxHp: 60 }],
        })).intent).toMatchObject({ kind: 'action', action: 'knight:rush' });

        const hunter = new ClassGovernor({ className: 'hunter' });
        expect(hunter.decide(state({
            enemies: [{ id: 'flanker', position: { x: 2, y: 0, z: 0 }, hp: 40, maxHp: 40 }],
        })).intent).toMatchObject({ kind: 'action', action: 'hunter:roll' });
        expect(hunter.decide(state({
            enemies: [{ id: 'boss', position: { x: 6, y: 0, z: 0 }, hp: 220, maxHp: 240 }],
        })).intent).toMatchObject({ kind: 'action', action: 'hunter:rite' });

        const mage = new ClassGovernor({ className: 'mage' });
        expect(mage.decide(state({
            enemies: [{
                id: 'duelist',
                position: { x: 4, y: 0, z: 0 },
                hp: 80,
                maxHp: 80,
                telegraphing: true,
            }],
        })).intent).toMatchObject({ kind: 'action', action: 'mage:ward' });
    });

    it('binds class decisions directly to validated Solo action payloads', () => {
        const hunter = new ClassGovernor({
            className: 'hunter',
            actions: {
                hunterShot: { action: 'combat:use', payload: { actionId: 'hunter:shoot' } },
            },
        });

        expect(hunter.decide(state()).intent).toEqual({
            kind: 'action',
            action: 'combat:use',
            payload: { actionId: 'hunter:shoot', targetId: 'slime' },
        });
    });

    it('waits through authoritative action and movement lock windows', () => {
        const hunter = new ClassGovernor({ className: 'hunter' });
        const mage = new ClassGovernor({ className: 'mage' });
        const knight = new ClassGovernor({ className: 'knight' });
        const lockedActor = {
            ...state().actor,
            readyActions: new Set<never>(),
            movementAvailable: false,
        };

        expect(hunter.decide(state({ actor: lockedActor })).intent).toEqual({ kind: 'wait' });
        expect(mage.decide(state({ actor: lockedActor })).intent).toEqual({ kind: 'wait' });
        expect(knight.decide(state({
            actor: lockedActor,
            enemies: [{ id: 'slime', position: { x: 1, y: 0, z: 0 }, hp: 20, maxHp: 20 }],
        })).intent).toEqual({ kind: 'wait' });
    });

    it('trusts authoritative readiness for a sustainable Mage basic attack', () => {
        const mage = new ClassGovernor({ className: 'mage' });
        const actor = {
            ...state().actor,
            resource: 4,
            readyActions: new Set(['mageBolt'] as const),
            movementAvailable: true,
        };

        expect(mage.decide(state({ actor }))).toMatchObject({
            goal: 'combat',
            intent: { kind: 'action', action: 'mage:bolt', payload: { targetId: 'slime' } },
        });
    });

    it('approaches occluded Hunter targets before attempting close-range kiting', () => {
        const hunter = new ClassGovernor({ className: 'hunter' });
        const actor = {
            ...state().actor,
            readyActions: new Set(['hunterRoll', 'hunterShot'] as const),
            movementAvailable: true,
        };
        const target = {
            id: 'rootling-behind-corner',
            position: { x: 2, y: 0, z: 0 },
            hp: 60,
            maxHp: 60,
            lineOfSight: false,
        };

        expect(hunter.decide(state({ actor, enemies: [target] }))).toMatchObject({
            goal: 'combat',
            intent: { kind: 'move-to', target: target.position },
        });
    });

    it('fires a ready Hunter shot while kiting at close range', () => {
        const hunter = new ClassGovernor({ className: 'hunter' });
        const actor = {
            ...state().actor,
            readyActions: new Set(['hunterShot'] as const),
            movementAvailable: true,
        };
        const target = {
            id: 'close-rootling',
            position: { x: 3.5, y: 0, z: 0 },
            hp: 60,
            maxHp: 60,
            lineOfSight: true,
        };

        expect(hunter.decide(state({ actor, enemies: [target] }))).toMatchObject({
            goal: 'combat',
            intent: { kind: 'action', action: 'hunter:shoot', payload: { targetId: target.id } },
        });
    });

    it('rolls through a ranged telegraph before it lands', () => {
        const hunter = new ClassGovernor({ className: 'hunter' });
        const actor = {
            ...state().actor,
            readyActions: new Set(['hunterRoll', 'hunterShot'] as const),
            movementAvailable: true,
        };

        expect(hunter.decide(state({
            actor,
            enemies: [{
                id: 'shade-bloom',
                position: { x: 7, y: 0, z: 0 },
                hp: 72,
                maxHp: 72,
                lineOfSight: true,
                telegraphing: true,
            }],
        }))).toMatchObject({
            goal: 'combat',
            intent: { kind: 'action', action: 'hunter:roll' },
        });
    });

    it('releases the knight guard through an explicit public action before moving', () => {
        const knight = new ClassGovernor({
            className: 'knight',
            actions: {
                knightUnblock: { action: 'combat:guard', payload: { active: false } },
            },
        });
        const actor = {
            ...state().actor,
            guarding: true,
            movementAvailable: false,
            readyActions: new Set(['knightUnblock'] as const),
        };

        expect(knight.decide(state({ actor })).intent).toEqual({
            kind: 'action',
            action: 'combat:guard',
            payload: { active: false },
        });
    });

    it('holds knight guard until the telegraphed attack leaves startup', () => {
        const knight = new ClassGovernor({ className: 'knight' });
        const actor = {
            ...state().actor,
            guarding: true,
            movementAvailable: false,
            readyActions: new Set(['knightUnblock'] as const),
        };

        expect(knight.decide(state({
            actor,
            enemies: [{
                id: 'rootling',
                position: { x: 2, y: 0, z: 0 },
                hp: 60,
                maxHp: 60,
                telegraphing: true,
            }],
        })).intent).toEqual({ kind: 'wait', reason: 'hold-guard-through-telegraph' });
    });

    it('wards against any nearby telegraph in a pack, not only the nearest enemy', () => {
        const mage = new ClassGovernor({ className: 'mage' });

        expect(mage.decide(state({
            enemies: [
                {
                    id: 'nearest-rootling',
                    position: { x: 2, y: 0, z: 0 },
                    hp: 60,
                    maxHp: 60,
                },
                {
                    id: 'telegraphing-shade-bloom',
                    position: { x: 4, y: 0, z: 0 },
                    hp: 60,
                    maxHp: 60,
                    telegraphing: true,
                },
            ],
        }))).toMatchObject({
            goal: 'combat',
            intent: { kind: 'action', action: 'mage:ward' },
        });
    });
});
