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
        abilities: new Set(['blink', 'trap']),
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
});
