import { GameEntity, GoalEvaluator, Think, type GameEntity as YukaEntity } from 'yuka';
import type { Vec3Like } from '../core/types.js';
import type { AgentIntent } from '../intents.js';

export interface RoutineDestination {
    mapId: string;
    position: Vec3Like;
    /** Optional semantic anchor identity for public transition validation. */
    anchorId?: string;
    action?: string;
    payload?: unknown;
}

export interface RoutineScheduleEntry extends RoutineDestination {
    id: string;
    startMinute: number;
    endMinute: number;
}

export interface StateAwareRoutineScheduleEntry extends RoutineDestination {
    id: string;
    /** Optional inclusive lower bound; omit both bounds for an all-day slot. */
    startMinute?: number;
    /** Optional exclusive upper bound; either bound may stand alone. */
    endMinute?: number;
    /** State-aware selectors are opt-in through `slotSelection: 'state-aware'`. */
    when?: RoutineSlotConditions;
    /** Consider this slot only when no matching primary slot exists. */
    fallback?: boolean;
}

export interface RoutineSchedule {
    home: RoutineDestination;
    entries: readonly RoutineScheduleEntry[];
}

export interface StateAwareRoutineSchedule {
    /** Ignored by strict selection; optional only for easy migration from a legacy schedule. */
    home?: RoutineDestination;
    entries: readonly StateAwareRoutineScheduleEntry[];
}

export interface RoutineObservation {
    day: number;
    minuteOfDay: number;
    mapId: string;
    position: Vec3Like;
    /** Public authored phase, never a raw rules or narrative-memory object. */
    phaseId?: string;
    /** Public, already-accepted cues in the observed projection. */
    activeCueIds?: readonly string[];
    /** Scalar-only public facts used by declarative preconditions. */
    publicState?: Readonly<Record<string, RoutinePublicValue>>;
    /** Optional authoritative tick for command receipts and idempotency payloads. */
    observationTick?: number;
}

export type RoutinePublicValue = string | number | boolean | null;

export type RoutinePublicPrecondition =
    | { key: string; operator: 'equals' | 'not-equals'; value: RoutinePublicValue }
    | { key: string; operator: 'one-of' | 'not-one-of'; values: readonly RoutinePublicValue[] }
    | { key: string; operator: 'exists' | 'missing' };

/**
 * Declarative selectors over one immutable public observation. Callback
 * predicates are intentionally excluded so consumers cannot smuggle mutable
 * engine state or hidden narrative memory into routine selection.
 */
export interface RoutineSlotConditions {
    /** One exact phase. Mutually exclusive with `phaseIds`. */
    phaseId?: string;
    /** Any one of these exact phases. Mutually exclusive with `phaseId`. */
    phaseIds?: readonly string[];
    /** Exact authored diegetic day numbers accepted by this slot. */
    days?: readonly number[];
    requiredCueIds?: readonly string[];
    forbiddenCueIds?: readonly string[];
    publicPreconditions?: readonly RoutinePublicPrecondition[];
}

export interface ResolvedRoutineTarget extends RoutineDestination {
    id: string;
    isHome: boolean;
}

export interface RoutineDecision {
    target: ResolvedRoutineTarget;
    intent: AgentIntent;
    activityKey?: string;
}

interface RoutineAgentBaseOptions {
    arrivalRadius?: number;
    /**
     * Opt-in conversion of cross-map decisions to a public action intent.
     * Omitting this mapper preserves the original `transfer-map` intent.
     */
    mapCrossMapTransition?: RoutineCrossMapTransitionMapper;
}

export type RoutineAgentOptions = RoutineAgentBaseOptions & (
    | {
        schedule: RoutineSchedule;
        /** Defaults to the original ordered first-clock-match behavior. */
        slotSelection?: 'ordered-clock';
    }
    | {
        schedule: StateAwareRoutineSchedule;
        slotSelection: 'state-aware';
    }
);

export type RoutineActionIntent = Extract<AgentIntent, { kind: 'action' }>;

export interface RoutineCrossMapTransitionContext {
    readonly observation: Readonly<RoutineObservation>;
    readonly target: Readonly<Pick<
        ResolvedRoutineTarget,
        'id' | 'isHome' | 'mapId' | 'position' | 'anchorId'
    >>;
}

