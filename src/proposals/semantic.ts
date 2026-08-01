export const SEMANTIC_COMMAND_PROPOSAL_SCHEMA = 'arcade-ai-yuka-semantic-proposal/v1' as const;

export interface SemanticProposalTarget {
    readonly roleId: string;
    /** Stable ordinal authored by the binding's target-role catalog. */
    readonly roleOrdinal: number;
    readonly targetObservationEntryId: string;
}

/**
 * Command-neutral output from a governor decision.
 *
 * The closed shape intentionally has no coordinates, payload, callback,
 * runtime command, or mutable game reference. A trusted integration resolves
 * the stable binding and observation-entry ids after proposal selection.
 */
export interface SemanticCommandProposal {
    readonly schema: typeof SEMANTIC_COMMAND_PROPOSAL_SCHEMA;
    readonly streamId: string;
    readonly decisionOrdinal: number;
    readonly observationDigest: string;
    readonly proposalId: string;
    readonly goalId: string;
    readonly goalOrdinal: number;
    readonly utilityMicros: number;
    readonly bindingId: string;
    readonly bindingOrdinal: number;
    readonly proposalOrdinal: number;
    readonly targets: readonly SemanticProposalTarget[];
    readonly reasonCode: string;
}

export type SemanticProposalValidationCode =
    | 'INVALID_PROPOSAL_SHAPE'
    | 'INVALID_PROPOSAL_SCHEMA'
    | 'INVALID_PROPOSAL_STRING'
    | 'INVALID_OBSERVATION_DIGEST'
    | 'INVALID_PROPOSAL_ORDINAL'
    | 'INVALID_PROPOSAL_UTILITY'
    | 'DUPLICATE_TARGET_ORDINAL'
    | 'DUPLICATE_PROPOSAL_ID'
    | 'MIXED_PROPOSAL_SET';

export class SemanticProposalValidationError extends TypeError {
    readonly code: SemanticProposalValidationCode;

    constructor(code: SemanticProposalValidationCode, message: string) {
        super(message);
        this.name = 'SemanticProposalValidationError';
        this.code = code;
    }
}

export interface SemanticProposalSelection {
    readonly ordered: readonly SemanticCommandProposal[];
    readonly selected: SemanticCommandProposal | null;
}

const PROPOSAL_KEYS = [
    'schema',
    'streamId',
    'decisionOrdinal',
    'observationDigest',
    'proposalId',
    'goalId',
    'goalOrdinal',
    'utilityMicros',
    'bindingId',
    'bindingOrdinal',
    'proposalOrdinal',
    'targets',
    'reasonCode',
] as const;
const TARGET_KEYS = ['roleId', 'roleOrdinal', 'targetObservationEntryId'] as const;
const DIGEST = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const UTF8 = new TextEncoder();

const fail = (code: SemanticProposalValidationCode, message: string): never => {
    throw new SemanticProposalValidationError(code, message);
};

const plainRecord = (value: unknown, label: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return fail('INVALID_PROPOSAL_SHAPE', `${label} must be a plain object`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        return fail('INVALID_PROPOSAL_SHAPE', `${label} must not retain a custom prototype`);
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
        return fail('INVALID_PROPOSAL_SHAPE', `${label} must not contain symbol keys`);
    }
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
        if (!('value' in descriptor) || !descriptor.enumerable) {
            return fail('INVALID_PROPOSAL_SHAPE', `${label}.${key} must be an enumerable data property`);
        }
    }
    return value as Record<string, unknown>;
};

const exactKeys = (record: Record<string, unknown>, keys: readonly string[], label: string): void => {
    const expected = new Set(keys);
    for (const key of Object.keys(record)) {
        if (!expected.has(key)) fail('INVALID_PROPOSAL_SHAPE', `${label} contains unknown field ${key}`);
    }
    for (const key of keys) {
        if (!Object.hasOwn(record, key)) fail('INVALID_PROPOSAL_SHAPE', `${label} is missing field ${key}`);
    }
};

