import { describe, expect, it } from 'vitest';
import {
    compareNormalizedUtf8,
    compareSemanticCommandProposals,
    rankSemanticCommandProposals,
    SEMANTIC_COMMAND_PROPOSAL_SCHEMA,
    selectSemanticCommandProposal,
    SemanticProposalValidationError,
    validateSemanticCommandProposal,
} from './semantic.js';

const digest = 'ab'.repeat(32);
const proposal = (overrides: Record<string, unknown> = {}) => ({
    schema: SEMANTIC_COMMAND_PROPOSAL_SCHEMA,
    streamId: 'stream-1',
    decisionOrdinal: 4,
    observationDigest: digest,
    proposalId: 'proposal-base',
    goalId: 'goal-base',
    goalOrdinal: 2,
    utilityMicros: 500_000,
    bindingId: 'binding-base',
    bindingOrdinal: 3,
    proposalOrdinal: 7,
    targets: [
        { roleId: 'subject', roleOrdinal: 1, targetObservationEntryId: 'entry-subject' },
    ],
    reasonCode: 'BASE',
    ...overrides,
});

describe('strict semantic proposal protocol', () => {
    it('selects one total order independently of source order', () => {
        const candidates = [
            proposal({ proposalId: 'p-proposal', goalOrdinal: 1, utilityMicros: 9, bindingOrdinal: 2, proposalOrdinal: 2 }),
            proposal({ proposalId: 'p-binding', goalOrdinal: 1, utilityMicros: 9, bindingOrdinal: 1, proposalOrdinal: 2 }),
            proposal({ proposalId: 'p-utility-low', goalOrdinal: 1, utilityMicros: 8, bindingOrdinal: 0, proposalOrdinal: 0 }),
            proposal({ proposalId: 'p-goal', goalOrdinal: 0, utilityMicros: -900, bindingOrdinal: 9, proposalOrdinal: 9 }),
            proposal({ proposalId: 'p-utility-high', goalOrdinal: 1, utilityMicros: 10, bindingOrdinal: 9, proposalOrdinal: 9 }),
        ];
        const expected = ['p-goal', 'p-utility-high', 'p-binding', 'p-proposal', 'p-utility-low'];
        expect(rankSemanticCommandProposals(candidates).map(({ proposalId }) => proposalId)).toEqual(expected);
        expect(rankSemanticCommandProposals([...candidates].reverse()).map(({ proposalId }) => proposalId)).toEqual(expected);
        expect(rankSemanticCommandProposals([candidates[2], candidates[4], candidates[0], candidates[3], candidates[1]])
            .map(({ proposalId }) => proposalId)).toEqual(expected);
    });

    it('resolves complete ties through UTF-8 target and proposal ids, never locale order', () => {
        const targetZ = proposal({
            proposalId: 'p-z-target',
            bindingId: 'same',
            targets: [{ roleId: 'target', roleOrdinal: 0, targetObservationEntryId: 'z' }],
        });
        const targetAccent = proposal({
            proposalId: 'p-accent-target',
            bindingId: 'same',
            targets: [{ roleId: 'target', roleOrdinal: 0, targetObservationEntryId: 'é' }],
        });
        const proposalZ = proposal({ proposalId: 'z', bindingId: 'same' });
        const proposalAccent = proposal({ proposalId: 'é', bindingId: 'same' });

        expect(compareNormalizedUtf8('z', 'é')).toBeLessThan(0);
        expect(() => compareNormalizedUtf8('e\u0301', 'é')).toThrow('UTF-8 comparison requires NFC strings');
        expect(rankSemanticCommandProposals([targetAccent, targetZ]).map(({ proposalId }) => proposalId))
            .toEqual(['p-z-target', 'p-accent-target']);
        expect(rankSemanticCommandProposals([proposalAccent, proposalZ]).map(({ proposalId }) => proposalId))
            .toEqual(['z', 'é']);
    });

    it('canonicalizes target role ordinals and freezes detached values', () => {
        const source = proposal({
            targets: [
                { roleId: 'destination', roleOrdinal: 2, targetObservationEntryId: 'entry-b' },
                { roleId: 'actor', roleOrdinal: 0, targetObservationEntryId: 'entry-a' },
            ],
        });
        const validated = validateSemanticCommandProposal(source);
        expect(validated.targets.map(({ roleId }) => roleId)).toEqual(['actor', 'destination']);
        expect(Object.isFrozen(validated)).toBe(true);
        expect(Object.isFrozen(validated.targets)).toBe(true);
        expect(Object.isFrozen(validated.targets[0])).toBe(true);
        source.proposalId = 'mutated-source';
        expect(validated.proposalId).toBe('proposal-base');
    });

    it.each([
        ['negative goal ordinal', { goalOrdinal: -1 }, 'INVALID_PROPOSAL_ORDINAL'],
        ['fractional proposal ordinal', { proposalOrdinal: 1.5 }, 'INVALID_PROPOSAL_ORDINAL'],
        ['unsafe binding ordinal', { bindingOrdinal: Number.MAX_SAFE_INTEGER + 1 }, 'INVALID_PROPOSAL_ORDINAL'],
        ['floating utility', { utilityMicros: 0.1 }, 'INVALID_PROPOSAL_UTILITY'],
        ['non-NFC id', { proposalId: 'e\u0301' }, 'INVALID_PROPOSAL_STRING'],
        ['uppercase digest', { observationDigest: 'AB'.repeat(32) }, 'INVALID_OBSERVATION_DIGEST'],
        [
            'duplicate target role ordinal',
            { targets: [
                { roleId: 'actor', roleOrdinal: 0, targetObservationEntryId: 'a' },
                { roleId: 'target', roleOrdinal: 0, targetObservationEntryId: 'b' },
            ] },
            'DUPLICATE_TARGET_ORDINAL',
        ],
    ])('rejects %s', (_name, overrides, code) => {
        expect(() => validateSemanticCommandProposal(proposal(overrides)))
            .toThrowError(expect.objectContaining({ code }));
    });

    it('rejects unknown raw command material and mutable runtime shapes', () => {
        expect(() => validateSemanticCommandProposal({
            ...proposal(),
            coordinates: { x: 1, y: 2 },
        })).toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
        expect(() => validateSemanticCommandProposal({
            ...proposal(),
            targets: [{
                roleId: 'target', roleOrdinal: 0, targetObservationEntryId: 'entry', callback: () => undefined,
            }],
        })).toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
        expect(() => validateSemanticCommandProposal(Object.assign(Object.create({ runtime: true }), proposal())))
            .toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
    });

    it('rejects duplicate and mixed proposal sets', () => {
        expect(() => rankSemanticCommandProposals([proposal(), proposal()]))
            .toThrowError(expect.objectContaining({ code: 'DUPLICATE_PROPOSAL_ID' }));
        expect(() => rankSemanticCommandProposals([
            proposal(),
            proposal({ proposalId: 'other', observationDigest: 'cd'.repeat(32) }),
        ])).toThrowError(expect.objectContaining({ code: 'MIXED_PROPOSAL_SET' }));
    });

    it('rejects sparse, accessor-backed, and named proposal/target arrays before reading entries', () => {
        const sparse = new Array(1);
        expect(() => rankSemanticCommandProposals(sparse)).toThrowError(
            expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }),
        );

        let getterReads = 0;
        const accessor: unknown[] = [];
        Object.defineProperty(accessor, '0', {
            enumerable: true,
            get() {
                getterReads += 1;
                return proposal();
            },
        });
        accessor.length = 1;
        expect(() => rankSemanticCommandProposals(accessor)).toThrowError(
            expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }),
        );
        expect(getterReads).toBe(0);

        const targets = [{ roleId: 'target', roleOrdinal: 0, targetObservationEntryId: 'entry' }];
        Object.assign(targets, { hidden: 'forbidden' });
        expect(() => validateSemanticCommandProposal(proposal({ targets }))).toThrowError(
            expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }),
        );
    });

    it('returns the complete ordered set and null for NO_DISPATCH', () => {
        const empty = selectSemanticCommandProposal([]);
        expect(empty).toEqual({ ordered: [], selected: null });
        expect(Object.isFrozen(empty.ordered)).toBe(true);

        const selected = selectSemanticCommandProposal([
            proposal({ proposalId: 'later', goalOrdinal: 2 }),
            proposal({ proposalId: 'first', goalOrdinal: 1 }),
        ]);
        expect(selected.ordered.map(({ proposalId }) => proposalId)).toEqual(['first', 'later']);
        expect(selected.selected?.proposalId).toBe('first');
    });

    it('exposes coded validation errors', () => {
        try {
            validateSemanticCommandProposal(proposal({ goalOrdinal: Number.NaN }));
            throw new Error('expected validation failure');
        } catch (error) {
            expect(error).toBeInstanceOf(SemanticProposalValidationError);
            expect((error as SemanticProposalValidationError).code).toBe('INVALID_PROPOSAL_ORDINAL');
        }
    });

    describe('compareSemanticCommandProposals', () => {
        it('validates both sides and orders by the same total order as ranking', () => {
            const higherUtility = proposal({ proposalId: 'high', utilityMicros: 900_000 });
            const lowerUtility = proposal({ proposalId: 'low', utilityMicros: 100_000 });
            expect(compareSemanticCommandProposals(higherUtility, lowerUtility)).toBeLessThan(0);
            expect(compareSemanticCommandProposals(lowerUtility, higherUtility)).toBeGreaterThan(0);
            expect(compareSemanticCommandProposals(higherUtility, proposal({ ...higherUtility }))).toBe(0);
        });

        it('propagates validation errors from either side', () => {
            expect(() => compareSemanticCommandProposals(proposal({ goalOrdinal: -1 }), proposal()))
                .toThrowError(SemanticProposalValidationError);
            expect(() => compareSemanticCommandProposals(proposal(), proposal({ goalOrdinal: -1 })))
                .toThrowError(SemanticProposalValidationError);
        });
    });

    describe('plainRecord shape rejections (reached through proposal validation)', () => {
        it('rejects a non-object proposal value outright', () => {
            expect(() => validateSemanticCommandProposal(null))
                .toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
            expect(() => validateSemanticCommandProposal('not-a-proposal'))
                .toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
            expect(() => validateSemanticCommandProposal(42))
                .toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
            expect(() => validateSemanticCommandProposal([proposal()]))
                .toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
        });

        it('rejects a proposal object carrying a symbol key', () => {
            const withSymbol = { ...proposal() };
            Object.defineProperty(withSymbol, Symbol('tag'), { value: 'x', enumerable: true });
            expect(() => validateSemanticCommandProposal(withSymbol))
                .toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
        });

        it('rejects a proposal object with a non-enumerable field', () => {
            const value: Record<string, unknown> = { ...proposal() };
            Object.defineProperty(value, 'reasonCode', { value: 'HIDDEN', enumerable: false });
            expect(() => validateSemanticCommandProposal(value))
                .toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
        });

        it('rejects targets that are not a plain array (custom Array subclass)', () => {
            class FakeArray extends Array {}
            const targets = FakeArray.from([{ roleId: 'a', roleOrdinal: 0, targetObservationEntryId: 'e' }]);
            expect(() => validateSemanticCommandProposal(proposal({ targets })))
                .toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
        });

        it('rejects a targets array carrying a symbol key', () => {
            const targets: unknown[] = [{ roleId: 'a', roleOrdinal: 0, targetObservationEntryId: 'e' }];
            Object.defineProperty(targets, Symbol('tag'), { value: 'x', enumerable: true });
            expect(() => validateSemanticCommandProposal(proposal({ targets })))
                .toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
        });

        it('rejects a targets array carrying a named property outside its index range', () => {
            const targets: unknown[] = [{ roleId: 'a', roleOrdinal: 0, targetObservationEntryId: 'e' }];
            (targets as unknown as Record<string, unknown>).extra = 'forbidden';
            expect(() => validateSemanticCommandProposal(proposal({ targets })))
                .toThrowError(expect.objectContaining({ code: 'INVALID_PROPOSAL_SHAPE' }));
        });
    });
});