export type RoutineCrossMapTransitionMapper = (
    context: RoutineCrossMapTransitionContext,
) => RoutineActionIntent;

export interface RoutineAgentSnapshot {
    schema: 'arcade-ai-yuka-routine';
    version: 1;
    completedActivities: string[];
}

interface RoutineOwner extends YukaEntity {
    routine?: {
        observation: RoutineObservation;
        target: ResolvedRoutineTarget;
        completedActivities: ReadonlySet<string>;
        arrivalRadius: number;
    };
    routineDecision?: RoutineDecision;
}

const inInterval = (minute: number, start: number, end: number): boolean => {
    if (start === end) return true;
    return start < end
        ? minute >= start && minute < end
        : minute >= start || minute < end;
};

function validateMinute(minute: unknown, label: string): asserts minute is number {
    if (typeof minute !== 'number'
        || !Number.isInteger(minute) || minute < 0 || minute >= 1_440) {
        throw new TypeError(`${label} must be an integer from 0 through 1439`);
    }
}

const validateDays = (days: readonly number[], label: string): void => {
    if (days.length === 0) throw new TypeError(`${label} must not be empty`);
    const seen = new Set<number>();
    for (const day of days) {
        if (!Number.isInteger(day) || day < 0) {
            throw new TypeError(`${label} must contain non-negative integers`);
        }
        if (seen.has(day)) throw new TypeError(`${label} contains duplicate ${day}`);
        seen.add(day);
    }
};

const validateIdentifier = (value: string, label: string): void => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`${label} must be a non-empty string`);
    }
};

function validatePublicValue(value: unknown, label: string): asserts value is RoutinePublicValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    throw new TypeError(`${label} must be a finite scalar public value`);
}

const validateUniqueIdentifiers = (values: readonly string[], label: string): void => {
    const seen = new Set<string>();
    for (const value of values) {
        validateIdentifier(value, label);
        if (seen.has(value)) throw new TypeError(`${label} contains duplicate ${value}`);
        seen.add(value);
    }
};

const validateStateAwareObservation = (observation: RoutineObservation): void => {
    if (!Number.isInteger(observation.day) || observation.day < 0) {
        throw new TypeError('Routine day must be a non-negative integer');
    }
    if (observation.phaseId !== undefined) validateIdentifier(observation.phaseId, 'phaseId');
    validateUniqueIdentifiers(observation.activeCueIds ?? [], 'activeCueIds');
    if (observation.observationTick !== undefined
        && (!Number.isInteger(observation.observationTick) || observation.observationTick < 0)) {
        throw new TypeError('observationTick must be a non-negative integer');
    }
    for (const [key, value] of Object.entries(observation.publicState ?? {})) {
        validateIdentifier(key, 'publicState key');
        validatePublicValue(value, `publicState.${key}`);
    }
};

const validatePrecondition = (precondition: RoutinePublicPrecondition, slotId: string): void => {
    validateIdentifier(precondition.key, `${slotId}.publicPreconditions key`);
    switch (precondition.operator) {
        case 'equals':
        case 'not-equals':
            validatePublicValue(precondition.value, `${slotId}.${precondition.key}.value`);
            return;
        case 'one-of':
        case 'not-one-of':
            if (precondition.values.length === 0) {
                throw new TypeError(`${slotId}.${precondition.key}.values must not be empty`);
            }
            for (const value of precondition.values) {
                validatePublicValue(value, `${slotId}.${precondition.key}.values`);
            }
            return;
        case 'exists':
        case 'missing':
            return;
        default:
            throw new TypeError(`${slotId} has an unsupported public precondition operator`);
    }
};

