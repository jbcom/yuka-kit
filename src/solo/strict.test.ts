import { describe, expect, it } from 'vitest';
import { SEMANTIC_COMMAND_PROPOSAL_SCHEMA } from '../proposals/semantic.js';
import { SoloCommandAdapter, type SoloAICommand } from './adapter.js';
import {
    AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA,
    AICommandEnvelopeValidationError,
    createAICommandDispatchEnvelope,
    validateAICommandDispatchContext,
    validateAICommandDispatchEnvelope,
    validateStrictSoloAICommand,
} from './strict.js';

const observationDigest = '12'.repeat(32);
const otherObservationDigest = '34'.repeat(32);
const rulesRevisionSha256 = '56'.repeat(32);
const otherRulesRevisionSha256 = '78'.repeat(32);
const rulesTick = 41;
const proposal = () => ({
    schema: SEMANTIC_COMMAND_PROPOSAL_SCHEMA,
    streamId: 'enemy:watch-1',
    decisionOrdinal: 8,
    observationDigest,
    proposalId: 'proposal:approach',
    goalId: 'goal:engage',
    goalOrdinal: 1,
    utilityMicros: 800_000,
    bindingId: 'binding:approach-visible-target',
    bindingOrdinal: 2,
    proposalOrdinal: 0,
    targets: [{ roleId: 'target', roleOrdinal: 0, targetObservationEntryId: 'visible:hero' }],
    reasonCode: 'VISIBLE_TARGET',
});
const envelope = () => createAICommandDispatchEnvelope({
    proposal: proposal(),
    rulesTick,
    expectedRulesRevisionSha256: rulesRevisionSha256,
});
const current = () => ({ rulesTick, observationDigest, rulesRevisionSha256 });

