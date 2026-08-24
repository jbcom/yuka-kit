import { describe, expect, it, vi } from 'vitest';
import { SEMANTIC_COMMAND_PROPOSAL_SCHEMA } from '../proposals/semantic.js';
import { SoloCommandAdapter, type SoloAICommand, type SoloCommandResultLike } from './adapter.js';
import { AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA } from './strict.js';

const digest = 'ab'.repeat(32);
const revisionSha = 'cd'.repeat(32);

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
    targets: [{ roleId: 'subject', roleOrdinal: 1, targetObservationEntryId: 'entry-subject' }],
    reasonCode: 'BASE',
    ...overrides,
});

const envelope = (overrides: Record<string, unknown> = {}) => ({
    schema: AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA,
    streamId: 'stream-1',
    decisionOrdinal: 4,
    proposalId: 'proposal-base',
    bindingId: 'binding-base',
    rulesTick: 12,
    observationDigest: digest,
    expectedRulesRevisionSha256: revisionSha,
    semanticProposal: proposal(),
    ...overrides,
});

function recordingRuntime() {
    const commands: SoloAICommand[] = [];
    const runtime = {
        dispatch(command: SoloAICommand): SoloCommandResultLike {
            commands.push(command);
            return { accepted: true, tick: commands.length };
        },
    };
    return { runtime, commands };
}

describe('SoloCommandAdapter.commandFor', () => {
    it('produces undefined for a wait intent', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        expect(adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, { kind: 'wait' })).toBeUndefined();
    });

    it('produces a stop command for a stop intent', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        expect(adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, { kind: 'stop' })).toEqual({
            type: 'stop',
            entityId: 'hero',
            source: 'ai',
        });
    });

    it('produces an action command with a JSON-sanitized payload', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const command = adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'action',
            action: 'cast',
            payload: { power: 5 },
        });
        expect(command).toEqual({
            type: 'action',
            entityId: 'hero',
            action: 'cast',
            payload: { power: 5 },
            source: 'ai',
        });
    });

    it('produces an action command without a payload key when payload is omitted', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const command = adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'action',
            action: 'wave',
        });
        expect(command).toEqual({ type: 'action', entityId: 'hero', action: 'wave', source: 'ai' });
    });

    it('rejects a non-finite number inside an action payload', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        expect(() => adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'action',
            action: 'cast',
            payload: { power: Number.NaN },
        })).toThrow(/must be finite/);
    });

    it('rejects a non-serializable value inside an action payload', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        expect(() => adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'action',
            action: 'cast',
            payload: { fn: () => 1 },
        })).toThrow(/JSON serializable/);
    });

    it('rejects a cyclic action payload', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(() => adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'action',
            action: 'cast',
            payload: cyclic,
        })).toThrow(/must not contain cycles/);
    });

    it('sanitizes an array-valued action payload', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const command = adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'action',
            action: 'cast',
            payload: [1, 'two', true, null],
        });
        expect(command).toMatchObject({ payload: [1, 'two', true, null] });
    });

    it('drops undefined-valued keys from an object action payload', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const command = adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'action',
            action: 'cast',
            payload: { keep: 1, drop: undefined },
        });
        expect(command).toMatchObject({ payload: { keep: 1 } });
    });

    it('produces a transfer-map command using the default XZ-to-xy projection', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const command = adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'transfer-map',
            mapId: 'dungeon-2',
            position: { x: 3, y: 0, z: 4 },
        });
        expect(command).toEqual({
            type: 'transfer-map',
            entityId: 'hero',
            mapId: 'dungeon-2',
            position: { x: 3, y: 4 },
            source: 'ai',
        });
    });

    it('produces a transfer-map command through a custom position projector', () => {
        const { runtime } = recordingRuntime();
        const toRuntimePosition = vi.fn((position: { x: number; z: number }) => ({
            x: position.x * 2,
            y: position.z * 2,
        }));
        const adapter = new SoloCommandAdapter(runtime, { toRuntimePosition });
        const command = adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'transfer-map',
            mapId: 'dungeon-2',
            position: { x: 3, y: 0, z: 4 },
        });
        expect(toRuntimePosition).toHaveBeenCalled();
        expect(command).toMatchObject({ position: { x: 6, y: 8 } });
    });

    it('stops once within arrival tolerance of a move-to target', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime, { arrivalTolerance: 1 });
        const command = adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'move-to',
            target: { x: 0.5, y: 0, z: 0 },
        });
        expect(command).toEqual({ type: 'stop', entityId: 'hero', source: 'ai' });
    });

    it('moves toward a distant move-to target with a normalized vector', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const command = adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'move-to',
            target: { x: 10, y: 0, z: 0 },
        });
        expect(command).toEqual({ type: 'move', entityId: 'hero', vector: { x: 1, y: 0 }, source: 'ai' });
    });

    it('applies a custom speed projector on move-to when a speed is given', () => {
        const { runtime } = recordingRuntime();
        const toRuntimeSpeed = vi.fn((speed: number) => speed * 10);
        const adapter = new SoloCommandAdapter(runtime, { toRuntimeSpeed });
        const command = adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'move-to',
            target: { x: 10, y: 0, z: 0 },
            speed: 2,
        });
        expect(toRuntimeSpeed).toHaveBeenCalledWith(2);
        expect(command).toMatchObject({ speed: 20 });
    });

    it('moves away from a source with a normalized vector', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const command = adapter.commandFor('hero', { x: 5, y: 0, z: 0 }, {
            kind: 'move-away',
            from: { x: 0, y: 0, z: 0 },
        });
        expect(command).toEqual({ type: 'move', entityId: 'hero', vector: { x: 1, y: 0 }, source: 'ai' });
    });

    it('applies speed on move-away when given', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const command = adapter.commandFor('hero', { x: 5, y: 0, z: 0 }, {
            kind: 'move-away',
            from: { x: 0, y: 0, z: 0 },
            speed: 4,
        });
        expect(command).toMatchObject({ speed: 4 });
    });

    it('stops when move-away has no distance to flee (already at the source)', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const command = adapter.commandFor('hero', { x: 0, y: 0, z: 0 }, {
            kind: 'move-away',
            from: { x: 0, y: 0, z: 0 },
        });
        expect(command).toEqual({ type: 'stop', entityId: 'hero', source: 'ai' });
    });
});

