import type { Vec3Like } from '../core/types.js';
import type { AgentIntent } from '../intents.js';

export type SoloJsonValue =
    | boolean
    | number
    | string
    | null
    | SoloJsonValue[]
    | { [key: string]: SoloJsonValue };

export type SoloAICommand =
    | { type: 'move'; entityId: string; vector: { x: number; y: number }; speed?: number; source: 'ai' }
    | { type: 'stop'; entityId: string; source: 'ai' }
    | { type: 'transfer-map'; entityId: string; mapId: string; position: { x: number; y: number }; source: 'ai' }
    | { type: 'action'; entityId: string; action: string; payload?: SoloJsonValue; source: 'ai' };

export interface SoloCommandResultLike {
    accepted: boolean;
    tick: number;
    reason?: string;
}

export interface SoloRuntimeCommandPort {
    dispatch(command: SoloAICommand): SoloCommandResultLike;
}

export interface SoloCommandAdapterOptions {
    arrivalTolerance?: number;
}

export interface SoloDispatchOutcome {
    waited: boolean;
    command?: SoloAICommand;
    result?: SoloCommandResultLike;
}

const jsonValue = (value: unknown, seen = new WeakSet<object>()): SoloJsonValue | undefined => {
    if (value === undefined) return undefined;
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError('Solo action payload numbers must be finite');
        return value;
    }
    if (typeof value !== 'object') throw new TypeError('Solo action payload must be JSON serializable');
    if (seen.has(value)) throw new TypeError('Solo action payload must not contain cycles');
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => jsonValue(item, seen) ?? null);
    const output: Record<string, SoloJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
        const resolved = jsonValue(item, seen);
        if (resolved !== undefined) output[key] = resolved;
    }
    return output;
};

const normalize = (x: number, y: number): { x: number; y: number } | undefined => {
    const length = Math.hypot(x, y);
    if (length === 0) return undefined;
    return { x: x / length, y: y / length };
};

/** Maps Yuka XZ-plane intents to the public RPGJS Solo command boundary. */
export class SoloCommandAdapter {
    readonly #runtime: SoloRuntimeCommandPort;
    readonly #arrivalTolerance: number;

    constructor(runtime: SoloRuntimeCommandPort, options: SoloCommandAdapterOptions = {}) {
        this.#runtime = runtime;
        this.#arrivalTolerance = Math.max(0, options.arrivalTolerance ?? 0.25);
    }

    commandFor(entityId: string, currentPosition: Vec3Like, intent: AgentIntent): SoloAICommand | undefined {
        switch (intent.kind) {
            case 'wait':
                return undefined;
            case 'stop':
                return { type: 'stop', entityId, source: 'ai' };
            case 'action': {
                const payload = jsonValue(intent.payload);
                return {
                    type: 'action',
                    entityId,
                    action: intent.action,
                    ...(payload === undefined ? {} : { payload }),
                    source: 'ai',
                };
            }
            case 'transfer-map':
                return {
                    type: 'transfer-map',
                    entityId,
                    mapId: intent.mapId,
                    position: { x: intent.position.x, y: intent.position.z },
                    source: 'ai',
                };
            case 'move-to': {
                const dx = intent.target.x - currentPosition.x;
                const dy = intent.target.z - currentPosition.z;
                if (Math.hypot(dx, dy) <= this.#arrivalTolerance) {
                    return { type: 'stop', entityId, source: 'ai' };
                }
                const vector = normalize(dx, dy)!;
                return {
                    type: 'move',
                    entityId,
                    vector,
                    ...(intent.speed === undefined ? {} : { speed: intent.speed }),
                    source: 'ai',
                };
            }
            case 'move-away': {
                const vector = normalize(
                    currentPosition.x - intent.from.x,
                    currentPosition.z - intent.from.z,
                );
                if (!vector) return { type: 'stop', entityId, source: 'ai' };
                return {
                    type: 'move',
                    entityId,
                    vector,
                    ...(intent.speed === undefined ? {} : { speed: intent.speed }),
                    source: 'ai',
                };
            }
        }
    }

    dispatch(entityId: string, currentPosition: Vec3Like, intent: AgentIntent): SoloDispatchOutcome {
        const command = this.commandFor(entityId, currentPosition, intent);
        if (!command) return { waited: true };
        return { waited: false, command, result: this.#runtime.dispatch(command) };
    }
}