const validateSlotConditions = (entry: StateAwareRoutineScheduleEntry): void => {
    const conditions = entry.when;
    if (!conditions) return;
    if (conditions.phaseId !== undefined) {
        validateIdentifier(conditions.phaseId, `${entry.id}.phaseId`);
    }
    if (conditions.phaseIds !== undefined) {
        if (conditions.phaseId !== undefined) {
            throw new TypeError(`${entry.id} must not define both phaseId and phaseIds`);
        }
        if (conditions.phaseIds.length === 0) {
            throw new TypeError(`${entry.id}.phaseIds must not be empty`);
        }
        validateUniqueIdentifiers(conditions.phaseIds, `${entry.id}.phaseIds`);
    }
    if (conditions.days !== undefined) validateDays(conditions.days, `${entry.id}.days`);
    validateUniqueIdentifiers(conditions.requiredCueIds ?? [], `${entry.id}.requiredCueIds`);
    validateUniqueIdentifiers(conditions.forbiddenCueIds ?? [], `${entry.id}.forbiddenCueIds`);
    const both = new Set(conditions.requiredCueIds ?? []);
    for (const cueId of conditions.forbiddenCueIds ?? []) {
        if (both.has(cueId)) {
            throw new TypeError(`${entry.id} both requires and forbids cue ${cueId}`);
        }
    }
    const keys = new Set<string>();
    for (const precondition of conditions.publicPreconditions ?? []) {
        validatePrecondition(precondition, entry.id);
        if (keys.has(precondition.key)) {
            throw new TypeError(`${entry.id} has duplicate public precondition ${precondition.key}`);
        }
        keys.add(precondition.key);
    }
};

const preconditionMatches = (
    precondition: RoutinePublicPrecondition,
    publicState: Readonly<Record<string, RoutinePublicValue>>,
): boolean => {
    const present = Object.hasOwn(publicState, precondition.key);
    const actual = publicState[precondition.key];
    switch (precondition.operator) {
        case 'equals':
            return present && Object.is(actual, precondition.value);
        case 'not-equals':
            return present && !Object.is(actual, precondition.value);
        case 'one-of':
            return present && precondition.values.some((value) => Object.is(actual, value));
        case 'not-one-of':
            return present && precondition.values.every((value) => !Object.is(actual, value));
        case 'exists':
            return present;
        case 'missing':
            return !present;
    }
};

const slotMatches = (
    entry: StateAwareRoutineScheduleEntry,
    observation: RoutineObservation,
    activeCues: ReadonlySet<string>,
): boolean => {
    const conditions = entry.when;
    if (!conditions) return true;
    if (conditions.phaseId !== undefined && observation.phaseId !== conditions.phaseId) return false;
    if (conditions.phaseIds !== undefined
        && (observation.phaseId === undefined || !conditions.phaseIds.includes(observation.phaseId))) return false;
    if (conditions.days !== undefined && !conditions.days.includes(observation.day)) return false;
    if ((conditions.requiredCueIds ?? []).some((cueId) => !activeCues.has(cueId))) return false;
    if ((conditions.forbiddenCueIds ?? []).some((cueId) => activeCues.has(cueId))) return false;
    const publicState = observation.publicState ?? {};
    return (conditions.publicPreconditions ?? []).every((condition) => (
        preconditionMatches(condition, publicState)
    ));
};

type RoutineSpecificity = readonly [
    authoredState: number,
    phaseBreadth: number,
    publicPreconditions: number,
    temporalConstraints: number,
];

const phaseBreadthSpecificity = (entry: StateAwareRoutineScheduleEntry): number => {
    if (entry.when?.phaseId !== undefined) return -1;
    if (entry.when?.phaseIds !== undefined) return -entry.when.phaseIds.length;
    return 0;
};

const temporalSpecificity = (entry: StateAwareRoutineScheduleEntry): number => {
    const { startMinute, endMinute } = entry;
    const clockConstraints = startMinute !== undefined && startMinute === endMinute
        ? 0
        : Number(startMinute !== undefined) + Number(endMinute !== undefined);
    return (entry.when?.days === undefined ? 0 : 1) + clockConstraints;
};

const specificity = (entry: StateAwareRoutineScheduleEntry): RoutineSpecificity => [
    (entry.when?.phaseId === undefined && entry.when?.phaseIds === undefined ? 0 : 1)
        + (entry.when?.requiredCueIds?.length ?? 0)
        + (entry.when?.forbiddenCueIds?.length ?? 0),
    phaseBreadthSpecificity(entry),
    entry.when?.publicPreconditions?.length ?? 0,
    temporalSpecificity(entry),
];