describe('strict Solo dispatch envelope', () => {
    it('carries the complete frozen proposal and compiles only at final dispatch', () => {
        const commands: SoloAICommand[] = [];
        const adapter = new SoloCommandAdapter({
            dispatch(command) {
                commands.push(command);
                return { accepted: true, tick: 10 };
            },
        });
        const pending = envelope();

        expect(pending).toMatchObject({
            schema: AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA,
            streamId: 'enemy:watch-1',
            proposalId: 'proposal:approach',
            bindingId: 'binding:approach-visible-target',
            rulesTick,
            observationDigest,
            expectedRulesRevisionSha256: rulesRevisionSha256,
            semanticProposal: { proposalId: 'proposal:approach' },
        });
        expect(pending).not.toHaveProperty('command');
        expect(Object.isFrozen(pending)).toBe(true);
        expect(Object.isFrozen(pending.semanticProposal)).toBe(true);
        expect(Object.isFrozen(pending.semanticProposal.targets)).toBe(true);

        const outcome = adapter.dispatchEnvelope(pending, current(), (validated) => {
            expect(Object.isFrozen(validated)).toBe(true);
            return {
                type: 'move', entityId: 'enemy-1', vector: { x: 1, y: 0 }, speed: 2, source: 'ai',
            };
        });
        expect(outcome).toMatchObject({ dispatched: true, result: { accepted: true, tick: 10 } });
        expect(commands).toEqual([{ type: 'move', entityId: 'enemy-1', vector: { x: 1, y: 0 }, speed: 2, source: 'ai' }]);
    });

    it('rejects stale tick, observation, and Rules revision before invoking the compiler', () => {
        let dispatches = 0;
        let compilations = 0;
        const adapter = new SoloCommandAdapter({
            dispatch: () => {
                dispatches += 1;
                return { accepted: true, tick: 0 };
            },
        });
        const compile = () => {
            compilations += 1;
            return { type: 'stop', entityId: 'enemy-1', source: 'ai' } as const;
        };

        expect(adapter.dispatchEnvelope(envelope(), { ...current(), rulesTick: rulesTick + 1 }, compile))
            .toMatchObject({ dispatched: false, code: 'RULES_TICK_MISMATCH' });
        expect(adapter.dispatchEnvelope(envelope(), {
            ...current(), observationDigest: otherObservationDigest,
        }, compile)).toMatchObject({ dispatched: false, code: 'OBSERVATION_DIGEST_MISMATCH' });
        expect(adapter.dispatchEnvelope(envelope(), {
            ...current(), rulesRevisionSha256: otherRulesRevisionSha256,
        }, compile)).toMatchObject({ dispatched: false, code: 'RULES_REVISION_MISMATCH' });
        expect(compilations).toBe(0);
        expect(dispatches).toBe(0);
    });

    it.each(['teleport', 'transfer-map'])('rejects forbidden %s compiler output', (type) => {
        const adapter = new SoloCommandAdapter({ dispatch: () => ({ accepted: true, tick: 0 }) });
        expect(() => adapter.dispatchEnvelope(envelope(), current(), () => ({
            type,
            entityId: 'enemy-1',
            position: { x: 1, y: 2 },
            mapId: 'other-map',
            source: 'ai',
        }))).toThrowError(expect.objectContaining({ code: 'COMMAND_TYPE_FORBIDDEN' }));
    });

    it('rejects forged envelope commands, non-AI source, and executable payload material', () => {
        const adapter = new SoloCommandAdapter({ dispatch: () => ({ accepted: true, tick: 0 }) });
        expect(() => adapter.dispatchEnvelope({
            ...envelope(),
            command: { type: 'action', entityId: 'enemy-1', action: 'forged', source: 'ai' },
        }, current(), () => ({ type: 'stop', entityId: 'enemy-1', source: 'ai' })))
            .toThrowError(expect.objectContaining({ code: 'INVALID_ENVELOPE_SHAPE' }));
        expect(() => adapter.dispatchEnvelope(
            envelope(), current(), () => ({ type: 'stop', entityId: 'enemy-1', source: 'system' }),
        )).toThrowError(expect.objectContaining({ code: 'COMMAND_SOURCE_FORBIDDEN' }));
        expect(() => adapter.dispatchEnvelope(envelope(), current(), () => ({
            type: 'action', entityId: 'enemy-1', action: 'combat:use', source: 'ai', payload: { run: () => true },
        }))).toThrowError(expect.objectContaining({ code: 'INVALID_COMMAND_PAYLOAD' }));
    });

    it('rejects invalid metadata and envelope/proposal identity disagreement', () => {
        expect(() => createAICommandDispatchEnvelope({
            proposal: proposal(),
            rulesTick: 1.5,
            expectedRulesRevisionSha256: rulesRevisionSha256,
        })).toThrowError(expect.objectContaining({ code: 'INVALID_RULES_TICK' }));
        expect(() => createAICommandDispatchEnvelope({
            proposal: proposal(),
            rulesTick,
            expectedRulesRevisionSha256: 'not-a-digest',
        })).toThrowError(expect.objectContaining({ code: 'INVALID_RULES_REVISION' }));
        const pending = envelope();
        expect(() => new SoloCommandAdapter({ dispatch: () => ({ accepted: true, tick: 0 }) }).dispatchEnvelope({
            ...pending,
            proposalId: 'different',
        }, current(), () => ({ type: 'stop', entityId: 'enemy-1', source: 'ai' })))
            .toThrowError(expect.objectContaining({ code: 'INVALID_ENVELOPE_SHAPE' }));
    });

    it('preserves legacy transfer and intent dispatch behavior unchanged', () => {
        const commands: SoloAICommand[] = [];
        const adapter = new SoloCommandAdapter({
            dispatch(command) {
                commands.push(command);
                return { accepted: true, tick: 1 };
            },
        });
        const legacy = adapter.dispatch(
            'smith',
            { x: 0, y: 0, z: 0 },
            { kind: 'transfer-map', mapId: 'town', position: { x: 3, y: 0, z: 4 } },
        );
        expect(legacy.command).toEqual({
            type: 'transfer-map', entityId: 'smith', mapId: 'town', position: { x: 3, y: 4 }, source: 'ai',
        });
        expect(commands).toEqual([legacy.command]);
    });
});