const plainDenseArrayValues = (value: unknown, label: string): unknown[] => {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
        return fail('INVALID_PROPOSAL_SHAPE', `${label} must be a plain array`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    if (Object.getOwnPropertySymbols(value).length !== 0) {
        return fail('INVALID_PROPOSAL_SHAPE', `${label} must not contain symbol keys`);
    }
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !('value' in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) {
        return fail('INVALID_PROPOSAL_SHAPE', `${label} has an invalid length`);
    }
    const length = lengthDescriptor.value as number;
    const allowed = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
    for (const key of Object.keys(descriptors)) {
        if (!allowed.has(key)) fail('INVALID_PROPOSAL_SHAPE', `${label} contains named property ${key}`);
    }
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
            fail('INVALID_PROPOSAL_SHAPE', `${label}[${index}] must be an enumerable data property`);
        }
        output.push(descriptor.value);
    }
    return output;
};

const stableString = (value: unknown, label: string): string => {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        value !== value.normalize('NFC') ||
        CONTROL_CHARACTER.test(value) ||
        LONE_SURROGATE.test(value)
    ) {
        return fail('INVALID_PROPOSAL_STRING', `${label} must be a nonempty NFC string without control characters or lone surrogates`);
    }
    return value;
};

const ordinal = (value: unknown, label: string): number => {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        return fail('INVALID_PROPOSAL_ORDINAL', `${label} must be a nonnegative safe integer`);
    }
    return value as number;
};

const utility = (value: unknown): number => {
    if (!Number.isSafeInteger(value)) {
        return fail('INVALID_PROPOSAL_UTILITY', 'utilityMicros must be a signed safe integer');
    }
    return value as number;
};

const numberOrder = (left: number, right: number): number => left < right ? -1 : left > right ? 1 : 0;

/** Unsigned lexicographic comparison of NFC UTF-8 bytes; never host locale. */
export const compareNormalizedUtf8 = (left: string, right: string): number => {
    if (
        typeof left !== 'string' ||
        typeof right !== 'string' ||
        left !== left.normalize('NFC') ||
        right !== right.normalize('NFC') ||
        LONE_SURROGATE.test(left) ||
        LONE_SURROGATE.test(right)
    ) {
        throw new TypeError('UTF-8 comparison requires NFC strings without lone surrogates');
    }
    const leftBytes = UTF8.encode(left);
    const rightBytes = UTF8.encode(right);
    const length = Math.min(leftBytes.length, rightBytes.length);
    for (let index = 0; index < length; index += 1) {
        const comparison = numberOrder(leftBytes[index], rightBytes[index]);
        if (comparison !== 0) return comparison;
    }
    return numberOrder(leftBytes.length, rightBytes.length);
};

const targetOrder = (left: SemanticProposalTarget, right: SemanticProposalTarget): number =>
    numberOrder(left.roleOrdinal, right.roleOrdinal) ||
    compareNormalizedUtf8(left.roleId, right.roleId) ||
    compareNormalizedUtf8(left.targetObservationEntryId, right.targetObservationEntryId);

const validateTarget = (value: unknown, index: number): SemanticProposalTarget => {
    const record = plainRecord(value, `targets[${index}]`);
    exactKeys(record, TARGET_KEYS, `targets[${index}]`);
    return Object.freeze({
        roleId: stableString(record.roleId, `targets[${index}].roleId`),
        roleOrdinal: ordinal(record.roleOrdinal, `targets[${index}].roleOrdinal`),
        targetObservationEntryId: stableString(
            record.targetObservationEntryId,
            `targets[${index}].targetObservationEntryId`,
        ),
    });
};

