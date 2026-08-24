import { describe, expect, it } from 'vitest';
import { EncounterDirector, validateEncounterDirectorSnapshot } from './EncounterDirector.js';
import type { EncounterProbe, EncounterTableEntry } from './types.js';

const probe = (step: number): EncounterProbe => ({
    step,
    mapId: 'thornwood',
    level: 4,
    playerPosition: { x: 10, y: 0, z: 10 },
});

const table: EncounterTableEntry<{ enemies: string[] }>[] = [
    { id: 'wolves', weight: 3, payload: { enemies: ['wolf', 'wolf'] } },
    { id: 'bandits', weight: 1, payload: { enemies: ['bandit'] } },
];

const validEmptySnapshot = {
    schema: 'arcade-ai-yuka-encounters' as const,
    version: 1 as const,
    rngState: 12345,
    lastProbeStep: -1,
    lastEncounterStep: null,
    misses: 0,
    history: [] as string[],
    lastSpawnSteps: [] as Array<[string, number]>,
};

describe('validateEncounterDirectorSnapshot — schema/version rejection', () => {
    it('rejects the wrong schema tag', () => {
        expect(() => validateEncounterDirectorSnapshot({ ...validEmptySnapshot, schema: 'wrong' }))
            .toThrow('Unsupported encounter director snapshot');
    });

    it('rejects the wrong version', () => {
        expect(() => validateEncounterDirectorSnapshot({ ...validEmptySnapshot, version: 2 }))
            .toThrow('Unsupported encounter director snapshot');
    });
});

describe('validateEncounterDirectorSnapshot — lastEncounterStep vs lastProbeStep ordering', () => {
    it('rejects a lastEncounterStep beyond lastProbeStep', () => {
        expect(() => validateEncounterDirectorSnapshot({
            ...validEmptySnapshot,
            lastProbeStep: 3,
            lastEncounterStep: 5,
            history: ['a'],
            lastSpawnSteps: [['a', 5]],
        })).toThrow('Encounter last encounter step cannot exceed the last probe step');
    });
});

describe('validateEncounterDirectorSnapshot — spawn step tuple shape', () => {
    it('rejects a spawn step entry with too few elements', () => {
        expect(() => validateEncounterDirectorSnapshot({
            ...validEmptySnapshot,
            lastProbeStep: 5,
            lastEncounterStep: 5,
            history: ['a'],
            lastSpawnSteps: [['a']],
        })).toThrow(/must be an \[id, step\] tuple/);
    });

    it('rejects a spawn step exceeding the last encounter step', () => {
        expect(() => validateEncounterDirectorSnapshot({
            ...validEmptySnapshot,
            lastProbeStep: 10,
            lastEncounterStep: 5,
            history: ['a', 'b'],
            lastSpawnSteps: [['a', 5], ['b', 7]],
        })).toThrow(/cannot exceed the last encounter step/);
    });
});

describe('validateEncounterDirectorSnapshot — spawn counts tuple shape', () => {
    it('rejects a spawn counts entry with the wrong tuple length', () => {
        expect(() => validateEncounterDirectorSnapshot({
            ...validEmptySnapshot,
            lastProbeStep: 5,
            lastEncounterStep: 5,
            history: ['a'],
            lastSpawnSteps: [['a', 5]],
            spawnCounts: [['map-a', 'a']],
        })).toThrow(/must be a \[mapId, encounterId, count\] tuple/);
    });
});

describe('validateEncounterDirectorSnapshot — spawn state consistency with lastEncounterStep', () => {
    it('rejects spawn history on a snapshot with no last encounter', () => {
        expect(() => validateEncounterDirectorSnapshot({
            ...validEmptySnapshot,
            history: ['a'],
        })).toThrow('Encounter snapshot without a last encounter cannot contain spawn state');
    });

    it('rejects spawn step entries on a snapshot with no last encounter', () => {
        expect(() => validateEncounterDirectorSnapshot({
            ...validEmptySnapshot,
            lastProbeStep: 5,
            lastSpawnSteps: [['a', 0]],
        })).toThrow('Encounter snapshot without a last encounter cannot contain spawn state');
    });

    it('rejects a snapshot with a last encounter but no spawn steps at all', () => {
        expect(() => validateEncounterDirectorSnapshot({
            ...validEmptySnapshot,
            lastProbeStep: 5,
            lastEncounterStep: 5,
        })).toThrow('Encounter snapshot with a last encounter must contain spawn steps');
    });
});

