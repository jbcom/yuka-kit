import type { Vehicle } from 'yuka';
import type { AIVehicle } from '../core/types.js';
import { SoloCommandAdapter, type SoloDispatchOutcome } from './adapter.js';

export interface SoloVehicleEntityState {
    id: string;
    position: { x: number; y: number };
    velocity?: { x: number; y: number };
    moving?: boolean;
    stats?: { hp: number };
}

export interface SoloAIBridgeOptions {
    /** Number of authoritative runtime units represented by one Yuka unit. */
    runtimeUnitsPerYukaUnit?: number;
    velocityEpsilon?: number;
    deadStateId?: string;
}

/**
 * Keeps a Yuka vehicle derived from Solo's authoritative state and turns the
 * resulting steering velocity back into public AI-source Solo commands.
 */
export class SoloAIBridge {
    readonly #adapter: SoloCommandAdapter;
    readonly #scale: number;
    readonly #velocityEpsilon: number;
    readonly #deadStateId: string;

    constructor(adapter: SoloCommandAdapter, options: SoloAIBridgeOptions = {}) {
        this.#adapter = adapter;
        this.#scale = Math.max(Number.EPSILON, options.runtimeUnitsPerYukaUnit ?? 1);
        this.#velocityEpsilon = Math.max(0, options.velocityEpsilon ?? 0.0001);
        this.#deadStateId = options.deadStateId ?? 'dead';
    }

    syncFromSolo(vehicle: Vehicle, entity: SoloVehicleEntityState): void {
        vehicle.position.set(entity.position.x / this.#scale, 0, entity.position.y / this.#scale);
        if (entity.velocity) {
            vehicle.velocity.set(entity.velocity.x / this.#scale, 0, entity.velocity.y / this.#scale);
        }
        if ((entity.stats?.hp ?? 1) > 0) return;
        const fsm = (vehicle as Partial<AIVehicle>).stateMachine;
        if (fsm && !fsm.in(this.#deadStateId)) fsm.changeTo(this.#deadStateId);
    }

    dispatchToSolo(
        vehicle: Vehicle,
        entity: SoloVehicleEntityState,
        movementAvailable = true,
    ): SoloDispatchOutcome {
        if (!movementAvailable) return { waited: true };
        const speed = Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
        if (speed <= this.#velocityEpsilon) {
            return entity.moving
                ? this.#adapter.dispatch(entity.id, vehicle.position, { kind: 'stop' })
                : { waited: true };
        }
        return this.#adapter.dispatch(entity.id, vehicle.position, {
            kind: 'move-to',
            target: {
                x: vehicle.position.x + vehicle.velocity.x,
                y: 0,
                z: vehicle.position.z + vehicle.velocity.z,
            },
        });
    }
}
