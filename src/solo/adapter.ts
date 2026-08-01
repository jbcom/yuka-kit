import type { Vec3Like } from '../core/types.js';
import type { AgentIntent } from '../intents.js';
import {
    type AICommandDispatchContext,
    type AICommandDispatchEnvelope,
    type StrictSoloAICommand,
    type StrictSoloJsonValue,
    type TrustedAICommandCompiler,
    validateAICommandDispatchContext,
    validateAICommandDispatchEnvelope,
    validateStrictSoloAICommand,
} from './strict.js';

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
    /** Converts normalized Yuka XZ positions into the runtime's authored world units for map transfers. */
    toRuntimePosition?: (position: Vec3Like) => { x: number; y: number };
    /** Converts an explicit Yuka movement speed into the runtime's authored units. */
    toRuntimeSpeed?: (speed: number) => number;
}

export interface SoloDispatchOutcome {
    waited: boolean;
    command?: SoloAICommand;
    result?: SoloCommandResultLike;
}

export type AIEnvelopeDispatchRejectionCode =
    | 'RULES_TICK_MISMATCH'
    | 'OBSERVATION_DIGEST_MISMATCH'
    | 'RULES_REVISION_MISMATCH';

export type AIEnvelopeDispatchOutcome =
    | Readonly<{
        dispatched: false;
        code: AIEnvelopeDispatchRejectionCode;
        envelope: AICommandDispatchEnvelope;
    }>
    | Readonly<{
        dispatched: true;
        envelope: AICommandDispatchEnvelope;
        command: SoloAICommand;
        result: SoloCommandResultLike;
    }>;

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

const strictJsonToSolo = (value: StrictSoloJsonValue): SoloJsonValue => {
    if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value)) return value.map(strictJsonToSolo);
    const output: Record<string, SoloJsonValue> = {};
    for (const [key, entry] of Object.entries(value)) output[key] = strictJsonToSolo(entry);
    return output;
};

const strictCommandToSolo = (command: StrictSoloAICommand): SoloAICommand => {
    switch (command.type) {
        case 'move':
            return {
                type: 'move',
                entityId: command.entityId,
                vector: { x: command.vector.x, y: command.vector.y },
                ...(command.speed === undefined ? {} : { speed: command.speed }),
                source: 'ai',
            };
        case 'stop':
            return { type: 'stop', entityId: command.entityId, source: 'ai' };
        case 'action':
            return {
                type: 'action',
                entityId: command.entityId,
                action: command.action,
                ...(command.payload === undefined ? {} : { payload: strictJsonToSolo(command.payload) }),
                source: 'ai',
            };
    }
};

/** Maps Yuka XZ-plane intents to the public RPGJS Solo command boundary. */
export class SoloCommandAdapter {
    readonly #runtime: SoloRuntimeCommandPort;
    readonly #arrivalTolerance: number;
    readonly #toRuntimePosition: NonNullable<SoloCommandAdapterOptions['toRuntimePosition']>;
    readonly #toRuntimeSpeed: NonNullable<SoloCommandAdapterOptions['toRuntimeSpeed']>;

    constructor(runtime: SoloRuntimeCommandPort, options: SoloCommandAdapterOptions = {}) {
        this.#runtime = runtime;
        this.#arrivalTolerance = Math.max(0, options.arrivalTolerance ?? 0.25);
        this.#toRuntimePosition = options.toRuntimePosition ?? ((position) => ({
            x: position.x,
            y: position.z,
        }));
        this.#toRuntimeSpeed = options.toRuntimeSpeed ?? ((speed) => speed);
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
                    position: this.#toRuntimePosition(intent.position),
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
                    ...(intent.speed === undefined ? {} : { speed: this.#toRuntimeSpeed(intent.speed) }),
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
                    ...(intent.speed === undefined ? {} : { speed: this.#toRuntimeSpeed(intent.speed) }),
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

    /**
     * Revalidate a strict proposal envelope against current public state, then
     * invoke the trusted compiler and dispatch its legal move/stop/action.
     *
     * Legacy intent dispatch remains available through {@link dispatch}.
     */
    dispatchEnvelope(
        envelope: unknown,
        current: AICommandDispatchContext,
        compile: TrustedAICommandCompiler,
    ): AIEnvelopeDispatchOutcome {
        const validatedEnvelope = validateAICommandDispatchEnvelope(envelope);
        const validatedCurrent = validateAICommandDispatchContext(current);
        if (validatedEnvelope.rulesTick !== validatedCurrent.rulesTick) {
            return Object.freeze({
                dispatched: false,
                code: 'RULES_TICK_MISMATCH',
                envelope: validatedEnvelope,
            });
        }
        if (validatedEnvelope.observationDigest !== validatedCurrent.observationDigest) {
            return Object.freeze({
                dispatched: false,
                code: 'OBSERVATION_DIGEST_MISMATCH',
                envelope: validatedEnvelope,
            });
        }
        if (validatedEnvelope.expectedRulesRevisionSha256 !== validatedCurrent.rulesRevisionSha256) {
            return Object.freeze({
                dispatched: false,
                code: 'RULES_REVISION_MISMATCH',
                envelope: validatedEnvelope,
            });
        }
        if (typeof compile !== 'function') {
            throw new TypeError('dispatchEnvelope requires a trusted compiler function');
        }
        const command = strictCommandToSolo(validateStrictSoloAICommand(
            compile(validatedEnvelope.semanticProposal),
        ));
        return Object.freeze({
            dispatched: true,
            envelope: validatedEnvelope,
            command,
            result: this.#runtime.dispatch(command),
        });
    }
}
