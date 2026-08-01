import { describe, expect, it } from 'vitest';
import { SEMANTIC_COMMAND_PROPOSAL_SCHEMA } from '../proposals/semantic.js';
import { SoloCommandAdapter, type SoloAICommand } from './adapter.js';
import {
    AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA,
    createAICommandDispatchEnvelope,
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
