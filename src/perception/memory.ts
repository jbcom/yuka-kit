import type { Vec3Like } from '../core/types.js';
import {
    requireIntegerInRange,
    requireNonEmptyString,
    validateClosedSnapshotRecord,
    validateSnapshotArray,
} from '../persistence/snapshotValidation.js';
import type { HeardNoise } from './hearing.js';

export interface PerceptionMemoryOptions {
    /** Seconds for confidence to halve. */
    halfLife: number;
    /** Records whose decayed confidence falls below this are forgotten (default 0.05). */
    forgetBelow?: number;
    /** Maximum records; the weakest is evicted first (default 256). */
    capacity?: number;
    /** Default confidence for `recordNoise` (default 0.5). */
    hearingConfidence?: number;
}

export interface SightingMemory {
    readonly position: Vec3Like;
    readonly time: number;
}

export interface HearingMemory {
    readonly position: Vec3Like;
    readonly time: number;
    readonly loudness: number;
    readonly kind: string;
}

export interface PerceptionMemoryRecord {
    readonly targetId: string;
    readonly lastSeen: SightingMemory | null;
    readonly lastHeard: HearingMemory | null;
    /** Time of the newest evidence. */
    readonly lastSensedTime: number;
    /** Confidence decayed to the query time, in [0, 1]. */
    readonly confidence: number;
}

export interface LastKnownPosition {
    readonly position: Vec3Like;
    readonly time: number;
    readonly sense: 'sight' | 'hearing';
}

export interface PerceptionMemorySnapshot {
    schema: 'arcade-ai-yuka-perception-memory';
    version: 1;
    halfLife: number;
    forgetBelow: number;
    capacity: number;
    hearingConfidence: number;
    records: Array<{
        targetId: string;
        /** Confidence at `lastSensedTime`, before decay. */
        confidence: number;
        lastSensedTime: number;
        lastSeen: { position: Vec3Like; time: number } | null;
        lastHeard: { position: Vec3Like; time: number; loudness: number; kind: string } | null;
    }>;
}

interface StoredRecord {
    readonly targetId: string;
    lastSeen: SightingMemory | null;
    lastHeard: HearingMemory | null;
    lastSensedTime: number;
    /** Confidence at `lastSensedTime`. */
    confidence: number;
}

export const PERCEPTION_MEMORY_CAPACITY_LIMIT = 100_000;

const copyVec3 = (value: Vec3Like, label: string): Vec3Like => {
    if (typeof value !== 'object' || value === null
        || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
        throw new TypeError(`${label} must have finite x, y, and z`);
    }
    return { x: value.x, y: value.y, z: value.z };
};

const requireFinite = (value: unknown, label: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
    return value;
};

const requireUnit = (value: unknown, label: string): number => {
    const number = requireFinite(value, label);
    if (number < 0 || number > 1) throw new RangeError(`${label} must be in [0, 1]`);
    return number;
};

function validateOptions(options: PerceptionMemoryOptions): Required<PerceptionMemoryOptions> {
    const halfLife = requireFinite(options.halfLife, 'PerceptionMemory halfLife');
    if (halfLife <= 0) throw new RangeError('PerceptionMemory halfLife must be positive');
    return {
        halfLife,
        forgetBelow: requireUnit(options.forgetBelow ?? 0.05, 'PerceptionMemory forgetBelow'),
        capacity: requireIntegerInRange(options.capacity ?? 256, 1, PERCEPTION_MEMORY_CAPACITY_LIMIT, 'PerceptionMemory capacity'),
        hearingConfidence: requireUnit(options.hearingConfidence ?? 0.5, 'PerceptionMemory hearingConfidence'),
    };
}

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/**
 * Per-target memory of what an agent has seen and heard. Confidence decays
 * exponentially and is computed on read, so querying never changes state and
 * the memory is a pure function of the evidence recorded.
 */
export class PerceptionMemory {
    readonly #options: Required<PerceptionMemoryOptions>;
    readonly #records = new Map<string, StoredRecord>();

    constructor(options: PerceptionMemoryOptions) {
        this.#options = validateOptions(options);
    }

    get size(): number {
        return this.#records.size;
    }

