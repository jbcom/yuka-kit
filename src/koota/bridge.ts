import { getStateName } from '../fsm/createFsm.js';
import { setDt } from '../fsm/dt.js';
import { AIMemory, AIState, Intent } from './traits.js';
import type { Entity, Trait } from 'koota';
import type { Vehicle } from 'yuka';
import type { AIVehicle, Vec3Like } from '../core/types.js';

export type Vec3Schema = { x: number; y: number; z: number };
export type HealthSchema = { current: number; max: number };

export interface AIBridgeTraits {
    Position: Trait<Vec3Schema>;
    Velocity: Trait<Vec3Schema>;
    Health?: Trait<HealthSchema>;
    deadStateId?: string;
}

export class AIBridge {
    #traits: AIBridgeTraits;
    #deadStateId: string;
    constructor(traits: AIBridgeTraits) {
        this.#traits = traits;
        this.#deadStateId = traits.deadStateId ?? 'dead';
    }
    /** Store frame dt on the yuka vehicle so FSM states can read it. */
    setDt(vehicle: Vehicle, dt: number): void {
        setDt(vehicle, dt);
    }
    /** Push yuka results (velocity, FSM state name) onto the koota entity. */
    syncToKoota(vehicle: Vehicle, entity: Entity): void {
        entity.set(this.#traits.Velocity, {
            x: vehicle.velocity.x,
            y: vehicle.velocity.y,
            z: vehicle.velocity.z,
        });
        const fsm = (vehicle as Partial<AIVehicle>).stateMachine;
        const stateName = (fsm && getStateName(fsm)) ?? 'idle';
        if (entity.has(AIState)) {
            entity.set(AIState, { state: stateName });
        }
    }
    /**
     * Pull koota state into yuka: corrected position (e.g. after physics) into
     * vehicle.position; Health.current <= 0 triggers the dead-state transition.
     */
    syncFromKoota(vehicle: Vehicle, entity: Entity): void {
        const pos = entity.get(this.#traits.Position);
        if (pos) {
            vehicle.position.set(pos.x, pos.y, pos.z);
        }
        if (this.#traits.Health) {
            const health = entity.get(this.#traits.Health);
            if (health && health.current <= 0) {
                const fsm = (vehicle as Partial<AIVehicle>).stateMachine;
                if (fsm && !fsm.in(this.#deadStateId)) {
                    fsm.changeTo(this.#deadStateId);
                }
            }
        }
    }
    /** Record a target sighting into the entity's AIMemory trait. */
    rememberSighting(entity: Entity, position: Vec3Like, time: number): void {
        if (!entity.has(AIMemory))
            return;
        entity.set(AIMemory, {
            lastSeenX: position.x,
            lastSeenY: position.y,
            lastSeenZ: position.z,
            lastSeenTime: time,
        });
    }
    /** Write the active goal name onto the entity's Intent trait. */
    writeIntent(entity: Entity, goal: string): void {
        if (!entity.has(Intent))
            return;
        entity.set(Intent, { goal });
    }
}
