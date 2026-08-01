import {
    compareNormalizedUtf8,
    type SemanticCommandProposal,
    validateSemanticCommandProposal,
} from '../proposals/semantic.js';

export const AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA = 'arcade-ai-yuka-dispatch-envelope/v1' as const;

export type StrictSoloJsonValue =
    | boolean
    | number
    | string
    | null
    | readonly StrictSoloJsonValue[]
    | { readonly [key: string]: StrictSoloJsonValue };

/** Legal command output of the trusted compiler. Cross-map movement is intentionally absent. */
export type StrictSoloAICommand =
    | Readonly<{
        type: 'move';
        entityId: string;
        vector: Readonly<{ x: number; y: number }>;
        speed?: number;
        source: 'ai';
    }>
    | Readonly<{ type: 'stop'; entityId: string; source: 'ai' }>
    | Readonly<{
        type: 'action';
        entityId: string;
        action: string;
        payload?: StrictSoloJsonValue;
        source: 'ai';
    }>;

export interface AICommandDispatchEnvelope {
    readonly schema: typeof AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA;
    readonly streamId: string;
    readonly decisionOrdinal: number;
    readonly proposalId: string;
    readonly bindingId: string;
    readonly rulesTick: number;
    readonly observationDigest: string;
    readonly expectedRulesRevisionSha256: string;
    readonly semanticProposal: SemanticCommandProposal;
}

export interface AICommandDispatchContext {
    readonly rulesTick: number;
    readonly observationDigest: string;
    readonly rulesRevisionSha256: string;
}

export interface CreateAICommandDispatchEnvelopeOptions {
    readonly proposal: unknown;
    readonly rulesTick: number;
    readonly expectedRulesRevisionSha256: string;
}

/** Trusted game-side binding resolver. It receives only the detached frozen proposal. */
export type TrustedAICommandCompiler = (proposal: SemanticCommandProposal) => unknown;

export type AICommandEnvelopeValidationCode =
    | 'INVALID_ENVELOPE_SHAPE'
    | 'INVALID_ENVELOPE_SCHEMA'
    | 'INVALID_OBSERVATION_DIGEST'
    | 'INVALID_RULES_TICK'
    | 'INVALID_RULES_REVISION'
    | 'INVALID_COMMAND'
    | 'COMMAND_TYPE_FORBIDDEN'
    | 'COMMAND_SOURCE_FORBIDDEN'
    | 'INVALID_COMMAND_PAYLOAD';

export class AICommandEnvelopeValidationError extends TypeError {
    readonly code: AICommandEnvelopeValidationCode;

    constructor(code: AICommandEnvelopeValidationCode, message: string) {
        super(message);
        this.name = 'AICommandEnvelopeValidationError';
        this.code = code;
    }
}

const ENVELOPE_KEYS = [
    'schema',
    'streamId',
    'decisionOrdinal',
    'proposalId',
    'bindingId',
    'rulesTick',
    'observationDigest',
    'expectedRulesRevisionSha256',
    'semanticProposal',
] as const;
const DIGEST = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

const fail = (code: AICommandEnvelopeValidationCode, message: string): never => {
    throw new AICommandEnvelopeValidationError(code, message);
};

const plainRecord = (
    value: unknown,
    label: string,
    code: AICommandEnvelopeValidationCode = 'INVALID_ENVELOPE_SHAPE',
): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return fail(code, `${label} must be a plain object`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        return fail(code, `${label} must not retain a custom prototype`);
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
        return fail(code, `${label} must not contain symbol keys`);
    }
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
        if (!('value' in descriptor) || !descriptor.enumerable) {
            return fail(code, `${label}.${key} must be an enumerable data property`);
        }
    }
    return value as Record<string, unknown>;
};

const exactKeys = (
    record: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[],
    label: string,
    code: AICommandEnvelopeValidationCode,
): void => {
    const allowed = new Set([...required, ...optional]);
    for (const key of Object.keys(record)) {
        if (!allowed.has(key)) fail(code, `${label} contains unknown field ${key}`);
    }
    for (const key of required) {
        if (!Object.hasOwn(record, key)) fail(code, `${label} is missing field ${key}`);
    }
};

const stableString = (value: unknown, label: string, code: AICommandEnvelopeValidationCode): string => {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        value !== value.normalize('NFC') ||
        CONTROL_CHARACTER.test(value) ||
        LONE_SURROGATE.test(value)
    ) {
        return fail(code, `${label} must be a nonempty NFC string without control characters or lone surrogates`);
    }
    return value;
};

