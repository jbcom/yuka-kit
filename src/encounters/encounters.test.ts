import { describe, expect, it } from 'vitest';
import { SNAPSHOT_ARRAY_LIMIT } from '../persistence/snapshotValidation.js';
import { EncounterDirector, validateEncounterDirectorSnapshot } from './EncounterDirector.js';
import { generateFormation } from './formations.js';
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

describe('EncounterDirector', () => {
    it('uses deterministic Yuka evaluator arbitration and serializable state', () => {
        const first = new EncounterDirector({ seed: 'quest', baseChance: 1, minStepsBetweenEncounters: 0 });
        const second = new EncounterDirector({ seed: 'quest', baseChance: 1, minStepsBetweenEncounters: 0 });

        const a = first.consider(probe(1), table);
        const b = second.consider(probe(1), table);
        expect(a).toEqual(b);
        expect(a.spawned).toBe(true);

        const snapshot = first.snapshot();
        expect(() => JSON.stringify(snapshot)).not.toThrow();
        const restored = new EncounterDirector({ seed: 'different', baseChance: 1, minStepsBetweenEncounters: 0 });
        restored.restore(snapshot);
        expect(restored.consider(probe(2), table)).toEqual(first.consider(probe(2), table));
    });

    it('emits a validator-accepted snapshot after every public probe outcome', () => {
        const director = new EncounterDirector({
            seed: 'emitted-snapshots',
            baseChance: 0.2,
            minStepsBetweenEncounters: 2,
            historySize: 5,
        });
        for (let step = 0; step < 64; step += 1) {
            director.consider({
                ...probe(step),
                safe: step % 11 === 0,
                encounterActive: step % 13 === 0,
            }, step % 7 === 0 ? [] : table);
            const snapshot = director.snapshot();
            expect(validateEncounterDirectorSnapshot(snapshot)).toEqual(snapshot);
        }
    });

    it('honors safe zones, duplicate steps, entry gates, and cooldowns', () => {
        const director = new EncounterDirector({ seed: 7, baseChance: 1, minStepsBetweenEncounters: 0 });
        expect(director.consider({ ...probe(1), safe: true }, table)).toEqual({ spawned: false, reason: 'safe' });
        expect(director.consider(probe(1), table)).toEqual({ spawned: false, reason: 'duplicate-step' });

        const gated: EncounterTableEntry[] = [{ id: 'unique', weight: 1, cooldownSteps: 10, minLevel: 3 }];
        expect(director.consider(probe(2), gated).spawned).toBe(true);
        expect(director.consider(probe(3), gated)).toEqual({ spawned: false, reason: 'no-eligible-entry' });
    });

    it('uses indexed retained-history membership without changing repeat suppression', () => {
        const director = new EncounterDirector({
            seed: 7,
            baseChance: 1,
            minStepsBetweenEncounters: 0,
            repeatPenalty: 0,
        });
        expect(director.consider(probe(0), [{ id: 'repeated', weight: 1 }]).spawned)
            .toBe(true);
        const decision = director.consider(probe(1), [
            { id: 'repeated', weight: Number.MAX_SAFE_INTEGER },
            { id: 'fresh', weight: 1 },
        ]);
        expect(decision.spawned && decision.plan.encounterId).toBe('fresh');
        expect(validateEncounterDirectorSnapshot(director.snapshot())).toEqual(director.snapshot());
    });

    it('does not stack a new formation while an encounter is unresolved', () => {
        const director = new EncounterDirector({ seed: 11, baseChance: 1, minStepsBetweenEncounters: 0 });

        expect(director.consider({ ...probe(1), encounterActive: true }, table)).toEqual({
            spawned: false,
            reason: 'active-encounter',
        });
        expect(director.consider(probe(2), table).spawned).toBe(true);
    });

    it('persists independent per-map encounter budgets', () => {
        const director = new EncounterDirector({ seed: 17, baseChance: 1, minStepsBetweenEncounters: 0 });
        const budgeted: EncounterTableEntry[] = [{ id: 'road-pack', weight: 1, maxSpawnsPerMap: 1 }];

        expect(director.consider(probe(1), budgeted).spawned).toBe(true);
        expect(director.consider(probe(2), budgeted)).toEqual({
            spawned: false,
            reason: 'no-eligible-entry',
        });

        const restored = new EncounterDirector({ seed: 99, baseChance: 1, minStepsBetweenEncounters: 0 });
        restored.restore(director.snapshot());
        expect(restored.consider({ ...probe(3), mapId: 'ashfen' }, budgeted).spawned).toBe(true);
        expect(restored.consider({ ...probe(4), mapId: 'thornwood' }, budgeted)).toEqual({
            spawned: false,
            reason: 'no-eligible-entry',
        });
    });

    it('validates every field before restore and preserves the next decision on rejection', () => {
        const director = new EncounterDirector({ seed: 23, baseChance: 1, minStepsBetweenEncounters: 0 });
        expect(director.consider(probe(1), table).spawned).toBe(true);
        const before = director.snapshot();
        const control = new EncounterDirector({ seed: 'control', baseChance: 1, minStepsBetweenEncounters: 0 });
        control.restore(before);

        expect(() => director.restore({
            ...before,
            spawnCounts: [
                ...(before.spawnCounts ?? []),
                ['late-map', 'late-invalid', -1],
            ],
        })).toThrow(/count.*integer/i);
        expect(director.snapshot()).toEqual(before);
        expect(director.consider(probe(2), table)).toEqual(control.consider(probe(2), table));
    });

    it('round-trips the maximum safe probe step and rejects unsupported producer values first', () => {
        const rejected = new EncounterDirector({
            seed: 31,
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        const before = rejected.snapshot();
        expect(() => rejected.consider({
            ...probe(Number.MAX_SAFE_INTEGER + 1),
            mapId: 'thornwood',
        }, table)).toThrow(/safe integer/);
        expect(() => rejected.consider({ ...probe(1), mapId: '' }, table))
            .toThrow(/map id.*non-empty string/);
        expect(rejected.snapshot()).toEqual(before);

        const boundary = new EncounterDirector({
            seed: 37,
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        expect(boundary.consider(probe(Number.MAX_SAFE_INTEGER), table).spawned).toBe(true);
        const snapshot = boundary.snapshot();
        expect(validateEncounterDirectorSnapshot(snapshot)).toEqual(snapshot);

        const restored = new EncounterDirector({
            seed: 'different',
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        restored.restore(snapshot);
        expect(restored.snapshot()).toEqual(snapshot);

        const latestId = snapshot.lastSpawnSteps[0]![0];
        const maximumTimeline = {
            ...snapshot,
            history: [latestId, 'prior-encounter'],
            lastSpawnSteps: [
                ['prior-encounter', Number.MAX_SAFE_INTEGER - 1],
                [latestId, Number.MAX_SAFE_INTEGER],
            ],
            spawnCounts: [
                ['thornwood', 'prior-encounter', Number.MAX_SAFE_INTEGER],
                ['thornwood', latestId, 1],
            ],
        };
        expect(validateEncounterDirectorSnapshot(maximumTimeline)).toEqual(maximumTimeline);

        const initial = new EncounterDirector({ seed: 1 }).snapshot();
        expect(() => validateEncounterDirectorSnapshot({ ...initial, misses: 1 }))
            .toThrow(/miss count.*probes since the last encounter/);
        expect(validateEncounterDirectorSnapshot({
            ...initial,
            lastProbeStep: Number.MAX_SAFE_INTEGER,
            misses: Number.MAX_SAFE_INTEGER,
        })).toMatchObject({
            lastProbeStep: Number.MAX_SAFE_INTEGER,
            misses: Number.MAX_SAFE_INTEGER,
        });
        const initialSubject = new EncounterDirector({
            seed: 'initial-subject',
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        const initialControl = new EncounterDirector({
            seed: 'initial-control',
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        initialSubject.restore(initial);
        initialControl.restore(initial);
        expect(() => initialSubject.restore({ ...initial, misses: 1 }))
            .toThrow(/miss count.*probes since the last encounter/);
        expect(initialSubject.snapshot()).toEqual(initial);
        expect(initialSubject.consider(probe(0), table))
            .toEqual(initialControl.consider(probe(0), table));
    });

    it('rejects impossible temporal state before it can suppress the next encounter', () => {
        const director = new EncounterDirector({
            seed: 41,
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        const before = director.snapshot();
        const control = new EncounterDirector({
            seed: 'control',
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        control.restore(before);

        expect(() => director.restore({
            ...before,
            lastSpawnSteps: [['wolves', 0]],
        })).toThrow(/last spawn step.*last probe|without a last encounter.*spawn state/);
        expect(director.snapshot()).toEqual(before);
        const cooldownTable: EncounterTableEntry[] = [{
            id: 'wolves',
            weight: 1,
            cooldownSteps: 10,
        }];
        expect(director.consider(probe(0), cooldownTable))
            .toEqual(control.consider(probe(0), cooldownTable));

        const spawned = new EncounterDirector({
            seed: 43,
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        expect(spawned.consider(probe(1), cooldownTable).spawned).toBe(true);
        const valid = spawned.snapshot();
        expect(() => validateEncounterDirectorSnapshot({
            ...valid,
            lastSpawnSteps: valid.lastSpawnSteps.map(([id]) => [id, 0]),
        })).toThrow(/latest spawn step.*last encounter step/);
        expect(() => validateEncounterDirectorSnapshot({
            ...valid,
            lastSpawnSteps: [...valid.lastSpawnSteps, ['also-latest', valid.lastEncounterStep]],
        })).toThrow(/duplicate step/);
        expect(() => validateEncounterDirectorSnapshot({
            ...valid,
            spawnCounts: [['thornwood', 'never-spawned', 1]],
        })).toThrow(/unknown spawn id/);
    });

    it('atomically rejects aggregate timelines that could not have been produced', () => {
        const source = new EncounterDirector({
            seed: 53,
            baseChance: 1,
            minStepsBetweenEncounters: 0,
            historySize: 4,
        });
        const wolves: EncounterTableEntry[] = [{ id: 'wolves', weight: 1 }];
        const bandits: EncounterTableEntry[] = [{ id: 'bandits', weight: 1 }];
        expect(source.consider(probe(0), wolves).spawned).toBe(true);
        expect(source.consider(probe(1), bandits).spawned).toBe(true);
        const before = source.snapshot();
        const inflatedCounts = (before.spawnCounts ?? []).map(
            ([mapId, encounterId, count], index): [string, string, number] =>
                [mapId, encounterId, count + (index === 0 ? 1 : 0)],
        );
        const adversaries: Array<{ readonly snapshot: unknown; readonly error: RegExp }> = [
            {
                snapshot: { ...before, misses: 1 },
                error: /miss count.*probes since the last encounter/,
            },
            {
                snapshot: {
                    ...before,
                    lastSpawnSteps: before.lastSpawnSteps.map(([id]) => [id, 1]),
                },
                error: /last spawn steps.*duplicate step/,
            },
            {
                snapshot: { ...before, spawnCounts: inflatedCounts },
                error: /spawn count total.*possible encounter count/,
            },
            {
                snapshot: { ...before, history: ['bandits', 'wolves', 'bandits'] },
                error: /history.*possible encounter count/,
            },
        ];

        for (const adversary of adversaries) {
            const subject = new EncounterDirector({
                seed: 'subject',
                baseChance: 1,
                minStepsBetweenEncounters: 0,
                historySize: 4,
            });
            const control = new EncounterDirector({
                seed: 'control',
                baseChance: 1,
                minStepsBetweenEncounters: 0,
                historySize: 4,
            });
            subject.restore(before);
            control.restore(before);

            expect(() => subject.restore(adversary.snapshot)).toThrow(adversary.error);
            expect(subject.snapshot()).toEqual(before);
            expect(subject.consider(probe(2), table)).toEqual(control.consider(probe(2), table));
        }
    });

    it('atomically rejects infeasible retained history and partial count deadlines', () => {
        const source = new EncounterDirector({
            seed: 59,
            baseChance: 1,
            minStepsBetweenEncounters: 0,
            historySize: 4,
        });
        const only = (id: string): EncounterTableEntry[] => [{ id, weight: 1 }];
        expect(source.consider(probe(0), only('a')).spawned).toBe(true);
        expect(source.consider(probe(1), only('b')).spawned).toBe(true);
        expect(source.consider(probe(2), only('a')).spawned).toBe(true);
        expect(source.consider(probe(3), only('c')).spawned).toBe(true);
        const before = source.snapshot();
        expect(before.history).toEqual(['c', 'a', 'b', 'a']);

        const validPartialCounts = {
            ...before,
            spawnCounts: [
                ['first-map', 'a', 2],
                ['second-map', 'b', 1],
            ],
        };
        expect(validateEncounterDirectorSnapshot(validPartialCounts)).toEqual(validPartialCounts);
        const validUnderstatedCounts = {
            ...before,
            spawnCounts: [
                ['map-a', 'a', 1],
                ['map-b', 'b', 1],
                ['map-c', 'c', 1],
            ],
        };
        expect(validateEncounterDirectorSnapshot(validUnderstatedCounts))
            .toEqual(validUnderstatedCounts);
        const validTruncatedOverlap = {
            ...before,
            history: ['c', 'a'],
            spawnCounts: [
                ['map-a', 'a', 1],
                ['map-c', 'c', 2],
            ],
        };
        expect(validateEncounterDirectorSnapshot(validTruncatedOverlap))
            .toEqual(validTruncatedOverlap);

        const adversaries: Array<{ readonly snapshot: unknown; readonly error: RegExp }> = [
            {
                snapshot: { ...before, history: ['c', 'c', 'a', 'b'] },
                error: /cannot align occurrence 2.*strictly older spawn step/,
            },
            {
                snapshot: { ...before, history: ['c', 'c'] },
                error: /history omits recent spawn id a at step 2/,
            },
            {
                snapshot: {
                    ...before,
                    spawnCounts: [
                        ['first-map', 'a', 2],
                        ['first-map', 'b', 1],
                        ['second-map', 'b', 1],
                    ],
                },
                error: /spawn counts for a.*feasible slots through step 2/,
            },
            {
                snapshot: {
                    ...before,
                    spawnCounts: [['partial-map', 'a', 3]],
                },
                error: /spawn counts for a.*feasible slots through step 2/,
            },
            {
                snapshot: {
                    ...before,
                    spawnCounts: [
                        ['map-a', 'a', 1],
                        ['map-c', 'c', 2],
                    ],
                },
                error: /spawn counts for c.*feasible slots through step 3/,
            },
            {
                snapshot: {
                    schema: 'arcade-ai-yuka-encounters',
                    version: 1,
                    rngState: before.rngState,
                    lastProbeStep: 6,
                    lastEncounterStep: 6,
                    misses: 0,
                    history: ['b', 'a'],
                    lastSpawnSteps: [['a', 0], ['b', 6]],
                    spawnCounts: [
                        ['map-a', 'a', 1],
                        ['map-b', 'b', 2],
                    ],
                },
                error: /required occurrences for b.*before retained history boundary/,
            },
        ];

        for (const adversary of adversaries) {
            const subject = new EncounterDirector({
                seed: 'subject-history',
                baseChance: 1,
                minStepsBetweenEncounters: 0,
                historySize: 4,
            });
            const control = new EncounterDirector({
                seed: 'control-history',
                baseChance: 1,
                minStepsBetweenEncounters: 0,
                historySize: 4,
            });
            subject.restore(before);
            control.restore(before);

            expect(() => subject.restore(adversary.snapshot)).toThrow(adversary.error);
            expect(subject.snapshot()).toEqual(before);
            expect(subject.consider(probe(4), table)).toEqual(control.consider(probe(4), table));
        }

        const noHistory = { ...before, history: [] };
        expect(validateEncounterDirectorSnapshot(noHistory)).toEqual(noHistory);
        const truncated = { ...before, history: ['c', 'a'] };
        expect(validateEncounterDirectorSnapshot(truncated)).toEqual(truncated);
    });

    it('matches exhaustive feasible timelines for small retained histories and partial counts', () => {
        type SmallId = 'a' | 'b';
        type Slot = SmallId | null;
        interface SmallWorld {
            readonly history: SmallId[];
            readonly counts: Readonly<Record<SmallId, number>>;
            readonly lastSpawnSteps: Array<[SmallId, number]>;
        }
        const ids: readonly SmallId[] = ['a', 'b'];
        const enumerateHistories = (maximumLength: number): SmallId[][] => {
            const output: SmallId[][] = [[]];
            let frontier: SmallId[][] = [[]];
            for (let length = 1; length <= maximumLength; length += 1) {
                frontier = frontier.flatMap((prefix) => ids.map((id) => [...prefix, id]));
                output.push(...frontier);
            }
            return output;
        };

        for (let lastEncounterStep = 0; lastEncounterStep <= 2; lastEncounterStep += 1) {
            const slotCount = lastEncounterStep + 1;
            const timelines: Slot[][] = [];
            const buildTimeline = (prefix: Slot[]): void => {
                if (prefix.length === slotCount) {
                    if (prefix[lastEncounterStep] !== null) timelines.push(prefix);
                    return;
                }
                for (const value of [null, ...ids] as const) buildTimeline([...prefix, value]);
            };
            buildTimeline([]);

            const worldsByLastSpawn = new Map<string, SmallWorld[]>();
            for (const timeline of timelines) {
                const lastSpawn = new Map<SmallId, number>();
                const counts: Record<SmallId, number> = { a: 0, b: 0 };
                for (const [step, id] of timeline.entries()) {
                    if (id === null) continue;
                    lastSpawn.set(id, step);
                    counts[id] += 1;
                }
                const lastSpawnSteps = ids.flatMap((id): Array<[SmallId, number]> => {
                    const step = lastSpawn.get(id);
                    return step === undefined ? [] : [[id, step]];
                });
                const signature = JSON.stringify(lastSpawnSteps);
                const worlds = worldsByLastSpawn.get(signature) ?? [];
                worlds.push({
                    history: timeline.filter((id): id is SmallId => id !== null).reverse(),
                    counts,
                    lastSpawnSteps,
                });
                worldsByLastSpawn.set(signature, worlds);
            }

            for (const worlds of worldsByLastSpawn.values()) {
                const lastSpawnSteps = worlds[0]!.lastSpawnSteps;
                for (const history of enumerateHistories(slotCount)) {
                    for (let countA = 0; countA <= slotCount + 1; countA += 1) {
                        for (let countB = 0; countB <= slotCount + 1; countB += 1) {
                            const spawnCounts: Array<[string, SmallId, number]> = [];
                            if (countA > 0) spawnCounts.push(['map-a', 'a', countA]);
                            if (countB > 0) spawnCounts.push(['map-b', 'b', countB]);
                            const expected = worlds.some((world) => (
                                world.history.length >= history.length
                                && history.every((id, index) => world.history[index] === id)
                                && world.counts.a >= countA
                                && world.counts.b >= countB
                            ));
                            let accepted = true;
                            try {
                                validateEncounterDirectorSnapshot({
                                    schema: 'arcade-ai-yuka-encounters',
                                    version: 1,
                                    rngState: 1,
                                    lastProbeStep: lastEncounterStep,
                                    lastEncounterStep,
                                    misses: 0,
                                    history,
                                    lastSpawnSteps,
                                    spawnCounts,
                                });
                            } catch {
                                accepted = false;
                            }
                            if (accepted !== expected) {
                                throw new Error(`Small timeline model mismatch: ${JSON.stringify({
                                    lastEncounterStep,
                                    history,
                                    lastSpawnSteps,
                                    spawnCounts,
                                    accepted,
                                    expected,
                                })}`);
                            }
                        }
                    }
                }
            }
        }
    });

    it('keeps legacy v1 snapshots without spawn counts restorable and deterministic', () => {
        const source = new EncounterDirector({
            seed: 47,
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        expect(source.consider(probe(1), table).spawned).toBe(true);
        const current = source.snapshot();
        const legacy: Record<string, unknown> = { ...current };
        delete legacy.spawnCounts;

        const restored = new EncounterDirector({
            seed: 'legacy',
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        restored.restore(legacy);
        expect(validateEncounterDirectorSnapshot(restored.snapshot()))
            .toEqual(restored.snapshot());

        const control = new EncounterDirector({
            seed: 'current',
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        control.restore(current);
        expect(restored.consider(probe(2), table)).toEqual(control.consider(probe(2), table));
    });

    it('keeps every producer-owned persistence collection within the snapshot limit', () => {
        const baseline = new EncounterDirector({ seed: 'capacity-baseline' }).snapshot();
        const only = (id: string): EncounterTableEntry[] => [{ id, weight: 1 }];

        {
            const encounterId = 'repeated-history';
            const boundary = {
                ...baseline,
                lastProbeStep: SNAPSHOT_ARRAY_LIMIT - 1,
                lastEncounterStep: SNAPSHOT_ARRAY_LIMIT - 1,
                history: Array.from(
                    { length: SNAPSHOT_ARRAY_LIMIT },
                    () => encounterId,
                ),
                lastSpawnSteps: [[encounterId, SNAPSHOT_ARRAY_LIMIT - 1]],
                spawnCounts: [['thornwood', encounterId, SNAPSHOT_ARRAY_LIMIT]],
            };
            const director = new EncounterDirector({
                seed: 'history-capacity',
                baseChance: 1,
                minStepsBetweenEncounters: 0,
                historySize: SNAPSHOT_ARRAY_LIMIT + 1,
            });
            director.restore(boundary);
            expect(director.snapshot().history).toHaveLength(SNAPSHOT_ARRAY_LIMIT);
            const largeTable = Array.from(
                { length: 4_096 },
                (_, index): EncounterTableEntry => ({ id: `fresh-${index}`, weight: 1 }),
            );
            const originalIncludes = Array.prototype.includes;
            let retainedHistoryIncludesCalls = 0;
            let spawned = false;
            try {
                Array.prototype.includes = function includes(
                    this: unknown[],
                    searchElement: unknown,
                    fromIndex?: number,
                ): boolean {
                    if (this.length === SNAPSHOT_ARRAY_LIMIT) {
                        retainedHistoryIncludesCalls += 1;
                    }
                    return Reflect.apply(originalIncludes, this, [searchElement, fromIndex]);
                };
                spawned = director.consider(probe(SNAPSHOT_ARRAY_LIMIT), largeTable).spawned;
            } finally {
                Array.prototype.includes = originalIncludes;
            }
            expect(spawned).toBe(true);
            expect(retainedHistoryIncludesCalls).toBe(0);
            const after = director.snapshot();
            expect(after.history).toHaveLength(SNAPSHOT_ARRAY_LIMIT);
            expect(validateEncounterDirectorSnapshot(after)).toEqual(after);
        }

        {
            const lastSpawnSteps = Array.from(
                { length: SNAPSHOT_ARRAY_LIMIT },
                (_, step): [string, number] => [`encounter-${step}`, step],
            );
            const boundary = {
                ...baseline,
                lastProbeStep: SNAPSHOT_ARRAY_LIMIT - 1,
                lastEncounterStep: SNAPSHOT_ARRAY_LIMIT - 1,
                history: [],
                lastSpawnSteps,
                spawnCounts: [],
            };
            const director = new EncounterDirector({
                seed: 'last-spawn-capacity',
                baseChance: 1,
                minStepsBetweenEncounters: 0,
                historySize: 0,
            });
            director.restore(boundary);
            const before = director.snapshot();
            expect(() => director.consider(
                probe(SNAPSHOT_ARRAY_LIMIT),
                only('one-past-last-spawn-capacity'),
            )).toThrow(/last spawn persistence capacity/);
            expect(director.snapshot()).toEqual(before);

            expect(director.consider(
                probe(SNAPSHOT_ARRAY_LIMIT),
                only('encounter-0'),
            ).spawned).toBe(true);
            const after = director.snapshot();
            expect(after.lastSpawnSteps).toHaveLength(SNAPSHOT_ARRAY_LIMIT);
            expect(validateEncounterDirectorSnapshot(after)).toEqual(after);
        }

        {
            const encounterId = 'map-budget-capacity';
            const spawnCounts = Array.from(
                { length: SNAPSHOT_ARRAY_LIMIT },
                (_, index): [string, string, number] => [`map-${index}`, encounterId, 1],
            );
            const boundary = {
                ...baseline,
                lastProbeStep: SNAPSHOT_ARRAY_LIMIT - 1,
                lastEncounterStep: SNAPSHOT_ARRAY_LIMIT - 1,
                history: [],
                lastSpawnSteps: [[encounterId, SNAPSHOT_ARRAY_LIMIT - 1]],
                spawnCounts,
            };
            const director = new EncounterDirector({
                seed: 'spawn-count-capacity',
                baseChance: 1,
                minStepsBetweenEncounters: 0,
                historySize: 0,
            });
            director.restore(boundary);
            const before = director.snapshot();
            expect(() => director.consider({
                ...probe(SNAPSHOT_ARRAY_LIMIT),
                mapId: 'one-past-map-budget-capacity',
            }, only(encounterId))).toThrow(/spawn count persistence capacity/);
            expect(director.snapshot()).toEqual(before);

            expect(director.consider({
                ...probe(SNAPSHOT_ARRAY_LIMIT),
                mapId: 'map-0',
            }, only(encounterId)).spawned).toBe(true);
            const after = director.snapshot();
            expect(after.spawnCounts).toHaveLength(SNAPSHOT_ARRAY_LIMIT);
            expect(validateEncounterDirectorSnapshot(after)).toEqual(after);
        }
    }, 30_000);

    it('exports a closed structural validator and rejects ambiguous map records', () => {
        const director = new EncounterDirector({
            seed: 29,
            baseChance: 1,
            minStepsBetweenEncounters: 0,
        });
        expect(director.consider(probe(1), table).spawned).toBe(true);
        const snapshot = director.snapshot();
        expect(validateEncounterDirectorSnapshot(snapshot)).toEqual(snapshot);
        expect(() => validateEncounterDirectorSnapshot({ ...snapshot, injected: true }))
            .toThrow(/unknown field: injected/);
        expect(() => validateEncounterDirectorSnapshot({
            ...snapshot,
            lastSpawnSteps: [['wolves', 1], ['wolves', 1]],
        })).toThrow(/duplicate id: wolves/);
        expect(() => validateEncounterDirectorSnapshot({
            ...snapshot,
            spawnCounts: [['thornwood', 'wolves', 1], ['thornwood', 'wolves', 2]],
        })).toThrow(/duplicate entry: thornwood\/wolves/);

        const missingSchema: Record<string, unknown> = { ...snapshot };
        delete missingSchema.schema;
        const originalSchema = Object.getOwnPropertyDescriptor(Object.prototype, 'schema');
        let inheritedGetterCalls = 0;
        try {
            Object.defineProperty(Object.prototype, 'schema', {
                configurable: true,
                value: 'arcade-ai-yuka-encounters',
            });
            expect(() => validateEncounterDirectorSnapshot(missingSchema))
                .toThrow(/missing field: schema/);

            Object.defineProperty(Object.prototype, 'schema', {
                configurable: true,
                get: () => {
                    inheritedGetterCalls += 1;
                    return 'arcade-ai-yuka-encounters';
                },
            });
            expect(() => validateEncounterDirectorSnapshot(missingSchema))
                .toThrow(/missing field: schema/);
            expect(inheritedGetterCalls).toBe(0);
        } finally {
            if (originalSchema) {
                Object.defineProperty(Object.prototype, 'schema', originalSchema);
            } else {
                Reflect.deleteProperty(Object.prototype, 'schema');
            }
        }
    });
});

describe('generateFormation', () => {
    it('returns only walkable, hidden ambush points within range', () => {
        const result = generateFormation(
            { pattern: 'ambush', count: 4, radius: 6, facingRadians: 0 },
            { x: 0, y: 0, z: 0 },
            {
                seed: 42,
                minDistance: 4,
                maxDistance: 10,
                avoidVisible: true,
                isVisibleFromPlayer: (point) => point.x > 0,
                isWalkable: (point) => Math.abs(point.z) > 0.1,
            },
        );
        expect(result.complete).toBe(true);
        expect(result.positions).toHaveLength(4);
        expect(result.positions.every((point) => point.x <= 0)).toBe(true);
    });
});
