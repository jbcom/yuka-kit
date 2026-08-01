import { GameEntity, GoalEvaluator, Think, type GameEntity as YukaEntity } from 'yuka';
import {
    requireIntegerInRange,
    requireNonEmptyString,
    SNAPSHOT_ARRAY_LIMIT,
    validateClosedSnapshotRecord,
    validateSnapshotArray,
} from '../persistence/snapshotValidation.js';
import { SeededRandom } from '../random/SeededRandom.js';
import type {
    EncounterDecision,
    EncounterDirectorOptions,
    EncounterDirectorSnapshot,
    EncounterProbe,
    EncounterSpawnPlan,
    EncounterTableEntry,
} from './types.js';

interface SelectionEntity<Payload> extends YukaEntity {
    selected?: EncounterTableEntry<Payload>;
}

class EncounterEvaluator<Payload> extends GoalEvaluator {
    readonly #entry: EncounterTableEntry<Payload>;
    readonly #score: number;

    constructor(entry: EncounterTableEntry<Payload>, score: number) {
        super(1);
        this.#entry = entry;
        this.#score = score;
    }

    calculateDesirability(): number {
        return this.#score;
    }

    setGoal(owner: YukaEntity): void {
        (owner as SelectionEntity<Payload>).selected = this.#entry;
    }
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const UINT32_MAX = 0xffff_ffff;

/** Validate and normalize an untrusted JSON encounter snapshot without mutating a director. */
export function validateEncounterDirectorSnapshot(snapshot: unknown): EncounterDirectorSnapshot {
    const record = validateClosedSnapshotRecord(snapshot, [
        'schema',
        'version',
        'rngState',
        'lastProbeStep',
        'lastEncounterStep',
        'misses',
        'history',
        'lastSpawnSteps',
    ], ['spawnCounts'], 'Encounter director snapshot');
    if (record.schema !== 'arcade-ai-yuka-encounters' || record.version !== 1) {
        throw new TypeError('Unsupported encounter director snapshot');
    }

    const rngState = requireIntegerInRange(record.rngState, 1, UINT32_MAX, 'Encounter RNG state');
    const lastProbeStep = requireIntegerInRange(
        record.lastProbeStep,
        -1,
        Number.MAX_SAFE_INTEGER,
        'Encounter last probe step',
    );
    const lastEncounterStep = record.lastEncounterStep === null
        ? null
        : requireIntegerInRange(
            record.lastEncounterStep,
            0,
            Number.MAX_SAFE_INTEGER,
            'Encounter last encounter step',
        );
    if (lastEncounterStep !== null && lastEncounterStep > lastProbeStep) {
        throw new TypeError('Encounter last encounter step cannot exceed the last probe step');
    }
    const misses = requireIntegerInRange(
        record.misses,
        0,
        Number.MAX_SAFE_INTEGER,
        'Encounter miss count',
    );
    const possibleMissedProbeCount = BigInt(lastProbeStep)
        - BigInt(lastEncounterStep ?? -1);
    if (BigInt(misses) > possibleMissedProbeCount) {
        throw new TypeError('Encounter miss count cannot exceed probes since the last encounter');
    }

    const historyEntries = validateSnapshotArray(record.history, 'Encounter history');
    const history = historyEntries.map((id, index) =>
        requireNonEmptyString(id, `Encounter history[${index}]`));

    const lastSpawnRecords = validateSnapshotArray(
        record.lastSpawnSteps,
        'Encounter last spawn steps',
    );
    const lastSpawnSteps: Array<[string, number]> = [];
    const seenSpawnIds = new Set<string>();
    const seenSpawnSteps = new Set<number>();
    const lastSpawnStepById = new Map<string, number>();
    for (const [index, entry] of lastSpawnRecords.entries()) {
        const tuple = validateSnapshotArray(entry, `Encounter last spawn steps[${index}]`, 2);
        if (tuple.length !== 2) {
            throw new TypeError(`Encounter last spawn steps[${index}] must be an [id, step] tuple`);
        }
        const id = requireNonEmptyString(tuple[0], `Encounter last spawn steps[${index}].id`);
        const step = requireIntegerInRange(
            tuple[1],
            0,
            Number.MAX_SAFE_INTEGER,
            `Encounter last spawn steps[${index}].step`,
        );
        if (seenSpawnIds.has(id)) {
            throw new TypeError(`Encounter last spawn steps contains duplicate id: ${id}`);
        }
        if (seenSpawnSteps.has(step)) {
            throw new TypeError(`Encounter last spawn steps contains duplicate step: ${step}`);
        }
        if (step > lastProbeStep) {
            throw new TypeError(`Encounter last spawn step cannot exceed the last probe step: ${id}`);
        }
        if (lastEncounterStep !== null && step > lastEncounterStep) {
            throw new TypeError(`Encounter last spawn step cannot exceed the last encounter step: ${id}`);
        }
        seenSpawnIds.add(id);
        seenSpawnSteps.add(step);
        lastSpawnStepById.set(id, step);
        lastSpawnSteps.push([id, step]);
    }

    const spawnCounts: Array<[string, string, number]> = [];
    const seenCountIds = new Set<string>();
    const spawnCountByEncounterId = new Map<string, bigint>();
    let totalSpawnCount = 0n;
    if (record.spawnCounts !== undefined) {
        const countRecords = validateSnapshotArray(record.spawnCounts, 'Encounter spawn counts');
        for (const [index, entry] of countRecords.entries()) {
            const tuple = validateSnapshotArray(entry, `Encounter spawn counts[${index}]`, 3);
            if (tuple.length !== 3) {
                throw new TypeError(`Encounter spawn counts[${index}] must be a [mapId, encounterId, count] tuple`);
            }
            const mapId = requireNonEmptyString(tuple[0], `Encounter spawn counts[${index}].mapId`);
            const encounterId = requireNonEmptyString(
                tuple[1],
                `Encounter spawn counts[${index}].encounterId`,
            );
            const count = requireIntegerInRange(
                tuple[2],
                1,
                Number.MAX_SAFE_INTEGER,
                `Encounter spawn counts[${index}].count`,
            );
            const identity = JSON.stringify([mapId, encounterId]);
            if (seenCountIds.has(identity)) {
                throw new TypeError(`Encounter spawn counts contains duplicate entry: ${mapId}/${encounterId}`);
            }
            seenCountIds.add(identity);
            totalSpawnCount += BigInt(count);
            spawnCountByEncounterId.set(
                encounterId,
                (spawnCountByEncounterId.get(encounterId) ?? 0n) + BigInt(count),
            );
            spawnCounts.push([mapId, encounterId, count]);
        }
    }

    if (lastEncounterStep === null) {
        if (history.length > 0 || lastSpawnSteps.length > 0 || spawnCounts.length > 0) {
            throw new TypeError('Encounter snapshot without a last encounter cannot contain spawn state');
        }
    } else {
        const maximumEncounterCount = BigInt(lastEncounterStep) + 1n;
        if (BigInt(history.length) > maximumEncounterCount) {
            throw new TypeError('Encounter history exceeds the possible encounter count');
        }
        if (record.spawnCounts !== undefined && totalSpawnCount > maximumEncounterCount) {
            throw new TypeError('Encounter spawn count total exceeds the possible encounter count');
        }
        if (lastSpawnSteps.length === 0) {
            throw new TypeError('Encounter snapshot with a last encounter must contain spawn steps');
        }
        const latestSpawnRecords = lastSpawnSteps.filter(([, step]) =>
            step === lastEncounterStep);
        if (latestSpawnRecords.length === 0) {
            throw new TypeError('Encounter latest spawn step must equal the last encounter step');
        }
        const latestSpawnId = latestSpawnRecords[0]![0];
        const retainedHistoryIds = new Set<string>();
        const retainedHistoryFrequency = new Map<string, bigint>();
        let previousFeasibleStep: number | undefined;
        for (const [index, id] of history.entries()) {
            const lastSpawnStep = lastSpawnStepById.get(id);
            if (lastSpawnStep === undefined) {
                throw new TypeError(`Encounter history references an unknown spawn id: ${id}`);
            }
            const firstRetainedOccurrence = !retainedHistoryIds.has(id);
            const feasibleStep = firstRetainedOccurrence
                ? lastSpawnStep
                : (previousFeasibleStep ?? 0) - 1;
            if (index === 0 && id !== latestSpawnId) {
                throw new TypeError('Encounter history must begin with the latest spawned encounter');
            }
            if (feasibleStep < 0
                || (previousFeasibleStep !== undefined && feasibleStep >= previousFeasibleStep)) {
                throw new TypeError(
                    `Encounter history cannot align occurrence ${index} with a strictly older spawn step`,
                );
            }
            retainedHistoryIds.add(id);
            retainedHistoryFrequency.set(
                id,
                (retainedHistoryFrequency.get(id) ?? 0n) + 1n,
            );
            previousFeasibleStep = feasibleStep;
        }
        if (previousFeasibleStep !== undefined) {
            for (const [id, step] of lastSpawnSteps) {
                if (!retainedHistoryIds.has(id) && step >= previousFeasibleStep) {
                    throw new TypeError(
                        `Encounter history omits recent spawn id ${id} at step ${step}`,
                    );
                }
            }
        }
        if (record.spawnCounts !== undefined) {
            const countedDeadlines: Array<[deadline: number, id: string, count: bigint]> = [];
            const requiredCountByEncounterId = new Map<string, bigint>();
            for (const id of spawnCountByEncounterId.keys()) {
                if (!lastSpawnStepById.has(id)) {
                    throw new TypeError(`Encounter spawn counts reference an unknown spawn id: ${id}`);
                }
            }
            for (const [id, deadline] of lastSpawnStepById) {
                const persistedCount = spawnCountByEncounterId.get(id) ?? 1n;
                const retainedCount = retainedHistoryFrequency.get(id) ?? 0n;
                const requiredCount = persistedCount > retainedCount
                    ? persistedCount
                    : retainedCount;
                requiredCountByEncounterId.set(id, requiredCount);
                countedDeadlines.push([
                    deadline,
                    id,
                    requiredCount,
                ]);
            }
            countedDeadlines.sort(([left], [right]) => left - right);
            let cumulativeCount = 0n;
            for (const [deadline, id, count] of countedDeadlines) {
                cumulativeCount += count;
                if (cumulativeCount > BigInt(deadline) + 1n) {
                    throw new TypeError(
                        `Encounter spawn counts for ${id} exceed feasible slots through step ${deadline}`,
                    );
                }
            }

            const earlierDeadlines: Array<[deadline: number, id: string, count: bigint]> = [];
            for (const [id, lastSpawnStep] of lastSpawnStepById) {
                const retainedCount = retainedHistoryFrequency.get(id) ?? 0n;
                const earlierCount = requiredCountByEncounterId.get(id)! - retainedCount;
                if (earlierCount === 0n) continue;
                earlierDeadlines.push([
                    retainedCount > 0n && previousFeasibleStep !== undefined
                        ? previousFeasibleStep - 1
                        : lastSpawnStep,
                    id,
                    earlierCount,
                ]);
            }
            earlierDeadlines.sort(([left], [right]) => left - right);
            let cumulativeEarlierCount = 0n;
            for (const [deadline, id, count] of earlierDeadlines) {
                cumulativeEarlierCount += count;
                if (cumulativeEarlierCount > BigInt(deadline) + 1n) {
                    throw new TypeError(
                        `Encounter required occurrences for ${id} cannot fit before retained history boundary`,
                    );
                }
            }
        }
    }

    return {
        schema: 'arcade-ai-yuka-encounters',
        version: 1,
        rngState,
        lastProbeStep,
        lastEncounterStep,
        misses,
        history,
        lastSpawnSteps,
        ...(record.spawnCounts === undefined ? {} : { spawnCounts }),
    };
}

export class EncounterDirector<Payload = unknown> {
    readonly #rng: SeededRandom;
    readonly #baseChance: number;
    readonly #pitySteps: number;
    readonly #minStepsBetween: number;
    readonly #historySize: number;
    readonly #repeatPenalty: number;
    readonly #lastSpawnSteps = new Map<string, number>();
    readonly #spawnCounts = new Map<string, Map<string, number>>();
    #spawnCountEntries = 0;
    #lastProbeStep = -1;
    #lastEncounterStep = Number.NEGATIVE_INFINITY;
    #misses = 0;
    #history: string[] = [];