const safeOrdinal = (
    value: unknown,
    label: string,
    code: 'INVALID_ENVELOPE_SHAPE' | 'INVALID_RULES_TICK' = 'INVALID_ENVELOPE_SHAPE',
): number => {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        return fail(code, `${label} must be a nonnegative safe integer`);
    }
    return value as number;
};

const digest = (
    value: unknown,
    label: string,
    code: 'INVALID_OBSERVATION_DIGEST' | 'INVALID_RULES_REVISION',
): string => typeof value === 'string' && DIGEST.test(value)
    ? value
    : fail(code, `${label} must be 64 lowercase hexadecimal characters`);

const finiteNumber = (value: unknown, label: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fail('INVALID_COMMAND', `${label} must be finite`);
    }
    return value;
};

const detachJson = (value: unknown, label: string, seen: WeakSet<object>): StrictSoloJsonValue => {
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail('INVALID_COMMAND_PAYLOAD', `${label} numbers must be finite`);
        return value;
    }
    if (typeof value === 'string') {
        if (value !== value.normalize('NFC') || LONE_SURROGATE.test(value)) {
            fail('INVALID_COMMAND_PAYLOAD', `${label} strings must be NFC without lone surrogates`);
        }
        return value;
    }
    if (typeof value !== 'object' || value === null) {
        return fail('INVALID_COMMAND_PAYLOAD', `${label} must contain JSON data only`);
    }
    if (seen.has(value)) fail('INVALID_COMMAND_PAYLOAD', `${label} must not contain cycles`);
    seen.add(value);
    if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) {
            fail('INVALID_COMMAND_PAYLOAD', `${label} must be a plain array without symbol keys`);
        }
        const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
        const lengthDescriptor = descriptors.length;
        if (!lengthDescriptor || !('value' in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) {
            fail('INVALID_COMMAND_PAYLOAD', `${label} has an invalid length`);
        }
        const length = lengthDescriptor.value as number;
        const allowed = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
        for (const key of Object.keys(descriptors)) {
            if (!allowed.has(key)) fail('INVALID_COMMAND_PAYLOAD', `${label} contains named property ${key}`);
        }
        const output: StrictSoloJsonValue[] = [];
        for (let index = 0; index < length; index += 1) {
            const descriptor = descriptors[String(index)];
            if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
                fail('INVALID_COMMAND_PAYLOAD', `${label}[${index}] must be an enumerable data property`);
            }
            output.push(detachJson(descriptor.value, `${label}[${index}]`, seen));
        }
        seen.delete(value);
        return Object.freeze(output);
    }
    const record = plainRecord(value, label, 'INVALID_COMMAND_PAYLOAD');
    const output: Record<string, StrictSoloJsonValue> = {};
    for (const key of Object.keys(record).sort(compareNormalizedUtf8)) {
        if (key !== key.normalize('NFC') || LONE_SURROGATE.test(key)) {
            fail('INVALID_COMMAND_PAYLOAD', `${label} keys must be NFC without lone surrogates`);
        }
        output[key] = detachJson(record[key], `${label}.${key}`, seen);
    }
    seen.delete(value);
    return Object.freeze(output);
};

/** Validate and detach the trusted compiler's command output. */
export const validateStrictSoloAICommand = (value: unknown): StrictSoloAICommand => {
    const command = plainRecord(value, 'command', 'INVALID_COMMAND');
    if (command.type === 'teleport' || command.type === 'transfer-map') {
        fail('COMMAND_TYPE_FORBIDDEN', `strict AI dispatch forbids ${command.type}`);
    }
    if (command.source !== 'ai') fail('COMMAND_SOURCE_FORBIDDEN', 'strict AI commands require source ai');
    const entityId = stableString(command.entityId, 'command.entityId', 'INVALID_COMMAND');
    switch (command.type) {
        case 'move': {
            exactKeys(command, ['type', 'entityId', 'vector', 'source'], ['speed'], 'command', 'INVALID_COMMAND');
            const vector = plainRecord(command.vector, 'command.vector', 'INVALID_COMMAND');
            exactKeys(vector, ['x', 'y'], [], 'command.vector', 'INVALID_COMMAND');
            const speed = command.speed === undefined ? undefined : finiteNumber(command.speed, 'command.speed');
            if (speed !== undefined && speed < 0) fail('INVALID_COMMAND', 'command.speed must not be negative');
            return Object.freeze({
                type: 'move',
                entityId,
                vector: Object.freeze({
                    x: finiteNumber(vector.x, 'command.vector.x'),
                    y: finiteNumber(vector.y, 'command.vector.y'),
                }),
                ...(speed === undefined ? {} : { speed }),
                source: 'ai',
            });
        }
        case 'stop':
            exactKeys(command, ['type', 'entityId', 'source'], [], 'command', 'INVALID_COMMAND');
            return Object.freeze({ type: 'stop', entityId, source: 'ai' });
        case 'action': {
            exactKeys(command, ['type', 'entityId', 'action', 'source'], ['payload'], 'command', 'INVALID_COMMAND');
            const action = stableString(command.action, 'command.action', 'INVALID_COMMAND');
            const payload = Object.hasOwn(command, 'payload')
                ? detachJson(command.payload, 'command.payload', new WeakSet())
                : undefined;
            return Object.freeze({
                type: 'action',
                entityId,
                action,
                ...(payload === undefined ? {} : { payload }),
                source: 'ai',
            });
        }
        default:
            return fail('INVALID_COMMAND', 'strict AI command type must be move, stop, or action');
    }
};

