import { getStateName } from '../fsm/createFsm.js';
import { setDt } from '../fsm/dt.js';
import { AIAwareness, AIHearing, AIMemory, AIPerceptionMemory, AIState, Intent } from './traits.js';
import type { HeardNoise } from '../perception/hearing.js';
import type { PerceptionMemoryRecord } from '../perception/memory.js';
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

/**
 * Bidirectional bridge between a koota ECS entity and its backing yuka
 * Vehicle/GameEntity. Games wire one `AIBridge` per world (not per entity) by
 * passing the koota trait types they use for position, velocity, and
 * optional health; the bridge never owns or constructs those traits itself.
 *
 * Typical per-frame usage: call `syncFromKoota()` before stepping yuka AI
 * (pulling in physics-corrected position and health-driven death), then
 * `syncToKoota()` after (pushing yuka's resulting velocity and FSM state name
 * back onto the entity for rendering/animation systems to read).
 */
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
    /** Record a heard noise into the entity's AIHearing trait. */
    rememberNoise(entity: Entity, heard: HeardNoise): void {
        if (!entity.has(AIHearing))
            return;
        entity.set(AIHearing, {
            lastHeardX: heard.event.position.x,
            lastHeardY: heard.event.position.y,
            lastHeardZ: heard.event.position.z,
            lastHeardTime: heard.event.time,
            lastHeardLoudness: heard.perceived,
            lastHeardKind: heard.event.kind,
        });
    }
    /**
     * Mirror the entity's PerceptionMemory onto ECS traits at time `now`: the
     * strongest record into AIAwareness, and that record's last sighting and
     * last noise into AIMemory and AIHearing. Returns the record mirrored, or
     * `null` (AIAwareness is then cleared). Traits the entity lacks are skipped.
     */
    syncPerceptionMemory(entity: Entity, now: number): PerceptionMemoryRecord | null {
        const memory = entity.get(AIPerceptionMemory)?.memory;
        if (!memory)
            return null;
        const strongest = memory.strongest(now);
        if (entity.has(AIAwareness)) {
            const known = strongest && memory.lastKnownPosition(strongest.targetId, now);
            entity.set(AIAwareness, strongest && known
                ? {
                    targetId: strongest.targetId,
                    confidence: strongest.confidence,
                    x: known.position.x,
                    y: known.position.y,
                    z: known.position.z,
                    time: known.time,
                    sense: known.sense,
                }
                : { targetId: '', confidence: 0, x: 0, y: 0, z: 0, time: 0, sense: '' });
        }
        if (strongest?.lastSeen) {
            this.rememberSighting(entity, strongest.lastSeen.position, strongest.lastSeen.time);
        }
        if (strongest?.lastHeard && entity.has(AIHearing)) {
            entity.set(AIHearing, {
                lastHeardX: strongest.lastHeard.position.x,
                lastHeardY: strongest.lastHeard.position.y,
                lastHeardZ: strongest.lastHeard.position.z,
                lastHeardTime: strongest.lastHeard.time,
                lastHeardLoudness: strongest.lastHeard.loudness,
                lastHeardKind: strongest.lastHeard.kind,
            });
        }
        return strongest;
    }
    /** Write the active goal name onto the entity's Intent trait. */
    writeIntent(entity: Entity, goal: string): void {
        if (!entity.has(Intent))
            return;
        entity.set(Intent, { goal });
    }
}
