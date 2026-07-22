import type { Vec3Like } from '../core/types.js';
import type { AgentIntent } from '../intents.js';

export type GovernorClass = 'hunter' | 'knight' | 'mage';

export interface GovernorActorObservation {
    position: Vec3Like;
    hp: number;
    maxHp: number;
    resource: number;
    maxResource: number;
    healAvailable?: boolean;
    abilities?: ReadonlySet<string>;
}

export interface GovernorEnemyObservation {
    id: string;
    position: Vec3Like;
    hp: number;
    maxHp: number;
    threat?: number;
    telegraphing?: boolean;
    lineOfSight?: boolean;
    clusterSize?: number;
}

export interface GovernorObjective {
    id: string;
    position: Vec3Like;
    arrivalRadius?: number;
    action?: string;
    payload?: unknown;
}

export interface GovernorInteractable {
    id: string;
    position: Vec3Like;
    action: string;
    payload?: unknown;
    radius?: number;
}

export interface GovernorObservation {
    actor: GovernorActorObservation;
    enemies: readonly GovernorEnemyObservation[];
    objective?: GovernorObjective;
    interactable?: GovernorInteractable;
    explorationTargets?: readonly Vec3Like[];
}

export interface GovernorActions {
    heal: string;
    knightStrike: string;
    knightBlock: string;
    hunterShot: string;
    hunterTrap: string;
    mageBolt: string;
    mageArea: string;
    mageBlink: string;
}

export interface ClassGovernorOptions {
    className: GovernorClass;
    actions?: Partial<GovernorActions>;
    healThreshold?: number;
    interactionRadius?: number;
}

export interface GovernorDecision {
    className: GovernorClass;
    goal: 'combat' | 'explore' | 'idle' | 'interact' | 'objective' | 'survive';
    intent: AgentIntent;
}

