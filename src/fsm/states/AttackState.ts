import { ArriveBehavior, State, Vector3, type Vehicle } from 'yuka';
import { getDt } from '../dt.js';
import type { AIVehicle } from '../../core/types.js';
export interface AttackStateOptions {
    chaseRange?: number;
    attackCooldown?: number;
    arriveDeceleration?: number;
    arriveTolerance?: number;
    chaseStateId?: string;
}
/**
 * Attack state: close distance with ArriveBehavior and fire `onAttack` on a
 * cooldown. Transitions back to chase when the target leaves attack range.
 *
 * The cooldown reads frame dt from the `_dt` tag the game loop stores on the
 * vehicle via `setDt()` (see fsm/dt.ts / AIBridge.setDt); it falls back to
 * 1/60 when never set.
 */
export class AttackState extends State {
    #arrive: ArriveBehavior | null = null;
    #target: Vehicle | null = null;
    #cooldownRemaining = 0;
    #targetPos = new Vector3();
    #chaseRange;
    #attackCooldown;
    #arriveDeceleration;
    #arriveTolerance;
    #chaseStateId;
    /** Callback invoked when an attack fires. Wire to the game's combat system. */
    onAttack: ((owner: Vehicle) => void) | null = null;
    constructor(options: AttackStateOptions = {}) {
        super();
        this.#chaseRange = options.chaseRange ?? 4;
        this.#attackCooldown = options.attackCooldown ?? 1.0;
        this.#arriveDeceleration = options.arriveDeceleration ?? 3;
        this.#arriveTolerance = options.arriveTolerance ?? 0.5;
        this.#chaseStateId = options.chaseStateId ?? 'chase';
    }
    /** Set the target vehicle to attack. */
    setTarget(target: Vehicle): void {
        this.#target = target;
    }
    enter(owner: Vehicle): void {
        owner.steering.clear();
        this.#arrive = new ArriveBehavior(this.#targetPos, this.#arriveDeceleration, this.#arriveTolerance);
        owner.steering.add(this.#arrive);
        this.#cooldownRemaining = 0;
    }
    execute(owner: Vehicle): void {
        if (!this.#target)
            return;
        // Track the target's live position with the arrive target
        this.#targetPos.copy(this.#target.position);
        const dx = this.#target.position.x - owner.position.x;
        const dz = this.#target.position.z - owner.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > this.#chaseRange * this.#chaseRange) {
            (owner as AIVehicle).stateMachine.changeTo(this.#chaseStateId);
            return;
        }
        this.#cooldownRemaining -= getDt(owner);
        if (this.#cooldownRemaining <= 0) {
            this.#cooldownRemaining = this.#attackCooldown;
            this.onAttack?.(owner);
        }
    }
    exit(owner: Vehicle): void {
        if (this.#arrive) {
            owner.steering.remove(this.#arrive);
            this.#arrive = null;
        }
    }
}
