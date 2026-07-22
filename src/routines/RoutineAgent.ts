import { GameEntity, GoalEvaluator, Think, type GameEntity as YukaEntity } from 'yuka';
import type { Vec3Like } from '../core/types.js';
import type { AgentIntent } from '../intents.js';

export interface RoutineDestination {
    mapId: string;
    position: Vec3Like;
    action?: string;
    payload?: unknown;
}

export interface RoutineScheduleEntry extends RoutineDestination {
    id: string;
    startMinute: number;
    endMinute: number;
}

export interface RoutineSchedule {
    home: RoutineDestination;
    entries: readonly RoutineScheduleEntry[];
}

export interface RoutineObservation {
    day: number;
    minuteOfDay: number;
    mapId: string;
    position: Vec3Like;
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

export interface RoutineAgentOptions {
    schedule: RoutineSchedule;
    arrivalRadius?: number;
}

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

const validateMinute = (minute: number, label: string): void => {
    if (!Number.isInteger(minute) || minute < 0 || minute >= 1_440) {
        throw new TypeError(`${label} must be an integer from 0 through 1439`);
    }
};

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

/** Yuka-governed deterministic NPC daily loop. */
export class RoutineAgent {
    readonly brain: Think;
    readonly #owner = new GameEntity() as RoutineOwner;
    readonly #schedule: RoutineSchedule;
    readonly #arrivalRadius: number;
    readonly #completedActivities = new Set<string>();

    constructor(options: RoutineAgentOptions) {
        this.#schedule = options.schedule;
        this.#arrivalRadius = Math.max(0.01, options.arrivalRadius ?? 0.5);
        this.brain = new Think(this.#owner);
        this.brain.addEvaluator(new RoutineEvaluator(
            (owner) => context(owner).observation.mapId === context(owner).target.mapId ? 0 : 1,
            (owner) => baseDecision(owner, {
                kind: 'transfer-map',
                mapId: context(owner).target.mapId,
                position: context(owner).target.position,
            }),
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
        const target = resolveRoutineTarget(this.#schedule, observation.minuteOfDay);
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
