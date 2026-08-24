import { describe, expect, it } from 'vitest';
import {
    canonicalDeterministicIdentityTuple,
    deriveDeterministicIdentity,
    DETERMINISTIC_IDENTITY_SCHEMA,
    validateDeterministicIdentity,
} from './identity.js';

describe('deterministic identities', () => {
    const components = [
        'qfc-stream/v1',
        'governor:npc-routine',
        7,
        null,
        ['policy:smith', 'scope:forge'],
    ] as const;

    it('canonicalizes tuple values and derives stable typed SHA-256 ids', () => {
        expect(canonicalDeterministicIdentityTuple('stream', components)).toBe(
            '["arcade-ai-yuka-identity/v1","stream",["qfc-stream/v1","governor:npc-routine",7,null,["policy:smith","scope:forge"]]]',
        );
        const streamId = deriveDeterministicIdentity('stream', components);
        expect(streamId).toBe('stream:778f1470bf0c0e3c87d05450da5e85ad43316be961b897d9f0e7d325c7663ebf');
        expect(deriveDeterministicIdentity('stream', components)).toBe(streamId);
        expect(deriveDeterministicIdentity('proposal', components)).not.toBe(streamId);
        expect(validateDeterministicIdentity(streamId, 'stream', components)).toBe(true);
        expect(validateDeterministicIdentity(streamId, 'stream', [...components, 'changed'])).toBe(false);
        expect(validateDeterministicIdentity({ id: streamId }, 'stream', components)).toBe(false);
    });

    it.each([
        ['floating number', [1.5]],
        ['negative zero', [-0]],
        ['object field', [{ hidden: true }]],
        ['function', [() => undefined]],
        ['non-NFC string', ['e\u0301']],
    ])('rejects %s', (_name, invalid) => {
        expect(() => deriveDeterministicIdentity('receipt', invalid as never)).toThrow(TypeError);
    });

    it('rejects sparse, accessor-backed, and named-property tuples before reading entries', () => {
        const sparse = new Array(1);
        expect(() => deriveDeterministicIdentity('stream', sparse)).toThrow('enumerable data property');

        let getterReads = 0;
        const accessor: unknown[] = [];
        Object.defineProperty(accessor, '0', {
            enumerable: true,
            get() {
                getterReads += 1;
                return 'forbidden';
            },
        });
        accessor.length = 1;
        expect(() => deriveDeterministicIdentity('proposal', accessor)).toThrow('enumerable data property');
        expect(getterReads).toBe(0);

        const named = ['ok'];
        Object.assign(named, { extra: 'forbidden' });
        expect(() => deriveDeterministicIdentity('receipt', named)).toThrow('named property extra');
    });

    it('rejects an unrecognized identity kind', () => {
        expect(() => canonicalDeterministicIdentityTuple('unknown' as never, components))
            .toThrow('identity kind must be stream, proposal, or receipt');
    });

    it('rejects a component array carrying symbol keys', () => {
        const withSymbol: unknown[] = ['ok'];
        Object.defineProperty(withSymbol, Symbol('tag'), { value: 'x', enumerable: true });
        expect(() => deriveDeterministicIdentity('stream', withSymbol as never))
            .toThrow('must not contain symbol keys');
    });

    it('validateDeterministicIdentity rejects a string that fails the shape regex', () => {
        expect(validateDeterministicIdentity('not-a-real-identity', 'stream', components)).toBe(false);
        expect(validateDeterministicIdentity(`unknown-kind:${'a'.repeat(64)}`, 'stream', components)).toBe(false);
    });

    it('exposes the schema tag used in canonical tuples', () => {
        expect(DETERMINISTIC_IDENTITY_SCHEMA).toBe('arcade-ai-yuka-identity/v1');
        expect(canonicalDeterministicIdentityTuple('receipt', [1])).toContain(DETERMINISTIC_IDENTITY_SCHEMA);
    });
});
