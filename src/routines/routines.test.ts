import { describe, expect, it } from 'vitest';
import { Think } from 'yuka';
import { RoutineAgent, resolveRoutineTarget, type RoutineSchedule } from './RoutineAgent.js';

const schedule: RoutineSchedule = {
    home: { mapId: 'cottage', position: { x: 2, y: 0, z: 2 }, action: 'sleep' },
    entries: [
        {
            id: 'forge-shift',
            startMinute: 480,
            endMinute: 1_020,
            mapId: 'town',
            position: { x: 12, y: 0, z: 8 },
            action: 'work-forge',
        },
    ],
};

describe('RoutineAgent', () => {
    it('resolves work and return-home windows', () => {
        expect(resolveRoutineTarget(schedule, 600).id).toBe('forge-shift');
        expect(resolveRoutineTarget(schedule, 1_100)).toMatchObject({ id: 'home', isHome: true });
    });

    it('uses a Yuka Think brain for transfer, travel, activity, dwell, and home return', () => {
        const agent = new RoutineAgent({ schedule, arrivalRadius: 0.5 });
        expect(agent.brain).toBeInstanceOf(Think);

        expect(agent.decide({ day: 1, minuteOfDay: 600, mapId: 'cottage', position: { x: 2, y: 0, z: 2 } }).intent)
            .toMatchObject({ kind: 'transfer-map', mapId: 'town' });
        expect(agent.decide({ day: 1, minuteOfDay: 600, mapId: 'town', position: { x: 3, y: 0, z: 2 } }).intent)
            .toMatchObject({ kind: 'move-to' });

        const activity = agent.decide({ day: 1, minuteOfDay: 600, mapId: 'town', position: { x: 12, y: 0, z: 8 } });
        expect(activity.intent).toMatchObject({ kind: 'action', action: 'work-forge' });
        agent.acknowledge(activity, true);
        expect(agent.decide({ day: 1, minuteOfDay: 601, mapId: 'town', position: { x: 12, y: 0, z: 8 } }).intent)
            .toMatchObject({ kind: 'wait' });
        expect(agent.decide({ day: 1, minuteOfDay: 1_100, mapId: 'town', position: { x: 12, y: 0, z: 8 } }).intent)
            .toMatchObject({ kind: 'transfer-map', mapId: 'cottage' });
    });

    it('round-trips accepted daily activities without repeating work after load', () => {
        const first = new RoutineAgent({ schedule });
        const observation = {
            day: 2,
            minuteOfDay: 600,
            mapId: 'town',
            position: { x: 12, y: 0, z: 8 },
        };
        const activity = first.decide(observation);
        first.acknowledge(activity, true);
        const snapshot = first.snapshot();
        expect(() => JSON.stringify(snapshot)).not.toThrow();

        const restored = new RoutineAgent({ schedule });
        restored.restore(snapshot);
        expect(restored.decide(observation).intent).toMatchObject({ kind: 'wait' });
    });
});