const digest = 'ab'.repeat(32);
const revisionSha = 'cd'.repeat(32);

const proposalFixture = (overrides: Record<string, unknown> = {}) => ({
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

const envelopeFixture = (overrides: Record<string, unknown> = {}) => ({
    schema: AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA,
    streamId: 'stream-1',
    decisionOrdinal: 4,
    proposalId: 'proposal-base',
    bindingId: 'binding-base',
    rulesTick: 12,
    observationDigest: digest,
    expectedRulesRevisionSha256: revisionSha,
    semanticProposal: proposalFixture(),
    ...overrides,
});

describe('createAICommandDispatchEnvelope', () => {
    it('derives every identity field from the validated proposal', () => {
        const built = createAICommandDispatchEnvelope({
            proposal: proposalFixture(),
            rulesTick: 3,
            expectedRulesRevisionSha256: revisionSha,
        });
        expect(built.schema).toBe(AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA);
        expect(built.streamId).toBe('stream-1');
        expect(built.decisionOrdinal).toBe(4);
        expect(built.proposalId).toBe('proposal-base');
        expect(built.bindingId).toBe('binding-base');
        expect(built.rulesTick).toBe(3);
        expect(built.observationDigest).toBe(digest);
        expect(built.expectedRulesRevisionSha256).toBe(revisionSha);
        expect(Object.isFrozen(built)).toBe(true);
    });

    it('rejects a negative rulesTick', () => {
        expect(() => createAICommandDispatchEnvelope({
            proposal: proposalFixture(),
            rulesTick: -1,
            expectedRulesRevisionSha256: revisionSha,
        })).toThrow(AICommandEnvelopeValidationError);
    });

    it('rejects a malformed expectedRulesRevisionSha256', () => {
        expect(() => createAICommandDispatchEnvelope({
            proposal: proposalFixture(),
            rulesTick: 3,
            expectedRulesRevisionSha256: 'not-a-digest',
        })).toThrow(/64 lowercase hexadecimal/);
    });

    it('propagates proposal validation failures', () => {
        expect(() => createAICommandDispatchEnvelope({
            proposal: proposalFixture({ schema: 'wrong' }),
            rulesTick: 3,
            expectedRulesRevisionSha256: revisionSha,
        })).toThrow();
    });
});

describe('validateAICommandDispatchEnvelope', () => {
    it('accepts and freezes a well-formed envelope', () => {
        const result = validateAICommandDispatchEnvelope(envelopeFixture());
        expect(result.schema).toBe(AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA);
        expect(Object.isFrozen(result)).toBe(true);
    });

    it('rejects a non-object envelope', () => {
        expect(() => validateAICommandDispatchEnvelope(null)).toThrow(AICommandEnvelopeValidationError);
        expect(() => validateAICommandDispatchEnvelope('nope')).toThrow(AICommandEnvelopeValidationError);
    });

    it('rejects an envelope with an unknown field', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), extra: 1 }))
            .toThrow(/unknown field extra/);
    });

    it('rejects an envelope missing a required field', () => {
        const { rulesTick: _omit, ...withoutRulesTick } = envelopeFixture();
        expect(() => validateAICommandDispatchEnvelope(withoutRulesTick))
            .toThrow(/missing field rulesTick/);
    });

    it('rejects the wrong schema tag', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), schema: 'wrong-schema' }))
            .toThrow(/schema must be/);
    });

    it('rejects a malformed observationDigest', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), observationDigest: 'zz' }))
            .toThrow(/64 lowercase hexadecimal/);
    });

    it('rejects a negative decisionOrdinal', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), decisionOrdinal: -1 }))
            .toThrow(AICommandEnvelopeValidationError);
    });

    it('rejects an empty streamId', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), streamId: '' }))
            .toThrow(/nonempty NFC string/);
    });

    it('rejects an empty proposalId', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), proposalId: '' }))
            .toThrow(/nonempty NFC string/);
    });

    it('rejects an empty bindingId', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), bindingId: '' }))
            .toThrow(/nonempty NFC string/);
    });

    it('rejects when streamId disagrees with the semantic proposal', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), streamId: 'different-stream' }))
            .toThrow(/identity fields must equal/);
    });

    it('rejects when decisionOrdinal disagrees with the semantic proposal', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), decisionOrdinal: 999 }))
            .toThrow(/identity fields must equal/);
    });

    it('rejects when proposalId disagrees with the semantic proposal', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), proposalId: 'different-proposal' }))
            .toThrow(/identity fields must equal/);
    });

    it('rejects when bindingId disagrees with the semantic proposal', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), bindingId: 'different-binding' }))
            .toThrow(/identity fields must equal/);
    });

    it('rejects when observationDigest disagrees with the semantic proposal', () => {
        const otherDigest = 'ef'.repeat(32);
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), observationDigest: otherDigest }))
            .toThrow(/identity fields must equal/);
    });

    it('rejects a malformed expectedRulesRevisionSha256', () => {
        expect(() => validateAICommandDispatchEnvelope({ ...envelopeFixture(), expectedRulesRevisionSha256: 'short' }))
            .toThrow(/64 lowercase hexadecimal/);
    });

    it('propagates the underlying semantic proposal validation failure', () => {
        expect(() => validateAICommandDispatchEnvelope({
            ...envelopeFixture(),
            semanticProposal: proposalFixture({ schema: 'wrong' }),
        })).toThrow();
    });
});