const compareSpecificity = (left: RoutineSpecificity, right: RoutineSpecificity): number => {
    const authoredDifference = left[0] - right[0];
    if (authoredDifference !== 0) return authoredDifference;
    if (left[1] !== 0 && right[1] !== 0) {
        const phaseBreadthDifference = left[1] - right[1];
        if (phaseBreadthDifference !== 0) return phaseBreadthDifference;
    }
    return left[2] - right[2] || left[3] - right[3];
};

export class RoutineSlotConflictError extends Error {
    readonly slotIds: readonly string[];

    constructor(slotIds: readonly string[]) {
        const orderedIds = [...slotIds].sort();
        super(`Equal-specificity routine slots match: ${orderedIds.join(', ')}`);
        this.name = 'RoutineSlotConflictError';
        this.slotIds = Object.freeze(orderedIds);
    }
}

export class RoutineSlotNotFoundError extends Error {
    readonly day: number;
    readonly minuteOfDay: number;

    constructor(observation: Pick<RoutineObservation, 'day' | 'minuteOfDay'>) {
        super(`No state-aware routine slot matches day ${observation.day} minute ${observation.minuteOfDay}`);
        this.name = 'RoutineSlotNotFoundError';
        this.day = observation.day;
        this.minuteOfDay = observation.minuteOfDay;
    }
}

export function resolveRoutineTarget(
    schedule: RoutineSchedule,
    minuteOfDay: number,
): ResolvedRoutineTarget {
    validateMinute(minuteOfDay, 'minuteOfDay');
    for (const entry of schedule.entries) {
        validateMinute(entry.startMinute, `${entry.id}.startMinute`);
        validateMinute(entry.endMinute, `${entry.id}.endMinute`);
        if (inInterval(minuteOfDay, entry.startMinute, entry.endMinute)) {
            return { ...entry, isHome: false };
        }
    }
    return { ...schedule.home, id: 'home', isHome: true };
}

/**
 * Resolve one legal slot from phase/cue/public-state conditions. Primary slots
 * always outrank declared fallbacks. Within that group, authored phase/cue
 * constraints outrank public preconditions. An equally specific match is an
 * authoring error, never an array-order tiebreak.
 */
export function resolveStateAwareRoutineTarget(
    schedule: StateAwareRoutineSchedule,
    observation: RoutineObservation,
): ResolvedRoutineTarget {
    validateMinute(observation.minuteOfDay, 'minuteOfDay');
    validateStateAwareObservation(observation);
    const activeCues = new Set(observation.activeCueIds ?? []);
    const ids = new Set<string>();
    const matchingPrimary: StateAwareRoutineScheduleEntry[] = [];
    const matchingFallback: StateAwareRoutineScheduleEntry[] = [];

    for (const entry of schedule.entries) {
        validateIdentifier(entry.id, 'Routine slot id');
        if (entry.anchorId !== undefined) validateIdentifier(entry.anchorId, `${entry.id}.anchorId`);
        if (ids.has(entry.id)) throw new TypeError(`Duplicate routine slot id ${entry.id}`);
        ids.add(entry.id);
        const { startMinute, endMinute } = entry;
        if (startMinute !== undefined) validateMinute(startMinute, `${entry.id}.startMinute`);
        if (endMinute !== undefined) validateMinute(endMinute, `${entry.id}.endMinute`);
        validateSlotConditions(entry);
        if (startMinute !== undefined && endMinute !== undefined
            && !inInterval(observation.minuteOfDay, startMinute, endMinute)) continue;
        if (startMinute !== undefined && endMinute === undefined
            && observation.minuteOfDay < startMinute) continue;
        if (startMinute === undefined && endMinute !== undefined
            && observation.minuteOfDay >= endMinute) continue;
        if (!slotMatches(entry, observation, activeCues)) continue;
        (entry.fallback ? matchingFallback : matchingPrimary).push(entry);
    }

    const candidates = matchingPrimary.length > 0 ? matchingPrimary : matchingFallback;
    if (candidates.length === 0) throw new RoutineSlotNotFoundError(observation);

    let bestSpecificity = specificity(candidates[0]);
    let best = [candidates[0]];
    for (const entry of candidates.slice(1)) {
        const candidateSpecificity = specificity(entry);
        const comparison = compareSpecificity(candidateSpecificity, bestSpecificity);
        if (comparison > 0) {
            bestSpecificity = candidateSpecificity;
            best = [entry];
        } else if (comparison === 0) {
            best.push(entry);
        }
    }
    if (best.length !== 1) throw new RoutineSlotConflictError(best.map((entry) => entry.id));
    return { ...best[0], isHome: false };
}

