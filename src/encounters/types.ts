import type { Vec3Like } from '../core/types.js';

export type FormationPattern = 'ambush' | 'line' | 'ring' | 'scatter' | 'wedge';

export interface FormationSpec {
    pattern: FormationPattern;
    count: number;
    radius?: number;
    spacing?: number;
    facingRadians?: number;
}

export interface EncounterProbe {
    /** Monotonic player movement step. Calls with the same step are ignored. */
    step: number;
    mapId: string;
    level: number;
    playerPosition: Vec3Like;
    /** 0 disables encounters; 1 is normal danger; values above 1 raise pressure. */
    danger?: number;
    safe?: boolean;
    /** Suppresses a new roll while a previously spawned encounter is unresolved. */
    encounterActive?: boolean;
    tags?: ReadonlySet<string>;
}

export interface EncounterTableEntry<Payload = unknown> {
    id: string;
    weight: number;
    payload?: Payload;
    formation?: FormationSpec;
    cooldownSteps?: number;
    minLevel?: number;
    maxLevel?: number;
    maps?: readonly string[];
    requiredTags?: readonly string[];
    forbiddenTags?: readonly string[];
    canSpawn?: (probe: EncounterProbe) => boolean;
}

export interface EncounterSpawnPlan<Payload = unknown> {
    encounterId: string;
    step: number;
    mapId: string;
    origin: Vec3Like;
    formation?: FormationSpec;
    formationSeed: number;
    payload: Payload | undefined;
}

export type EncounterDecision<Payload = unknown> =
    | { spawned: false; reason: 'active-encounter' | 'cooldown' | 'duplicate-step' | 'no-eligible-entry' | 'roll' | 'safe' }
    | { spawned: true; plan: EncounterSpawnPlan<Payload> };

export interface EncounterDirectorOptions {
    seed: number | string;
    /** Chance per eligible movement step at danger=1. Default 0.08. */
    baseChance?: number;
    /** Guaranteed pressure ramp: chance doubles after this many misses. Default 12. */
    pitySteps?: number;
    /** Hard spacing between encounters. Default 5 movement steps. */
    minStepsBetweenEncounters?: number;
    /** Number of encounter ids retained for repeat suppression. Default 3. */
    historySize?: number;
    /** Weight multiplier for recently used entries. Default 0.2. */
    repeatPenalty?: number;
}

export interface EncounterDirectorSnapshot {
    schema: 'arcade-ai-yuka-encounters';
    version: 1;
    rngState: number;
    lastProbeStep: number;
    lastEncounterStep: number | null;
    misses: number;
    history: string[];
    lastSpawnSteps: Array<[string, number]>;
}

export interface FormationConstraints {
    seed: number | string;
    isWalkable?: (point: Vec3Like) => boolean;
    isVisibleFromPlayer?: (point: Vec3Like) => boolean;
    avoidVisible?: boolean;
    minDistance?: number;
    maxDistance?: number;
    maxAttempts?: number;
}

export interface FormationResult {
    positions: Vec3Like[];
    complete: boolean;
}
