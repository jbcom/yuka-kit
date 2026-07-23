import type { Vec3Like } from '../core/types.js';
import type { AgentIntent } from '../intents.js';

export type GovernorClass = 'hunter' | 'knight' | 'mage';
export type GovernorActionName =
    | 'heal'
    | 'knightStrike'
    | 'knightBlock'
    | 'knightUnblock'
    | 'knightRush'
    | 'knightArea'
    | 'hunterShot'
    | 'hunterTrap'
    | 'hunterRoll'
    | 'hunterRite'
    | 'mageBolt'
    | 'mageArea'
    | 'mageBlink'
    | 'mageWard';

export interface GovernorActorObservation {
    position: Vec3Like;
    hp: number;
    maxHp: number;
    resource: number;
    maxResource: number;
    healAvailable?: boolean;
    abilities?: ReadonlySet<string>;
    /** Omit for backward-compatible always-ready behavior; an empty set means no class action is legal now. */
    readyActions?: ReadonlySet<GovernorActionName>;
    /** Exact movement legality reported by the authoritative runtime. Defaults to true. */
    movementAvailable?: boolean;
    guarding?: boolean;
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

export interface GovernorActionBinding {
    action: string;
    payload?: Record<string, unknown>;
}

export type GovernorAction = string | GovernorActionBinding;

export interface GovernorActions extends Record<GovernorActionName, GovernorAction> {
    heal: GovernorAction;
    knightStrike: GovernorAction;
    knightBlock: GovernorAction;
    knightUnblock: GovernorAction;
    knightRush: GovernorAction;
    knightArea: GovernorAction;
    hunterShot: GovernorAction;
    hunterTrap: GovernorAction;
    hunterRoll: GovernorAction;
    hunterRite: GovernorAction;
    mageBolt: GovernorAction;
    mageArea: GovernorAction;
    mageBlink: GovernorAction;
    mageWard: GovernorAction;
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