describe('SoloCommandAdapter.dispatch', () => {
    it('returns waited:true without invoking the runtime for a wait intent', () => {
        const { runtime, commands } = recordingRuntime();
        const dispatchSpy = vi.spyOn(runtime, 'dispatch');
        const adapter = new SoloCommandAdapter(runtime);
        const outcome = adapter.dispatch('hero', { x: 0, y: 0, z: 0 }, { kind: 'wait' });
        expect(outcome).toEqual({ waited: true });
        expect(commands).toHaveLength(0);
        expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('dispatches a real command through the runtime port', () => {
        const { runtime, commands } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const outcome = adapter.dispatch('hero', { x: 0, y: 0, z: 0 }, { kind: 'stop' });
        expect(outcome.waited).toBe(false);
        expect(outcome.command).toEqual({ type: 'stop', entityId: 'hero', source: 'ai' });
        expect(outcome.result).toEqual({ accepted: true, tick: 1 });
        expect(commands).toHaveLength(1);
    });
});

describe('SoloCommandAdapter.dispatchEnvelope', () => {
    const context = () => ({
        rulesTick: 12,
        observationDigest: digest,
        rulesRevisionSha256: revisionSha,
    });

    it('dispatches a trusted move command compiled from the semantic proposal', () => {
        const { runtime, commands } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const compile = vi.fn(() => ({
            type: 'move',
            entityId: 'hero',
            vector: { x: 1, y: 0 },
            source: 'ai',
        }));
        const outcome = adapter.dispatchEnvelope(envelope(), context(), compile);
        expect(outcome.dispatched).toBe(true);
        if (outcome.dispatched) {
            expect(outcome.command).toEqual({
                type: 'move',
                entityId: 'hero',
                vector: { x: 1, y: 0 },
                source: 'ai',
            });
            expect(outcome.result).toEqual({ accepted: true, tick: 1 });
        }
        expect(compile).toHaveBeenCalledWith(envelope().semanticProposal);
        expect(commands).toHaveLength(1);
    });

    it('dispatches a trusted move command carrying an explicit speed', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const compile = () => ({
            type: 'move',
            entityId: 'hero',
            vector: { x: 0, y: 1 },
            speed: 2.5,
            source: 'ai',
        });
        const outcome = adapter.dispatchEnvelope(envelope(), context(), compile);
        expect(outcome.dispatched).toBe(true);
        if (outcome.dispatched) {
            expect(outcome.command).toMatchObject({ speed: 2.5 });
        }
    });

    it('dispatches a trusted stop command', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const compile = () => ({ type: 'stop', entityId: 'hero', source: 'ai' });
        const outcome = adapter.dispatchEnvelope(envelope(), context(), compile);
        expect(outcome.dispatched).toBe(true);
        if (outcome.dispatched) {
            expect(outcome.command).toEqual({ type: 'stop', entityId: 'hero', source: 'ai' });
        }
    });

    it('dispatches a trusted action command with a payload', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const compile = () => ({
            type: 'action',
            entityId: 'hero',
            action: 'use-heal',
            payload: { amount: 10 },
            source: 'ai',
        });
        const outcome = adapter.dispatchEnvelope(envelope(), context(), compile);
        expect(outcome.dispatched).toBe(true);
        if (outcome.dispatched) {
            expect(outcome.command).toEqual({
                type: 'action',
                entityId: 'hero',
                action: 'use-heal',
                payload: { amount: 10 },
                source: 'ai',
            });
        }
    });

    it('dispatches a trusted action command whose payload contains an array', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const compile = () => ({
            type: 'action',
            entityId: 'hero',
            action: 'use-item',
            payload: { items: ['potion', 'scroll'] },
            source: 'ai',
        });
        const outcome = adapter.dispatchEnvelope(envelope(), context(), compile);
        expect(outcome.dispatched).toBe(true);
        if (outcome.dispatched) {
            expect(outcome.command).toEqual({
                type: 'action',
                entityId: 'hero',
                action: 'use-item',
                payload: { items: ['potion', 'scroll'] },
                source: 'ai',
            });
        }
    });

    it('dispatches a trusted action command without a payload', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const compile = () => ({ type: 'action', entityId: 'hero', action: 'wave', source: 'ai' });
        const outcome = adapter.dispatchEnvelope(envelope(), context(), compile);
        expect(outcome.dispatched).toBe(true);
        if (outcome.dispatched) {
            expect(outcome.command).toEqual({ type: 'action', entityId: 'hero', action: 'wave', source: 'ai' });
        }
    });

    it('rejects when rulesTick disagrees with the current context', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const outcome = adapter.dispatchEnvelope(envelope(), { ...context(), rulesTick: 99 }, () => ({
            type: 'stop',
            entityId: 'hero',
            source: 'ai',
        }));
        expect(outcome).toMatchObject({ dispatched: false, code: 'RULES_TICK_MISMATCH' });
    });

    it('rejects when observationDigest disagrees with the current context', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const otherDigest = 'ef'.repeat(32);
        const outcome = adapter.dispatchEnvelope(
            envelope(),
            { ...context(), observationDigest: otherDigest },
            () => ({ type: 'stop', entityId: 'hero', source: 'ai' }),
        );
        expect(outcome).toMatchObject({ dispatched: false, code: 'OBSERVATION_DIGEST_MISMATCH' });
    });

    it('rejects when expectedRulesRevisionSha256 disagrees with the current context', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const otherRevision = 'ff'.repeat(32);
        const outcome = adapter.dispatchEnvelope(
            envelope(),
            { ...context(), rulesRevisionSha256: otherRevision },
            () => ({ type: 'stop', entityId: 'hero', source: 'ai' }),
        );
        expect(outcome).toMatchObject({ dispatched: false, code: 'RULES_REVISION_MISMATCH' });
    });

    it('rejects a non-function compiler', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        expect(() => adapter.dispatchEnvelope(
            envelope(),
            context(),
            'not-a-function' as unknown as (p: unknown) => unknown,
        )).toThrow(/requires a trusted compiler function/);
    });

    it('rejects an envelope that fails structural validation before touching the compiler', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const compile = vi.fn();
        expect(() => adapter.dispatchEnvelope({ ...envelope(), schema: 'bad' }, context(), compile))
            .toThrow(/schema must be/);
        expect(compile).not.toHaveBeenCalled();
    });

    it('rejects a compiled command the strict validator forbids (e.g. teleport)', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const compile = () => ({ type: 'teleport', entityId: 'hero', source: 'ai' });
        expect(() => adapter.dispatchEnvelope(envelope(), context(), compile)).toThrow(/forbids teleport/);
    });

    it('returns a frozen outcome object', () => {
        const { runtime } = recordingRuntime();
        const adapter = new SoloCommandAdapter(runtime);
        const outcome = adapter.dispatchEnvelope(envelope(), context(), () => ({
            type: 'stop',
            entityId: 'hero',
            source: 'ai',
        }));
        expect(Object.isFrozen(outcome)).toBe(true);
    });
});
