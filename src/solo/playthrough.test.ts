import { describe, expect, it } from 'vitest';
import type { ClassGovernor } from '../governors/ClassGovernor.js';
import type { GovernorDecision, GovernorObservation } from '../governors/types.js';
import type { SoloAICommand, SoloCommandAdapter, SoloDispatchOutcome } from './adapter.js';
import { runGovernedPlaythrough } from './playthrough.js';

const baseObservation: GovernorObservation = {
    actor: { position: { x: 0, y: 0, z: 0 }, hp: 100, maxHp: 100, resource: 10, maxResource: 10 },
    enemies: [],
};

function fakeGovernor(decision: GovernorDecision): ClassGovernor {
    return { decide: () => decision } as unknown as ClassGovernor;
}

function fakeAdapter(outcome: SoloDispatchOutcome): SoloCommandAdapter {
    return { dispatch: () => outcome } as unknown as SoloCommandAdapter;
}

describe('runGovernedPlaythrough — stall detection', () => {
    it('reports stalled once progressKey repeats stallLimit times in a row', async () => {
        const governor = fakeGovernor({ className: 'knight', goal: 'idle', intent: { kind: 'wait' } });
        const adapter = fakeAdapter({ waited: true });
        const report = await runGovernedPlaythrough({
            entityId: 'hero',
            governor,
            adapter,
            observe: () => baseObservation,
            isComplete: () => false,
            progressKey: () => 'unchanging-key',
            stallLimit: 3,
            maxSteps: 100,
            advance: () => {},
        });
        expect(report.reason).toBe('stalled');
        expect(report.completed).toBe(false);
        expect(report.steps).toHaveLength(3);
    });

    it('resets the stall counter whenever the progress key changes', async () => {
        let tick = 0;
        const governor = fakeGovernor({ className: 'knight', goal: 'idle', intent: { kind: 'wait' } });
        const adapter = fakeAdapter({ waited: true });
        const report = await runGovernedPlaythrough({
            entityId: 'hero',
            governor,
            adapter,
            observe: () => baseObservation,
            isComplete: () => false,
            progressKey: () => String(Math.floor(tick / 2)), // changes every 2 steps
            stallLimit: 5,
            maxSteps: 8,
            advance: () => { tick += 1; },
        });
        // Progress key changes often enough that the stall counter never
        // reaches stallLimit within maxSteps, so the run exhausts max-steps.
        expect(report.reason).toBe('max-steps');
    });
});

describe('runGovernedPlaythrough — command rejection', () => {
    it('stops and reports command-rejected when the adapter rejects a dispatched command', async () => {
        const governor = fakeGovernor({
            className: 'knight',
            goal: 'combat',
            intent: { kind: 'stop' },
        });
        const command: SoloAICommand = { type: 'stop', entityId: 'hero', source: 'ai' };
        const adapter = fakeAdapter({
            waited: false,
            command,
            result: { accepted: false, tick: 1, reason: 'blocked-by-cooldown' },
        });
        const report = await runGovernedPlaythrough({
            entityId: 'hero',
            governor,
            adapter,
            observe: () => baseObservation,
            isComplete: () => false,
            maxSteps: 10,
            advance: () => {},
        });
        expect(report).toMatchObject({
            completed: false,
            reason: 'command-rejected',
            rejectedReason: 'blocked-by-cooldown',
        });
        expect(report.steps).toHaveLength(1);
        expect(report.steps[0].command).toEqual(command);
    });

    it('continues driving when the adapter accepts every command', async () => {
        let steps = 0;
        const governor = fakeGovernor({ className: 'knight', goal: 'combat', intent: { kind: 'stop' } });
        const adapter = fakeAdapter({
            waited: false,
            command: { type: 'stop', entityId: 'hero', source: 'ai' },
            result: { accepted: true, tick: 1 },
        });
        const report = await runGovernedPlaythrough({
            entityId: 'hero',
            governor,
            adapter,
            observe: () => baseObservation,
            isComplete: () => steps >= 3,
            maxSteps: 10,
            advance: () => { steps += 1; },
        });
        expect(report).toMatchObject({ completed: true, reason: 'complete' });
    });
});

