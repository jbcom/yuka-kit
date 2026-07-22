import { State, WanderBehavior, type Vehicle } from 'yuka';
import type { AIVehicle } from '../../core/types.js';
export interface PatrolStateOptions {
    detectionRange?: number;
    chaseStateId?: string;
}
/**
 * Patrol state: wander randomly.
 * Transitions to the chase state when the target is within detection range.
 * Distances are measured on the XZ plane (yuka's documented 2D convention:
 * pin y to 0 for pure-2D games).
 */
export class PatrolState extends State {
    #wander = new WanderBehavior();
    #target: Vehicle | null = null;
    #detectionRange;
    #chaseStateId;
    constructor(options: PatrolStateOptions = {}) {
        super();
        this.#detectionRange = options.detectionRange ?? 15;
        this.#chaseStateId = options.chaseStateId ?? 'chase';
    }
    /** Set the target vehicle (typically the player) for detection checks. */
    setTarget(target: Vehicle): void {
        this.#target = target;
    }
    enter(owner: Vehicle): void {
        owner.steering.clear();
        owner.steering.add(this.#wander);
    }
    execute(owner: Vehicle): void {
        if (!this.#target)
            return;
        const dx = this.#target.position.x - owner.position.x;
        const dz = this.#target.position.z - owner.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq <= this.#detectionRange * this.#detectionRange) {
            (owner as AIVehicle).stateMachine.changeTo(this.#chaseStateId);
        }
    }
    exit(owner: Vehicle): void {
        owner.steering.remove(this.#wander);
    }
}
