import { PursuitBehavior, State, type Vehicle } from 'yuka';
import type { AIVehicle } from '../../core/types.js';
export interface ChaseStateOptions {
    attackRange?: number;
    loseRange?: number;
    attackStateId?: string;
    patrolStateId?: string;
}
/**
 * Chase state: pursue the target.
 * Transitions to the attack state when in melee range,
 * back to patrol when the target escapes beyond the lose range.
 */
export class ChaseState extends State {
    #pursuit: PursuitBehavior | null = null;
    #target: Vehicle | null = null;
    #attackRange;
    #loseRange;
    #attackStateId;
    #patrolStateId;
    constructor(options: ChaseStateOptions = {}) {
        super();
        this.#attackRange = options.attackRange ?? 2.5;
        this.#loseRange = options.loseRange ?? 25;
        this.#attackStateId = options.attackStateId ?? 'attack';
        this.#patrolStateId = options.patrolStateId ?? 'patrol';
    }
    /** Set the target vehicle to pursue. */
    setTarget(target: Vehicle): void {
        this.#target = target;
    }
    enter(owner: Vehicle): void {
        owner.steering.clear();
        if (this.#target) {
            this.#pursuit = new PursuitBehavior(this.#target);
            owner.steering.add(this.#pursuit);
        }
    }
    execute(owner: Vehicle): void {
        if (!this.#target)
            return;
        const dx = this.#target.position.x - owner.position.x;
        const dz = this.#target.position.z - owner.position.z;
        const distSq = dx * dx + dz * dz;
        const fsm = (owner as AIVehicle).stateMachine;
        if (distSq <= this.#attackRange * this.#attackRange) {
            fsm.changeTo(this.#attackStateId);
        }
        else if (distSq > this.#loseRange * this.#loseRange) {
            fsm.changeTo(this.#patrolStateId);
        }
    }
    exit(owner: Vehicle): void {
        if (this.#pursuit) {
            owner.steering.remove(this.#pursuit);
            this.#pursuit = null;
        }
    }
}