/** Freeze a complete semantic proposal and its concurrency metadata for final trusted dispatch. */
export const createAICommandDispatchEnvelope = (
    options: CreateAICommandDispatchEnvelopeOptions,
): AICommandDispatchEnvelope => {
    const proposal = validateSemanticCommandProposal(options.proposal);
    return Object.freeze({
        schema: AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA,
        streamId: proposal.streamId,
        decisionOrdinal: proposal.decisionOrdinal,
        proposalId: proposal.proposalId,
        bindingId: proposal.bindingId,
        rulesTick: safeOrdinal(options.rulesTick, 'rulesTick', 'INVALID_RULES_TICK'),
        observationDigest: proposal.observationDigest,
        expectedRulesRevisionSha256: digest(
            options.expectedRulesRevisionSha256,
            'expectedRulesRevisionSha256',
            'INVALID_RULES_REVISION',
        ),
        semanticProposal: proposal,
    });
};

/** Revalidate and detach an envelope supplied across an integration boundary. */
export const validateAICommandDispatchEnvelope = (value: unknown): AICommandDispatchEnvelope => {
    const envelope = plainRecord(value, 'envelope');
    exactKeys(envelope, ENVELOPE_KEYS, [], 'envelope', 'INVALID_ENVELOPE_SHAPE');
    if (envelope.schema !== AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA) {
        fail('INVALID_ENVELOPE_SCHEMA', `schema must be ${AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA}`);
    }
    const proposal = validateSemanticCommandProposal(envelope.semanticProposal);
    const observationDigest = digest(envelope.observationDigest, 'observationDigest', 'INVALID_OBSERVATION_DIGEST');
    const decisionOrdinal = safeOrdinal(envelope.decisionOrdinal, 'decisionOrdinal');
    const streamId = stableString(envelope.streamId, 'streamId', 'INVALID_ENVELOPE_SHAPE');
    const proposalId = stableString(envelope.proposalId, 'proposalId', 'INVALID_ENVELOPE_SHAPE');
    const bindingId = stableString(envelope.bindingId, 'bindingId', 'INVALID_ENVELOPE_SHAPE');
    if (
        streamId !== proposal.streamId ||
        decisionOrdinal !== proposal.decisionOrdinal ||
        proposalId !== proposal.proposalId ||
        bindingId !== proposal.bindingId ||
        observationDigest !== proposal.observationDigest
    ) {
        fail('INVALID_ENVELOPE_SHAPE', 'envelope identity fields must equal its semantic proposal');
    }
    return Object.freeze({
        schema: AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA,
        streamId,
        decisionOrdinal,
        proposalId,
        bindingId,
        rulesTick: safeOrdinal(envelope.rulesTick, 'rulesTick', 'INVALID_RULES_TICK'),
        observationDigest,
        expectedRulesRevisionSha256: digest(
            envelope.expectedRulesRevisionSha256,
            'expectedRulesRevisionSha256',
            'INVALID_RULES_REVISION',
        ),
        semanticProposal: proposal,
    });
};

export const validateAICommandDispatchContext = (value: unknown): AICommandDispatchContext => {
    const context = plainRecord(value, 'dispatch context');
    exactKeys(
        context,
        ['rulesTick', 'observationDigest', 'rulesRevisionSha256'],
        [],
        'dispatch context',
        'INVALID_ENVELOPE_SHAPE',
    );
    const observationDigest = digest(
        context.observationDigest,
        'current observationDigest',
        'INVALID_OBSERVATION_DIGEST',
    );
    return Object.freeze({
        rulesTick: safeOrdinal(context.rulesTick, 'rulesTick', 'INVALID_RULES_TICK'),
        observationDigest,
        rulesRevisionSha256: digest(
            context.rulesRevisionSha256,
            'rulesRevisionSha256',
            'INVALID_RULES_REVISION',
        ),
    });
};