describe('validateAICommandDispatchContext', () => {
    it('accepts and freezes a well-formed context', () => {
        const context = validateAICommandDispatchContext({
            rulesTick: 5,
            observationDigest: digest,
            rulesRevisionSha256: revisionSha,
        });
        expect(context.rulesTick).toBe(5);
        expect(Object.isFrozen(context)).toBe(true);
    });

    it('rejects a non-object context', () => {
        expect(() => validateAICommandDispatchContext(null)).toThrow(AICommandEnvelopeValidationError);
    });

    it('rejects an unknown field', () => {
        expect(() => validateAICommandDispatchContext({
            rulesTick: 5,
            observationDigest: digest,
            rulesRevisionSha256: revisionSha,
            extra: true,
        })).toThrow(/unknown field extra/);
    });

    it('rejects a missing field', () => {
        expect(() => validateAICommandDispatchContext({
            rulesTick: 5,
            observationDigest: digest,
        })).toThrow(/missing field rulesRevisionSha256/);
    });

    it('rejects a malformed observationDigest', () => {
        expect(() => validateAICommandDispatchContext({
            rulesTick: 5,
            observationDigest: 'zz',
            rulesRevisionSha256: revisionSha,
        })).toThrow(/64 lowercase hexadecimal/);
    });

    it('rejects a malformed rulesRevisionSha256', () => {
        expect(() => validateAICommandDispatchContext({
            rulesTick: 5,
            observationDigest: digest,
            rulesRevisionSha256: 'short',
        })).toThrow(/64 lowercase hexadecimal/);
    });

    it('rejects a negative rulesTick', () => {
        expect(() => validateAICommandDispatchContext({
            rulesTick: -1,
            observationDigest: digest,
            rulesRevisionSha256: revisionSha,
        })).toThrow(AICommandEnvelopeValidationError);
    });
});