const planarDistance = (a: Vec3Like, b: Vec3Like): number => Math.hypot(a.x - b.x, a.z - b.z);

class RoutineEvaluator extends GoalEvaluator {
    readonly #score: (owner: RoutineOwner) => number;
    readonly #decide: (owner: RoutineOwner) => RoutineDecision;

    constructor(
        score: (owner: RoutineOwner) => number,
        decide: (owner: RoutineOwner) => RoutineDecision,
    ) {
        super(1);
        this.#score = score;
        this.#decide = decide;
    }

    calculateDesirability(owner: YukaEntity): number {
        return this.#score(owner as RoutineOwner);
    }

    setGoal(owner: YukaEntity): void {
        const routineOwner = owner as RoutineOwner;
        routineOwner.routineDecision = this.#decide(routineOwner);
    }
}

const context = (owner: RoutineOwner): NonNullable<RoutineOwner['routine']> => {
    if (!owner.routine) throw new Error('Routine context has not been supplied');
    return owner.routine;
};

const baseDecision = (owner: RoutineOwner, intent: AgentIntent, activityKey?: string): RoutineDecision => ({
    target: context(owner).target,
    intent,
    activityKey,
});

const transitionContext = (
    observation: RoutineObservation,
    target: ResolvedRoutineTarget,
): RoutineCrossMapTransitionContext => {
    const immutableObservation = Object.freeze({
        ...observation,
        position: Object.freeze({ ...observation.position }),
        ...(observation.activeCueIds === undefined
            ? {}
            : { activeCueIds: Object.freeze([...observation.activeCueIds]) }),
        ...(observation.publicState === undefined
            ? {}
            : { publicState: Object.freeze({ ...observation.publicState }) }),
    });
    const immutableTarget = Object.freeze({
        id: target.id,
        isHome: target.isHome,
        mapId: target.mapId,
        position: Object.freeze({ ...target.position }),
        ...(target.anchorId === undefined ? {} : { anchorId: target.anchorId }),
    });
    return Object.freeze({ observation: immutableObservation, target: immutableTarget });
};

/** Yuka-governed deterministic NPC daily loop. */
export class RoutineAgent {
    readonly brain: Think;
    readonly #owner = new GameEntity() as RoutineOwner;
    readonly #schedule: RoutineSchedule | StateAwareRoutineSchedule;
    readonly #arrivalRadius: number;
    readonly #slotSelection: NonNullable<RoutineAgentOptions['slotSelection']>;
    readonly #mapCrossMapTransition?: RoutineCrossMapTransitionMapper;
    readonly #completedActivities = new Set<string>();

