import { FleeBehavior, State, type Vehicle } from 'yuka';
import type { AIVehicle } from '../../core/types.js';
export interface FleeStateOptions {
    safeRange?: number;
    panicDistance?: number;
    returnStateId?: string;
}
/**
 * Flee state: run away from the target until beyond the safe range, then
 * return to the configured state. The FleeBehavior tracks the target's live
 * position (yuka keeps the Vector3 reference).
 */
export class FleeState extends State {
    #flee: FleeBehavior | null = null;
    #target: Vehicle | null = null;
    #safeRange;
    #panicDistance;
    #returnStateId;
    constructor(options: FleeStateOptions = {}) {
        super();
        this.#safeRange = options.safeRange ?? 20;
        this.#panicDistance = options.panicDistance ?? this.#safeRange;
        this.#returnStateId = options.returnStateId ?? 'patrol';
    }
    /** Set the vehicle to flee from. */
    setTarget(target: Vehicle): void {
        this.#target = target;
    }
    enter(owner: Vehicle): void {
        owner.steering.clear();
        if (this.#target) {
            this.#flee = new FleeBehavior(this.#target.position, this.#panicDistance);
            owner.steering.add(this.#flee);
        }
    }
    execute(owner: Vehicle): void {
        if (!this.#target)
            return;
        const dx = this.#target.position.x - owner.position.x;
        const dz = this.#target.position.z - owner.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > this.#safeRange * this.#safeRange) {
            (owner as AIVehicle).stateMachine.changeTo(this.#returnStateId);
        }
    }
    exit(owner: Vehicle): void {
        if (this.#flee) {
            owner.steering.remove(this.#flee);
            this.#flee = null;
        }
    }
}