describe('validateStrictSoloAICommand', () => {
    it('accepts and freezes a move command', () => {
        const command = validateStrictSoloAICommand({
            type: 'move',
            entityId: 'hero',
            vector: { x: 0.6, y: 0.8 },
            speed: 3,
            source: 'ai',
        });
        expect(command).toEqual({
            type: 'move',
            entityId: 'hero',
            vector: { x: 0.6, y: 0.8 },
            speed: 3,
            source: 'ai',
        });
        expect(Object.isFrozen(command)).toBe(true);
    });

    it('accepts a move command without a speed', () => {
        const command = validateStrictSoloAICommand({
            type: 'move',
            entityId: 'hero',
            vector: { x: 1, y: 0 },
            source: 'ai',
        });
        expect(command).toEqual({ type: 'move', entityId: 'hero', vector: { x: 1, y: 0 }, source: 'ai' });
    });

    it('rejects a negative move speed', () => {
        expect(() => validateStrictSoloAICommand({
            type: 'move',
            entityId: 'hero',
            vector: { x: 1, y: 0 },
            speed: -1,
            source: 'ai',
        })).toThrow(/must not be negative/);
    });

    it('rejects a move command with an extra field', () => {
        expect(() => validateStrictSoloAICommand({
            type: 'move',
            entityId: 'hero',
            vector: { x: 1, y: 0 },
            source: 'ai',
            extra: true,
        })).toThrow(/unknown field extra/);
    });

    it('rejects a move vector with extra fields', () => {
        expect(() => validateStrictSoloAICommand({
            type: 'move',
            entityId: 'hero',
            vector: { x: 1, y: 0, z: 1 },
            source: 'ai',
        })).toThrow(/unknown field z/);
    });

    it('accepts and freezes a stop command', () => {
        const command = validateStrictSoloAICommand({ type: 'stop', entityId: 'hero', source: 'ai' });
        expect(command).toEqual({ type: 'stop', entityId: 'hero', source: 'ai' });
    });

    it('rejects a stop command with an extra field', () => {
        expect(() => validateStrictSoloAICommand({ type: 'stop', entityId: 'hero', source: 'ai', extra: 1 }))
            .toThrow(/unknown field extra/);
    });

    it('accepts an action command with a JSON payload', () => {
        const command = validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'use-heal',
            payload: { potency: 5, tags: ['buff', 'heal'] },
            source: 'ai',
        });
        expect(command).toEqual({
            type: 'action',
            entityId: 'hero',
            action: 'use-heal',
            payload: { potency: 5, tags: ['buff', 'heal'] },
            source: 'ai',
        });
    });

    it('accepts an action command without a payload', () => {
        const command = validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'wave',
            source: 'ai',
        });
        expect(command).toEqual({ type: 'action', entityId: 'hero', action: 'wave', source: 'ai' });
    });

    it('rejects a non-finite number inside an action payload', () => {
        expect(() => validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            payload: { power: Number.NaN },
            source: 'ai',
        })).toThrow(/numbers must be finite/);
    });

    it('rejects a non-NFC string inside an action payload', () => {
        expect(() => validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            payload: { note: 'é' }, // decomposed e + combining acute accent
            source: 'ai',
        })).toThrow(/strings must be NFC/);
    });

    it('rejects a cyclic action payload', () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(() => validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            payload: cyclic,
            source: 'ai',
        })).toThrow(/must not contain cycles/);
    });

    it('rejects a non-JSON value inside an action payload', () => {
        expect(() => validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            payload: { fn: () => 1 },
            source: 'ai',
        })).toThrow(/must contain JSON data only/);
    });

    it('rejects a symbol-keyed array in an action payload', () => {
        const arr: unknown[] = [1, 2];
        Object.defineProperty(arr, Symbol('tag'), { value: 'x', enumerable: true });
        expect(() => validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            payload: { list: arr },
            source: 'ai',
        })).toThrow(/must be a plain array without symbol keys/);
    });

    it('rejects an array payload with a named property', () => {
        const arr: unknown[] = [1, 2];
        (arr as unknown as Record<string, unknown>).extra = true;
        expect(() => validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            payload: { list: arr },
            source: 'ai',
        })).toThrow(/contains named property extra/);
    });

    it('sorts action payload keys deterministically', () => {
        const command = validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            payload: { zeta: 1, alpha: 2 },
            source: 'ai',
        });
        expect(command.type === 'action' && Object.keys(command.payload ?? {})).toEqual(['alpha', 'zeta']);
    });

    it('rejects a non-NFC key inside an action payload', () => {
        expect(() => validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            payload: { 'é': 1 },
            source: 'ai',
        })).toThrow(/keys must be NFC/);
    });

    it('rejects an action command with an extra field', () => {
        expect(() => validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            source: 'ai',
            extra: 1,
        })).toThrow(/unknown field extra/);
    });

    it('rejects teleport and transfer-map command types', () => {
        expect(() => validateStrictSoloAICommand({ type: 'teleport', entityId: 'hero', source: 'ai' }))
            .toThrow(/forbids teleport/);
        expect(() => validateStrictSoloAICommand({ type: 'transfer-map', entityId: 'hero', source: 'ai' }))
            .toThrow(/forbids transfer-map/);
    });

    it('rejects a non-ai source', () => {
        expect(() => validateStrictSoloAICommand({ type: 'stop', entityId: 'hero', source: 'player' }))
            .toThrow(/require source ai/);
    });

    it('rejects an unrecognized command type', () => {
        expect(() => validateStrictSoloAICommand({ type: 'jump', entityId: 'hero', source: 'ai' }))
            .toThrow(/must be move, stop, or action/);
    });

    it('rejects a non-object command', () => {
        expect(() => validateStrictSoloAICommand('nope')).toThrow(AICommandEnvelopeValidationError);
    });

    it('rejects a command with a custom (non-plain) prototype', () => {
        class Custom {}
        const command = Object.assign(new Custom(), { type: 'stop', entityId: 'hero', source: 'ai' });
        expect(() => validateStrictSoloAICommand(command)).toThrow(/must not retain a custom prototype/);
    });

    it('accepts a null-prototype command object', () => {
        const command = Object.assign(Object.create(null), { type: 'stop', entityId: 'hero', source: 'ai' });
        expect(validateStrictSoloAICommand(command)).toEqual({ type: 'stop', entityId: 'hero', source: 'ai' });
    });

    it('rejects a command object carrying a symbol key', () => {
        const command: Record<string | symbol, unknown> = { type: 'stop', entityId: 'hero', source: 'ai' };
        command[Symbol('tag')] = 'x';
        expect(() => validateStrictSoloAICommand(command)).toThrow(/must not contain symbol keys/);
    });

    it('rejects a command object with a non-enumerable field', () => {
        const command: Record<string, unknown> = { type: 'stop', source: 'ai' };
        Object.defineProperty(command, 'entityId', { value: 'hero', enumerable: false });
        expect(() => validateStrictSoloAICommand(command)).toThrow(/must be an enumerable data property/);
    });

    it('rejects a non-finite move vector component', () => {
        expect(() => validateStrictSoloAICommand({
            type: 'move',
            entityId: 'hero',
            vector: { x: Number.NaN, y: 0 },
            source: 'ai',
        })).toThrow(/must be finite/);
    });

    it('accepts null and boolean values inside an action payload unchanged', () => {
        const command = validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            payload: { flag: true, empty: null },
            source: 'ai',
        });
        expect(command).toMatchObject({ payload: { flag: true, empty: null } });
    });

    it('rejects an array payload element that is non-enumerable', () => {
        const arr: unknown[] = [1];
        Object.defineProperty(arr, '0', { value: 1, enumerable: false, configurable: true });
        expect(() => validateStrictSoloAICommand({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            payload: { list: arr },
            source: 'ai',
        })).toThrow(/must be an enumerable data property/);
    });
});