describe('runGovernedPlaythrough — max-steps boundary', () => {
    it('reports max-steps when the loop exhausts maxSteps without completing', async () => {
        const governor = fakeGovernor({ className: 'knight', goal: 'idle', intent: { kind: 'wait' } });
        const adapter = fakeAdapter({ waited: true });
        const report = await runGovernedPlaythrough({
            entityId: 'hero',
            governor,
            adapter,
            observe: () => baseObservation,
            isComplete: () => false,
            maxSteps: 3,
            advance: () => {},
        });
        expect(report).toMatchObject({ completed: false, reason: 'max-steps' });
        expect(report.steps).toHaveLength(3);
    });

    it('reports complete when the observation completes exactly on the final check', async () => {
        let observeCalls = 0;
        const governor = fakeGovernor({ className: 'knight', goal: 'idle', intent: { kind: 'wait' } });
        const adapter = fakeAdapter({ waited: true });
        const report = await runGovernedPlaythrough({
            entityId: 'hero',
            governor,
            adapter,
            observe: () => {
                observeCalls += 1;
                return baseObservation;
            },
            // completes only once observe() has been called more than maxSteps times
            // (i.e. only on the trailing post-loop observation check).
            isComplete: () => observeCalls > 2,
            maxSteps: 2,
            advance: () => {},
        });
        expect(report).toMatchObject({ completed: true, reason: 'complete' });
    });

    it('applies the default stallLimit of 300 when none is given', async () => {
        const governor = fakeGovernor({ className: 'knight', goal: 'idle', intent: { kind: 'wait' } });
        const adapter = fakeAdapter({ waited: true });
        const report = await runGovernedPlaythrough({
            entityId: 'hero',
            governor,
            adapter,
            observe: () => baseObservation,
            isComplete: () => false,
            progressKey: () => 'unchanging-key',
            maxSteps: 301,
            advance: () => {},
        });
        expect(report.reason).toBe('stalled');
        expect(report.steps).toHaveLength(300);
    });

    it('applies the default maxSteps of 10,000 when none is given', async () => {
        let steps = 0;
        const governor = fakeGovernor({ className: 'knight', goal: 'idle', intent: { kind: 'wait' } });
        const adapter = fakeAdapter({ waited: true });
        const report = await runGovernedPlaythrough({
            entityId: 'hero',
            governor,
            adapter,
            observe: () => baseObservation,
            isComplete: () => steps >= 5,
            advance: () => { steps += 1; },
        });
        expect(report).toMatchObject({ completed: true, reason: 'complete' });
        expect(report.steps).toHaveLength(5);
    });

    it('honors non-integer maxSteps and stallLimit by flooring them', async () => {
        const governor = fakeGovernor({ className: 'knight', goal: 'idle', intent: { kind: 'wait' } });
        const adapter = fakeAdapter({ waited: true });
        const report = await runGovernedPlaythrough({
            entityId: 'hero',
            governor,
            adapter,
            observe: () => baseObservation,
            isComplete: () => false,
            maxSteps: 2.9,
            advance: () => {},
        });
        expect(report.steps).toHaveLength(2);
    });
});

describe('runGovernedPlaythrough — immediate completion', () => {
    it('returns complete without dispatching any command when already complete', async () => {
        let dispatched = false;
        const governor = fakeGovernor({ className: 'knight', goal: 'idle', intent: { kind: 'wait' } });
        const adapter = {
            dispatch: () => {
                dispatched = true;
                return { waited: true };
            },
        } as unknown as SoloCommandAdapter;
        const report = await runGovernedPlaythrough({
            entityId: 'hero',
            governor,
            adapter,
            observe: () => baseObservation,
            isComplete: () => true,
            maxSteps: 10,
            advance: () => {},
        });
        expect(report).toEqual({ completed: true, reason: 'complete', steps: [] });
        expect(dispatched).toBe(false);
    });
});