describe('EncounterDirector.consider — entry gate rejection paths', () => {
    it('rejects an entry with a non-positive weight', () => {
        const director = new EncounterDirector({ seed: 1, baseChance: 1, minStepsBetweenEncounters: 0 });
        const decision = director.consider(probe(1), [{ id: 'broken', weight: 0 }]);
        expect(decision).toEqual({ spawned: false, reason: 'no-eligible-entry' });
    });

    it('rejects an entry below minLevel', () => {
        const director = new EncounterDirector({ seed: 1, baseChance: 1, minStepsBetweenEncounters: 0 });
        const decision = director.consider(probe(1), [{ id: 'too-strong', weight: 1, minLevel: 99 }]);
        expect(decision).toEqual({ spawned: false, reason: 'no-eligible-entry' });
    });

    it('rejects an entry above maxLevel', () => {
        const director = new EncounterDirector({ seed: 1, baseChance: 1, minStepsBetweenEncounters: 0 });
        const decision = director.consider(probe(1), [{ id: 'too-weak', weight: 1, maxLevel: 0 }]);
        expect(decision).toEqual({ spawned: false, reason: 'no-eligible-entry' });
    });

    it('rejects an entry restricted to a different map', () => {
        const director = new EncounterDirector({ seed: 1, baseChance: 1, minStepsBetweenEncounters: 0 });
        const decision = director.consider(probe(1), [{ id: 'wrong-map', weight: 1, maps: ['other-map'] }]);
        expect(decision).toEqual({ spawned: false, reason: 'no-eligible-entry' });
    });

    it('accepts an entry restricted to the current map', () => {
        const director = new EncounterDirector({ seed: 1, baseChance: 1, minStepsBetweenEncounters: 0 });
        const decision = director.consider(probe(1), [{ id: 'right-map', weight: 1, maps: ['thornwood'] }]);
        expect(decision.spawned).toBe(true);
    });

    it('rejects an entry missing a required tag', () => {
        const director = new EncounterDirector({ seed: 1, baseChance: 1, minStepsBetweenEncounters: 0 });
        const decision = director.consider(
            { ...probe(1), tags: new Set(['daytime']) },
            [{ id: 'needs-night', weight: 1, requiredTags: ['nighttime'] }],
        );
        expect(decision).toEqual({ spawned: false, reason: 'no-eligible-entry' });
    });

    it('accepts an entry whose required tag is present', () => {
        const director = new EncounterDirector({ seed: 1, baseChance: 1, minStepsBetweenEncounters: 0 });
        const decision = director.consider(
            { ...probe(1), tags: new Set(['nighttime']) },
            [{ id: 'needs-night', weight: 1, requiredTags: ['nighttime'] }],
        );
        expect(decision.spawned).toBe(true);
    });

    it('rejects an entry whose forbidden tag is present', () => {
        const director = new EncounterDirector({ seed: 1, baseChance: 1, minStepsBetweenEncounters: 0 });
        const decision = director.consider(
            { ...probe(1), tags: new Set(['boss-active']) },
            [{ id: 'no-boss', weight: 1, forbiddenTags: ['boss-active'] }],
        );
        expect(decision).toEqual({ spawned: false, reason: 'no-eligible-entry' });
    });

    it('accepts an entry with no forbidden tags active', () => {
        const director = new EncounterDirector({ seed: 1, baseChance: 1, minStepsBetweenEncounters: 0 });
        const decision = director.consider(
            { ...probe(1), tags: new Set() },
            [{ id: 'no-boss', weight: 1, forbiddenTags: ['boss-active'] }],
        );
        expect(decision.spawned).toBe(true);
    });
});

describe('EncounterDirector — options validation', () => {
    it('rejects a non-numeric historySize', () => {
        expect(() => new EncounterDirector({ seed: 1, historySize: 'five' as unknown as number }))
            .toThrow('Encounter history size must be a number');
    });
});

describe('EncounterDirector — real table integration for spawned encounters', () => {
    it('always produces a spawn plan referencing an entry from the real table', () => {
        const director = new EncounterDirector({ seed: 99, baseChance: 1, minStepsBetweenEncounters: 0 });
        const decision = director.consider(probe(1), table);
        expect(decision.spawned).toBe(true);
        if (decision.spawned) {
            expect(['wolves', 'bandits']).toContain(decision.plan.encounterId);
        }
    });
});
