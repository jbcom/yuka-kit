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
});
