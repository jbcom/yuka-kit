import { describe, expect, it } from 'vitest';
import { ClassGovernor } from '../governors/ClassGovernor.js';
import type { GovernorObservation } from '../governors/types.js';
import { SoloCommandAdapter, type SoloAICommand } from './adapter.js';
import { runGovernedPlaythrough } from './playthrough.js';

describe('RPGJS Solo command boundary', () => {
    it('maps XZ-plane intents to AI-source Solo commands', () => {
        const commands: SoloAICommand[] = [];
        const adapter = new SoloCommandAdapter({
            dispatch(command) {
                commands.push(command);
                return { accepted: true, tick: commands.length };
            },
        });
        const outcome = adapter.dispatch(
            'hero',
            { x: 1, y: 0, z: 2 },
            { kind: 'move-to', target: { x: 4, y: 0, z: 6 } },
        );
        expect(outcome.command).toMatchObject({
            type: 'move',
            entityId: 'hero',
            source: 'ai',
            vector: { x: 0.6, y: 0.8 },
        });
    });

    it('converts normalized authoring coordinates for Solo map transfers', () => {
        const adapter = new SoloCommandAdapter({
            dispatch: () => ({ accepted: true, tick: 0 }),
        }, {
            toRuntimePosition: (position) => ({ x: position.x * 16, y: position.z * 16 }),
        });

        expect(adapter.commandFor('smith', { x: 0, y: 0, z: 0 }, {
            kind: 'transfer-map',
            mapId: 'town',
            position: { x: 12, y: 0, z: 8 },
        })).toEqual({
            type: 'transfer-map',
            entityId: 'smith',
            mapId: 'town',
            position: { x: 192, y: 128 },
            source: 'ai',
        });
    });

    it('completes a governed route without teleport or direct state mutation', async () => {
        let x = 0;
        let lastCommand: SoloAICommand | undefined;
        const commands: SoloAICommand[] = [];
        const adapter = new SoloCommandAdapter({
            dispatch(command) {
                lastCommand = command;
                commands.push(command);
                return { accepted: true, tick: commands.length };
            },
        });
        const governor = new ClassGovernor({ className: 'knight' });
        const observe = (): GovernorObservation => ({
            actor: { position: { x, y: 0, z: 0 }, hp: 100, maxHp: 100, resource: 10, maxResource: 10 },
            enemies: [],
            objective: { id: 'gate', position: { x: 3, y: 0, z: 0 }, arrivalRadius: 0.25 },
        });

        const report = await runGovernedPlaythrough({
            entityId: 'hero',
            governor,
            adapter,
            observe,
            isComplete: () => x >= 2.75,
            progressKey: () => x.toFixed(2),
            maxSteps: 10,
            advance() {
                if (lastCommand?.type === 'move') x += lastCommand.vector.x;
            },
        });

        expect(report).toMatchObject({ completed: true, reason: 'complete' });
        expect(commands.length).toBeGreaterThan(0);
        expect(commands.every((command) => command.source === 'ai')).toBe(true);
        expect(commands.some((command) => command.type === 'transfer-map')).toBe(false);
    });
});