/** Validate, detach, canonicalize target order, and deeply freeze a proposal. */
export const validateSemanticCommandProposal = (value: unknown): SemanticCommandProposal => {
    const record = plainRecord(value, 'proposal');
    exactKeys(record, PROPOSAL_KEYS, 'proposal');
    if (record.schema !== SEMANTIC_COMMAND_PROPOSAL_SCHEMA) {
        fail('INVALID_PROPOSAL_SCHEMA', `schema must be ${SEMANTIC_COMMAND_PROPOSAL_SCHEMA}`);
    }
    const targetValues = plainDenseArrayValues(record.targets, 'targets');
    const targets = targetValues.map(validateTarget).sort(targetOrder);
    const targetOrdinals = new Set<number>();
    for (const target of targets) {
        if (targetOrdinals.has(target.roleOrdinal)) {
            fail('DUPLICATE_TARGET_ORDINAL', `duplicate target role ordinal ${target.roleOrdinal}`);
        }
        targetOrdinals.add(target.roleOrdinal);
    }
    const observationDigest = typeof record.observationDigest === 'string' && DIGEST.test(record.observationDigest)
        ? record.observationDigest
        : fail('INVALID_OBSERVATION_DIGEST', 'observationDigest must be 64 lowercase hexadecimal characters');

    return Object.freeze({
        schema: SEMANTIC_COMMAND_PROPOSAL_SCHEMA,
        streamId: stableString(record.streamId, 'streamId'),
        decisionOrdinal: ordinal(record.decisionOrdinal, 'decisionOrdinal'),
        observationDigest,
        proposalId: stableString(record.proposalId, 'proposalId'),
        goalId: stableString(record.goalId, 'goalId'),
        goalOrdinal: ordinal(record.goalOrdinal, 'goalOrdinal'),
        utilityMicros: utility(record.utilityMicros),
        bindingId: stableString(record.bindingId, 'bindingId'),
        bindingOrdinal: ordinal(record.bindingOrdinal, 'bindingOrdinal'),
        proposalOrdinal: ordinal(record.proposalOrdinal, 'proposalOrdinal'),
        targets: Object.freeze(targets),
        reasonCode: stableString(record.reasonCode, 'reasonCode'),
    });
};

const targetKey = (proposal: SemanticCommandProposal): string => JSON.stringify(
    proposal.targets.map(({ roleId, targetObservationEntryId }) => [roleId, targetObservationEntryId]),
);

const compareValidatedProposals = (left: SemanticCommandProposal, right: SemanticCommandProposal): number =>
    numberOrder(left.goalOrdinal, right.goalOrdinal) ||
    numberOrder(right.utilityMicros, left.utilityMicros) ||
    numberOrder(left.bindingOrdinal, right.bindingOrdinal) ||
    numberOrder(left.proposalOrdinal, right.proposalOrdinal) ||
    compareNormalizedUtf8(left.bindingId, right.bindingId) ||
    compareNormalizedUtf8(targetKey(left), targetKey(right)) ||
    compareNormalizedUtf8(left.proposalId, right.proposalId);

/** Total host-independent proposal order used by strict integrations. */
export const compareSemanticCommandProposals = (left: unknown, right: unknown): number =>
    compareValidatedProposals(validateSemanticCommandProposal(left), validateSemanticCommandProposal(right));

/** Validate and return the entire canonical proposal set in deterministic order. */
export const rankSemanticCommandProposals = (
    proposals: readonly unknown[],
): readonly SemanticCommandProposal[] => {
    const validated = plainDenseArrayValues(proposals, 'proposals').map(validateSemanticCommandProposal);
    if (validated.length === 0) return Object.freeze([]);
    const first = validated[0];
    const proposalIds = new Set<string>();
    for (const proposal of validated) {
        if (
            proposal.streamId !== first.streamId ||
            proposal.decisionOrdinal !== first.decisionOrdinal ||
            proposal.observationDigest !== first.observationDigest
        ) {
            fail('MIXED_PROPOSAL_SET', 'one proposal set must share streamId, decisionOrdinal, and observationDigest');
        }
        if (proposalIds.has(proposal.proposalId)) {
            fail('DUPLICATE_PROPOSAL_ID', `duplicate proposalId ${proposal.proposalId}`);
        }
        proposalIds.add(proposal.proposalId);
    }
    return Object.freeze(validated.sort(compareValidatedProposals));
};

/** Return both the deterministic set and its first proposal, or null for NO_DISPATCH. */
export const selectSemanticCommandProposal = (proposals: readonly unknown[]): SemanticProposalSelection => {
    const ordered = rankSemanticCommandProposals(proposals);
    return Object.freeze({ ordered, selected: ordered[0] ?? null });
};
