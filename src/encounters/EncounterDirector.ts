import { GameEntity, GoalEvaluator, Think, type GameEntity as YukaEntity } from 'yuka';
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

export class EncounterDirector<Payload = unknown> {
    readonly #rng: SeededRandom;
    readonly #baseChance: number;
    readonly #pitySteps: number;
    readonly #minStepsBetween: number;
    readonly #historySize: number;
    readonly #repeatPenalty: number;
    readonly #lastSpawnSteps = new Map<string, number>();
    #lastProbeStep = -1;
    #lastEncounterStep = Number.NEGATIVE_INFINITY;
    #misses = 0;
    #history: string[] = [];

    constructor(options: EncounterDirectorOptions) {
        this.#rng = new SeededRandom(options.seed);
        this.#baseChance = clamp01(options.baseChance ?? 0.08);
        this.#pitySteps = Math.max(1, Math.floor(options.pitySteps ?? 12));
        this.#minStepsBetween = Math.max(0, Math.floor(options.minStepsBetweenEncounters ?? 5));
        this.#historySize = Math.max(0, Math.floor(options.historySize ?? 3));
        this.#repeatPenalty = clamp01(options.repeatPenalty ?? 0.2);
    }

    consider(
        probe: EncounterProbe,
        table: readonly EncounterTableEntry<Payload>[],
    ): EncounterDecision<Payload> {
        if (!Number.isInteger(probe.step) || probe.step < 0) {
            throw new TypeError('Encounter probe step must be a non-negative integer');
        }
        if (probe.step <= this.#lastProbeStep) return { spawned: false, reason: 'duplicate-step' };
        this.#lastProbeStep = probe.step;
        if (probe.safe || (probe.danger ?? 1) <= 0) return { spawned: false, reason: 'safe' };
        if (probe.encounterActive) return { spawned: false, reason: 'active-encounter' };
        if (probe.step - this.#lastEncounterStep < this.#minStepsBetween) {
            return { spawned: false, reason: 'cooldown' };
        }

        const eligible = table.filter((entry) => this.#isEligible(entry, probe));
        if (eligible.length === 0) return { spawned: false, reason: 'no-eligible-entry' };

        const danger = Math.max(0, probe.danger ?? 1);
        const pressure = 1 + this.#misses / this.#pitySteps;
        const chance = clamp01(this.#baseChance * danger * pressure);
        if (this.#rng.next() >= chance) {
            this.#misses += 1;
            return { spawned: false, reason: 'roll' };
        }

        const selected = this.#arbitrate(eligible);
        if (!selected) return { spawned: false, reason: 'no-eligible-entry' };
        this.#misses = 0;
        this.#lastEncounterStep = probe.step;
        this.#lastSpawnSteps.set(selected.id, probe.step);
        this.#history.unshift(selected.id);
        this.#history.length = Math.min(this.#history.length, this.#historySize);

        const plan: EncounterSpawnPlan<Payload> = {
            encounterId: selected.id,
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
        };
    }

    restore(snapshot: EncounterDirectorSnapshot): void {
        if (snapshot.schema !== 'arcade-ai-yuka-encounters' || snapshot.version !== 1) {
            throw new TypeError('Unsupported encounter director snapshot');
        }
        this.#rng.restore(snapshot.rngState);
        this.#lastProbeStep = snapshot.lastProbeStep;
        this.#lastEncounterStep = snapshot.lastEncounterStep ?? Number.NEGATIVE_INFINITY;
        this.#misses = snapshot.misses;
        this.#history = snapshot.history.slice(0, this.#historySize);
        this.#lastSpawnSteps.clear();
        for (const [id, step] of snapshot.lastSpawnSteps) this.#lastSpawnSteps.set(id, step);
    }

    #arbitrate(entries: readonly EncounterTableEntry<Payload>[]): EncounterTableEntry<Payload> | undefined {
        const owner = new GameEntity() as SelectionEntity<Payload>;
        const brain = new Think(owner);
        for (const entry of entries) {
            const repeated = this.#history.includes(entry.id);
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
