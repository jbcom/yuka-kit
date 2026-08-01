import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const DETERMINISTIC_IDENTITY_SCHEMA = 'arcade-ai-yuka-identity/v1' as const;

export type DeterministicIdentityKind = 'stream' | 'proposal' | 'receipt';
export type DeterministicIdentityValue =
    | boolean
    | number
    | string
    | null
    | readonly DeterministicIdentityValue[];

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const IDENTITY = /^(stream|proposal|receipt):[0-9a-f]{64}$/;

const identityValue = (value: unknown, label: string): DeterministicIdentityValue => {
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
            throw new TypeError(`${label} numbers must be safe integers without negative zero`);
        }
        return value;
    }
    if (typeof value === 'string') {
        if (value !== value.normalize('NFC') || LONE_SURROGATE.test(value)) {
            throw new TypeError(`${label} strings must be NFC without lone surrogates`);
        }
        return value;
    }
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError(`${label} must contain tuple data only`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    if (Object.getOwnPropertySymbols(value).length !== 0) {
        throw new TypeError(`${label} must not contain symbol keys`);
    }
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !('value' in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) {
        throw new TypeError(`${label} has an invalid length`);
    }
    const length = lengthDescriptor.value as number;
    const allowed = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
    for (const key of Object.keys(descriptors)) {
        if (!allowed.has(key)) throw new TypeError(`${label} contains named property ${key}`);
    }
    const output: DeterministicIdentityValue[] = [];
    for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
            throw new TypeError(`${label}[${index}] must be an enumerable data property`);
        }
        output.push(identityValue(descriptor.value, `${label}[${index}]`));
    }
    return Object.freeze(output);
};

/** Canonical tuple JSON whose UTF-8 bytes are the sole deterministic identity input. */
export const canonicalDeterministicIdentityTuple = (
    kind: DeterministicIdentityKind,
    components: readonly DeterministicIdentityValue[],
): string => {
    if (kind !== 'stream' && kind !== 'proposal' && kind !== 'receipt') {
        throw new TypeError('identity kind must be stream, proposal, or receipt');
    }
    const tuple = identityValue(components, 'components');
    return JSON.stringify([DETERMINISTIC_IDENTITY_SCHEMA, kind, tuple]);
};

/** Browser-safe synchronous SHA-256 identity using the pinned audited noble implementation. */
export const deriveDeterministicIdentity = (
    kind: DeterministicIdentityKind,
    components: readonly DeterministicIdentityValue[],
): string => `${kind}:${bytesToHex(sha256(utf8ToBytes(canonicalDeterministicIdentityTuple(kind, components))))}`;

export const validateDeterministicIdentity = (
    identity: unknown,
    kind: DeterministicIdentityKind,
    components: readonly DeterministicIdentityValue[],
): boolean => typeof identity === 'string' &&
    IDENTITY.test(identity) &&
    identity === deriveDeterministicIdentity(kind, components);