    constructor(options: RoutineAgentOptions) {
        this.#schedule = options.schedule;
        this.#arrivalRadius = Math.max(0.01, options.arrivalRadius ?? 0.5);
        this.#slotSelection = options.slotSelection ?? 'ordered-clock';
        if (this.#slotSelection !== 'ordered-clock' && this.#slotSelection !== 'state-aware') {
            throw new TypeError(`Unsupported routine slot selection ${String(this.#slotSelection)}`);
        }
        if (this.#slotSelection === 'ordered-clock'
            && this.#schedule.entries.some((entry) => (
                'when' in entry || 'fallback' in entry
                || entry.startMinute === undefined || entry.endMinute === undefined
            ))) {
            throw new TypeError('State-aware routine slots require slotSelection: state-aware');
        }
        if (options.mapCrossMapTransition !== undefined
            && typeof options.mapCrossMapTransition !== 'function') {
            throw new TypeError('mapCrossMapTransition must be a function');
        }
        this.#mapCrossMapTransition = options.mapCrossMapTransition;
        this.brain = new Think(this.#owner);
        this.brain.addEvaluator(new RoutineEvaluator(
            (owner) => context(owner).observation.mapId === context(owner).target.mapId ? 0 : 1,
            (owner) => {
                const state = context(owner);
                if (!this.#mapCrossMapTransition) {
                    return baseDecision(owner, {
                        kind: 'transfer-map',
                        mapId: state.target.mapId,
                        position: state.target.position,
                    });
                }
                const intent = this.#mapCrossMapTransition(transitionContext(
                    state.observation,
                    state.target,
                ));
                if (!intent || intent.kind !== 'action'
                    || typeof intent.action !== 'string' || intent.action.trim().length === 0) {
                    throw new TypeError('mapCrossMapTransition must return a non-empty action intent');
                }
                return baseDecision(owner, {
                    kind: 'action',
                    action: intent.action,
                    payload: intent.payload,
                });
            },
        ));
        this.brain.addEvaluator(new RoutineEvaluator(
            (owner) => {
                const state = context(owner);
                if (state.observation.mapId !== state.target.mapId) return 0;
                return planarDistance(state.observation.position, state.target.position) > state.arrivalRadius ? 0.9 : 0;
            },
            (owner) => baseDecision(owner, { kind: 'move-to', target: context(owner).target.position }),
        ));
        this.brain.addEvaluator(new RoutineEvaluator(
            (owner) => {
                const state = context(owner);
                if (!state.target.action) return 0;
                const key = `${state.observation.day}:${state.target.id}`;
                return state.completedActivities.has(key) ? 0 : 0.7;
            },
            (owner) => {
                const state = context(owner);
                const key = `${state.observation.day}:${state.target.id}`;
                return baseDecision(owner, {
                    kind: 'action',
                    action: state.target.action!,
                    payload: state.target.payload,
                }, key);
            },
        ));
        this.brain.addEvaluator(new RoutineEvaluator(
            () => 0.01,
            (owner) => baseDecision(owner, { kind: 'wait', reason: 'routine-dwell' }),
        ));
    }

    decide(observation: RoutineObservation): RoutineDecision {
        validateMinute(observation.minuteOfDay, 'minuteOfDay');
        if (!Number.isInteger(observation.day) || observation.day < 0) {
            throw new TypeError('Routine day must be a non-negative integer');
        }
        const target = this.#slotSelection === 'state-aware'
            ? resolveStateAwareRoutineTarget(this.#schedule as StateAwareRoutineSchedule, observation)
            : resolveRoutineTarget(this.#schedule as RoutineSchedule, observation.minuteOfDay);
        this.#owner.routine = {
            observation,
            target,
            completedActivities: this.#completedActivities,
            arrivalRadius: this.#arrivalRadius,
        };
        this.#owner.routineDecision = undefined;
        this.brain.arbitrate();
        if (!this.#owner.routineDecision) throw new Error('Yuka routine arbitration produced no decision');
        return this.#owner.routineDecision;
    }

    /** Mark a dispatched activity accepted so it executes only once per game day. */
    acknowledge(decision: RoutineDecision, accepted: boolean): void {
        if (accepted && decision.activityKey) this.#completedActivities.add(decision.activityKey);
    }

    resetDay(day: number): void {
        const prefix = `${day}:`;
        for (const key of this.#completedActivities) {
            if (key.startsWith(prefix)) this.#completedActivities.delete(key);
        }
    }

    snapshot(): RoutineAgentSnapshot {
        return {
            schema: 'arcade-ai-yuka-routine',
            version: 1,
            completedActivities: [...this.#completedActivities].sort(),
        };
    }

    restore(snapshot: RoutineAgentSnapshot): void {
        if (snapshot.schema !== 'arcade-ai-yuka-routine' || snapshot.version !== 1) {
            throw new TypeError('Unsupported routine agent snapshot');
        }
        if (!Array.isArray(snapshot.completedActivities)
            || snapshot.completedActivities.some((key) => typeof key !== 'string')) {
            throw new TypeError('Routine snapshot activities must be strings');
        }
        this.#completedActivities.clear();
        for (const key of snapshot.completedActivities) this.#completedActivities.add(key);
    }
}