    /** Remember seeing `targetId` at `position`. */
    recordSighting(targetId: string, position: Vec3Like, time: number, confidence = 1): void {
        requireNonEmptyString(targetId, 'PerceptionMemory targetId');
        const seen = { position: copyVec3(position, 'Sighting position'), time: requireFinite(time, 'Sighting time') };
        this.#record(targetId, time, requireUnit(confidence, 'Sighting confidence'), (record) => {
            if (!record.lastSeen || seen.time >= record.lastSeen.time) record.lastSeen = seen;
        });
    }

    /**
     * Remember a heard noise. The target is `targetId` or else the noise's
     * `source`; the time is the noise's time.
     */
    recordNoise(heard: HeardNoise, options: { targetId?: string; confidence?: number } = {}): void {
        const targetId = options.targetId ?? heard.event.source;
        requireNonEmptyString(targetId, 'PerceptionMemory noise targetId (pass targetId or set event.source)');
        const time = requireFinite(heard.event.time, 'Noise time');
        const memory: HearingMemory = {
            position: copyVec3(heard.event.position, 'Noise position'),
            time,
            loudness: requireFinite(heard.perceived, 'Noise perceived loudness'),
            kind: requireNonEmptyString(heard.event.kind, 'Noise kind'),
        };
        const confidence = requireUnit(options.confidence ?? this.#options.hearingConfidence, 'Noise confidence');
        this.#record(targetId as string, time, confidence, (record) => {
            if (!record.lastHeard || memory.time >= record.lastHeard.time) record.lastHeard = memory;
        });
    }

    /** The record for `targetId` at `now`, or `null` when unknown or forgotten. */
    get(targetId: string, now: number): PerceptionMemoryRecord | null {
        requireFinite(now, 'PerceptionMemory time');
        const stored = this.#records.get(targetId);
        if (!stored) return null;
        const view = this.#view(stored, now);
        return view.confidence < this.#options.forgetBelow ? null : view;
    }

    /** Every remembered record at `now`: confidence desc, then most recent, then targetId. */
    recall(now: number): PerceptionMemoryRecord[] {
        requireFinite(now, 'PerceptionMemory time');
        return [...this.#records.values()]
            .map((stored) => this.#view(stored, now))
            .filter((record) => record.confidence >= this.#options.forgetBelow)
            .sort((left, right) =>
                right.confidence - left.confidence
                || right.lastSensedTime - left.lastSensedTime
                || compareText(left.targetId, right.targetId));
    }

    /** The most confident remembered target at `now`, or `null`. */
    strongest(now: number): PerceptionMemoryRecord | null {
        return this.recall(now)[0] ?? null;
    }

    /** The newest position evidence for `targetId`, from either sense. Sight wins a tie. */
    lastKnownPosition(targetId: string, now: number): LastKnownPosition | null {
        const record = this.get(targetId, now);
        if (!record) return null;
        const { lastSeen, lastHeard } = record;
        if (lastSeen && (!lastHeard || lastSeen.time >= lastHeard.time)) {
            return { position: lastSeen.position, time: lastSeen.time, sense: 'sight' };
        }
        const heard = lastHeard as HearingMemory;
        return { position: heard.position, time: heard.time, sense: 'hearing' };
    }

    forget(targetId: string): boolean {
        return this.#records.delete(targetId);
    }

    /** Delete records forgotten by `now`. Returns how many were deleted. */
    prune(now: number): number {
        requireFinite(now, 'PerceptionMemory time');
        let removed = 0;
        for (const [targetId, stored] of this.#records) {
            if (this.#decayed(stored, now) < this.#options.forgetBelow) {
                this.#records.delete(targetId);
                removed += 1;
            }
        }
        return removed;
    }

    clear(): void {
        this.#records.clear();
    }

    /** A closed, JSON-safe snapshot with records sorted by targetId. */
    snapshot(): PerceptionMemorySnapshot {
        return {
            schema: 'arcade-ai-yuka-perception-memory',
            version: 1,
            ...this.#options,
            records: [...this.#records.values()]
                .sort((left, right) => compareText(left.targetId, right.targetId))
                .map((stored) => ({
                    targetId: stored.targetId,
                    confidence: stored.confidence,
                    lastSensedTime: stored.lastSensedTime,
                    lastSeen: stored.lastSeen
                        ? { position: { ...stored.lastSeen.position }, time: stored.lastSeen.time }
                        : null,
                    lastHeard: stored.lastHeard
                        ? { ...stored.lastHeard, position: { ...stored.lastHeard.position } }
                        : null,
                })),
        };
    }

    /** Build a memory from an untrusted snapshot, validating everything first. */
    static restore(snapshot: unknown): PerceptionMemory {
        const validated = validatePerceptionMemorySnapshot(snapshot);
        const memory = new PerceptionMemory(validated);
        for (const record of validated.records) {
            memory.#records.set(record.targetId, { ...record });
        }
        return memory;
    }

    #decayed(stored: StoredRecord, now: number): number {
        const elapsed = Math.max(0, now - stored.lastSensedTime);
        return stored.confidence * 0.5 ** (elapsed / this.#options.halfLife);
    }

    #view(stored: StoredRecord, now: number): PerceptionMemoryRecord {
        // Detached copies: a caller writing through a returned position must
        // never change what the memory recalls or snapshots later.
        return {
            targetId: stored.targetId,
            lastSeen: stored.lastSeen && { ...stored.lastSeen, position: { ...stored.lastSeen.position } },
            lastHeard: stored.lastHeard && { ...stored.lastHeard, position: { ...stored.lastHeard.position } },
            lastSensedTime: stored.lastSensedTime,
            confidence: this.#decayed(stored, now),
        };
    }

    #record(targetId: string, time: number, confidence: number, apply: (record: StoredRecord) => void): void {
        const existing = this.#records.get(targetId);
        if (existing) {
            // Never move time backwards: fold older evidence in at the newest time.
            const at = Math.max(existing.lastSensedTime, time);
            existing.confidence = Math.max(
                this.#decayed(existing, at),
                confidence * 0.5 ** ((at - time) / this.#options.halfLife),
            );
            existing.lastSensedTime = at;
            apply(existing);
            return;
        }
        const record: StoredRecord = { targetId, lastSeen: null, lastHeard: null, lastSensedTime: time, confidence };
        apply(record);
        this.#records.set(targetId, record);
        if (this.#records.size > this.#options.capacity) this.#evictWeakest();
    }

    /**
     * Time-invariant strength: log2 of the confidence the record would have at
     * time 0 if decay ran backwards. Exponential decay preserves the order of
     * these values at every time after all records, so eviction never depends
     * on which evidence arrived last (a late, old event must not be compared
     * at its own past time while newer records are measured undecayed).
     */
    #strength(stored: StoredRecord): number {
        return stored.confidence === 0
            ? Number.NEGATIVE_INFINITY
            : Math.log2(stored.confidence) + stored.lastSensedTime / this.#options.halfLife;
    }

    #evictWeakest(): void {
        let weakest: StoredRecord | null = null;
        for (const stored of this.#records.values()) {
            if (weakest === null) {
                weakest = stored;
                continue;
            }
            const difference = this.#strength(stored) - this.#strength(weakest);
            if (
                difference < 0
                || (difference === 0 && (
                    stored.lastSensedTime < weakest.lastSensedTime
                    || (stored.lastSensedTime === weakest.lastSensedTime && compareText(stored.targetId, weakest.targetId) < 0)
                ))
            ) {
                weakest = stored;
            }
        }
        this.#records.delete((weakest as StoredRecord).targetId);
    }
}

function validateMemoryVec3(value: unknown, label: string): Vec3Like {
    const record = validateClosedSnapshotRecord(value, ['x', 'y', 'z'], [], label);
    return {
        x: requireFinite(record.x, `${label}.x`),
        y: requireFinite(record.y, `${label}.y`),
        z: requireFinite(record.z, `${label}.z`),
    };
}

/** Validate and normalize an untrusted perception-memory snapshot. */
export function validatePerceptionMemorySnapshot(snapshot: unknown): PerceptionMemorySnapshot {
    const record = validateClosedSnapshotRecord(
        snapshot,
        ['schema', 'version', 'halfLife', 'forgetBelow', 'capacity', 'hearingConfidence', 'records'],
        [],
        'Perception memory snapshot',
    );
    if (record.schema !== 'arcade-ai-yuka-perception-memory' || record.version !== 1) {
        throw new TypeError('Unsupported perception memory snapshot');
    }
    const options = validateOptions({
        halfLife: record.halfLife as number,
        forgetBelow: record.forgetBelow as number,
        capacity: record.capacity as number,
        hearingConfidence: record.hearingConfidence as number,
    });
    const seen = new Set<string>();
    const records = validateSnapshotArray(record.records, 'Perception memory records', options.capacity)
        .map((entry, index) => {
            const label = `Perception memory records[${index}]`;
            const fields = validateClosedSnapshotRecord(
                entry, ['targetId', 'confidence', 'lastSensedTime', 'lastSeen', 'lastHeard'], [], label,
            );
            const targetId = requireNonEmptyString(fields.targetId, `${label}.targetId`);
            if (seen.has(targetId)) throw new TypeError(`${label}.targetId duplicates ${targetId}`);
            seen.add(targetId);
            const lastSeen = fields.lastSeen === null ? null : (() => {
                const sighting = validateClosedSnapshotRecord(fields.lastSeen, ['position', 'time'], [], `${label}.lastSeen`);
                return {
                    position: validateMemoryVec3(sighting.position, `${label}.lastSeen.position`),
                    time: requireFinite(sighting.time, `${label}.lastSeen.time`),
                };
            })();
            const lastHeard = fields.lastHeard === null ? null : (() => {
                const noise = validateClosedSnapshotRecord(
                    fields.lastHeard, ['position', 'time', 'loudness', 'kind'], [], `${label}.lastHeard`,
                );
                return {
                    position: validateMemoryVec3(noise.position, `${label}.lastHeard.position`),
                    time: requireFinite(noise.time, `${label}.lastHeard.time`),
                    loudness: requireFinite(noise.loudness, `${label}.lastHeard.loudness`),
                    kind: requireNonEmptyString(noise.kind, `${label}.lastHeard.kind`),
                };
            })();
            if (!lastSeen && !lastHeard) throw new TypeError(`${label} must hold a sighting or a noise`);
            const lastSensedTime = requireFinite(fields.lastSensedTime, `${label}.lastSensedTime`);
            const newestEvidence = Math.max(lastSeen?.time ?? Number.NEGATIVE_INFINITY, lastHeard?.time ?? Number.NEGATIVE_INFINITY);
            if (lastSensedTime !== newestEvidence) {
                // A future lastSensedTime would freeze decay; a past one would precede the evidence.
                throw new TypeError(`${label}.lastSensedTime must equal its newest evidence time`);
            }
            return {
                targetId,
                confidence: requireUnit(fields.confidence, `${label}.confidence`),
                lastSensedTime,
                lastSeen,
                lastHeard,
            };
        });
    return { schema: 'arcade-ai-yuka-perception-memory', version: 1, ...options, records };
}