    constructor(options: EncounterDirectorOptions) {
        this.#rng = new SeededRandom(options.seed);
        this.#baseChance = clamp01(options.baseChance ?? 0.08);
        this.#pitySteps = Math.max(1, Math.floor(options.pitySteps ?? 12));
        this.#minStepsBetween = Math.max(0, Math.floor(options.minStepsBetweenEncounters ?? 5));
        const requestedHistorySize = Math.floor(options.historySize ?? 3);
        if (Number.isNaN(requestedHistorySize)) {
            throw new TypeError('Encounter history size must be a number');
        }
        this.#historySize = Math.min(
            SNAPSHOT_ARRAY_LIMIT,
            Math.max(0, requestedHistorySize),
        );
        this.#repeatPenalty = clamp01(options.repeatPenalty ?? 0.2);
    }

    consider(
        probe: EncounterProbe,
        table: readonly EncounterTableEntry<Payload>[],
    ): EncounterDecision<Payload> {
        if (!Number.isSafeInteger(probe.step) || probe.step < 0) {
            throw new TypeError('Encounter probe step must be a non-negative safe integer');
        }
        if (typeof probe.mapId !== 'string' || probe.mapId.length === 0) {
            throw new TypeError('Encounter probe map id must be a non-empty string');
        }
        if (probe.step <= this.#lastProbeStep) return { spawned: false, reason: 'duplicate-step' };
        if (probe.safe || (probe.danger ?? 1) <= 0) {
            this.#lastProbeStep = probe.step;
            return { spawned: false, reason: 'safe' };
        }
        if (probe.encounterActive) {
            this.#lastProbeStep = probe.step;
            return { spawned: false, reason: 'active-encounter' };
        }
        if (probe.step - this.#lastEncounterStep < this.#minStepsBetween) {
            this.#lastProbeStep = probe.step;
            return { spawned: false, reason: 'cooldown' };
        }

        const eligible = table.filter((entry) => this.#isEligible(entry, probe));
        if (eligible.length === 0) {
            this.#lastProbeStep = probe.step;
            return { spawned: false, reason: 'no-eligible-entry' };
        }
        this.#assertPersistenceCapacity(eligible, probe.mapId);
        this.#lastProbeStep = probe.step;

        const danger = Math.max(0, probe.danger ?? 1);
        const pressure = 1 + this.#misses / this.#pitySteps;
        const chance = clamp01(this.#baseChance * danger * pressure);
        if (this.#rng.next() >= chance) {
            this.#misses = Math.min(Number.MAX_SAFE_INTEGER, this.#misses + 1);
            return { spawned: false, reason: 'roll' };
        }

        const selected = this.#arbitrate(eligible);
        if (!selected) return { spawned: false, reason: 'no-eligible-entry' };
        const selectedId = selected.id;
        if (typeof selectedId !== 'string' || selectedId.length === 0) {
            throw new TypeError('Selected encounter id must be a non-empty string');
        }
        this.#assertPersistenceCapacityForId(selectedId, probe.mapId);
        this.#misses = 0;
        this.#lastEncounterStep = probe.step;
        this.#lastSpawnSteps.set(selectedId, probe.step);
        const mapCounts = this.#spawnCounts.get(probe.mapId) ?? new Map<string, number>();
        if (!mapCounts.has(selectedId)) this.#spawnCountEntries += 1;
        mapCounts.set(
            selectedId,
            Math.min(Number.MAX_SAFE_INTEGER, (mapCounts.get(selectedId) ?? 0) + 1),
        );
        this.#spawnCounts.set(probe.mapId, mapCounts);
        this.#history.unshift(selectedId);
        this.#history.length = Math.min(this.#history.length, this.#historySize);

        const plan: EncounterSpawnPlan<Payload> = {
            encounterId: selectedId,
            step: probe.step,
            mapId: probe.mapId,
            origin: { ...probe.playerPosition },
            formation: selected.formation,
            formationSeed: this.#rng.nextUint32(),
            payload: selected.payload,
        };
        return { spawned: true, plan };
    }

    snapshot(): EncounterDirectorSnapshot {
        return {
            schema: 'arcade-ai-yuka-encounters',
            version: 1,
            rngState: this.#rng.snapshot(),
            lastProbeStep: this.#lastProbeStep,
            lastEncounterStep: Number.isFinite(this.#lastEncounterStep) ? this.#lastEncounterStep : null,
            misses: this.#misses,
            history: [...this.#history],
            lastSpawnSteps: [...this.#lastSpawnSteps.entries()],
            spawnCounts: [...this.#spawnCounts.entries()].flatMap(([mapId, counts]) =>
                [...counts.entries()].map(([encounterId, count]) => [mapId, encounterId, count]),
            ),
        };
    }

    restore(snapshot: unknown): void {
        const validated = validateEncounterDirectorSnapshot(snapshot);
        this.#rng.restore(validated.rngState);
        this.#lastProbeStep = validated.lastProbeStep;
        this.#lastEncounterStep = validated.lastEncounterStep ?? Number.NEGATIVE_INFINITY;
        this.#misses = validated.misses;
        this.#history = validated.history.slice(0, this.#historySize);
        this.#lastSpawnSteps.clear();
        for (const [id, step] of validated.lastSpawnSteps) this.#lastSpawnSteps.set(id, step);
        this.#spawnCounts.clear();
        this.#spawnCountEntries = 0;
        for (const [mapId, encounterId, count] of validated.spawnCounts ?? []) {
            const mapCounts = this.#spawnCounts.get(mapId) ?? new Map<string, number>();
            mapCounts.set(encounterId, count);
            this.#spawnCounts.set(mapId, mapCounts);
            this.#spawnCountEntries += 1;
        }
    }

    #assertPersistenceCapacity(
        entries: readonly EncounterTableEntry<Payload>[],
        mapId: string,
    ): void {
        for (const entry of entries) {
            this.#assertPersistenceCapacityForId(entry.id, mapId);
        }
    }

    #assertPersistenceCapacityForId(id: string, mapId: string): void {
        if (this.#lastSpawnSteps.size >= SNAPSHOT_ARRAY_LIMIT
            && !this.#lastSpawnSteps.has(id)) {
            throw new RangeError(
                `Encounter last spawn persistence capacity is ${SNAPSHOT_ARRAY_LIMIT}`,
            );
        }
        if (this.#spawnCountEntries >= SNAPSHOT_ARRAY_LIMIT
            && !this.#spawnCounts.get(mapId)?.has(id)) {
            throw new RangeError(
                `Encounter spawn count persistence capacity is ${SNAPSHOT_ARRAY_LIMIT}`,
            );
        }
    }

    #arbitrate(entries: readonly EncounterTableEntry<Payload>[]): EncounterTableEntry<Payload> | undefined {
        const owner = new GameEntity() as SelectionEntity<Payload>;
        const brain = new Think(owner);
        const retainedHistoryIds = new Set(this.#history);
        for (const entry of entries) {
            const repeated = retainedHistoryIds.has(entry.id);
            const effectiveWeight = entry.weight * (repeated ? this.#repeatPenalty : 1);
            if (effectiveWeight <= 0) continue;
            // Exponential-race scoring gives weighted random selection while
            // actual Yuka GoalEvaluators perform the arbitration.
            const score = effectiveWeight / -Math.log(Math.max(Number.EPSILON, this.#rng.next()));
            brain.addEvaluator(new EncounterEvaluator(entry, score));
        }
        brain.arbitrate();
        return owner.selected;
    }

    #isEligible(entry: EncounterTableEntry<Payload>, probe: EncounterProbe): boolean {
        if (!entry.id || !Number.isFinite(entry.weight) || entry.weight <= 0) return false;
        if (entry.minLevel !== undefined && probe.level < entry.minLevel) return false;
        if (entry.maxLevel !== undefined && probe.level > entry.maxLevel) return false;
        if (entry.maps && !entry.maps.includes(probe.mapId)) return false;
        if (
            entry.maxSpawnsPerMap !== undefined &&
            (this.#spawnCounts.get(probe.mapId)?.get(entry.id) ?? 0) >=
                Math.max(0, Math.floor(entry.maxSpawnsPerMap))
        ) return false;
        if (entry.requiredTags?.some((tag) => !probe.tags?.has(tag))) return false;
        if (entry.forbiddenTags?.some((tag) => probe.tags?.has(tag))) return false;
        const lastSpawn = this.#lastSpawnSteps.get(entry.id);
        if (
            lastSpawn !== undefined &&
            probe.step - lastSpawn < Math.max(0, entry.cooldownSteps ?? 0)
        ) return false;
        return entry.canSpawn?.(probe) ?? true;
    }
}
