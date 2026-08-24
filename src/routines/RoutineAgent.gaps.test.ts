import { describe, expect, it } from 'vitest';
import {
    RoutineAgent,
    RoutineSlotConflictError,
    resolveRoutineTarget,
    resolveStateAwareRoutineTarget,
    validateRoutineAgentSnapshot,
    type RoutineSchedule,
    type StateAwareRoutineSchedule,
} from './RoutineAgent.js';

const baseObservation = {
    day: 0,
    minuteOfDay: 600,
    mapId: 'town',
    position: { x: 0, y: 0, z: 0 },
};

describe('validateRoutineAgentSnapshot — schema/version rejection', () => {
    it('rejects the wrong schema tag', () => {
        expect(() => validateRoutineAgentSnapshot({
            schema: 'wrong-schema',
            version: 1,
            completedActivities: [],
        })).toThrow('Unsupported routine agent snapshot');
    });

    it('rejects the wrong version', () => {
        expect(() => validateRoutineAgentSnapshot({
            schema: 'arcade-ai-yuka-routine',
            version: 2,
            completedActivities: [],
        })).toThrow('Unsupported routine agent snapshot');
    });
});

describe('inInterval — always-active window (start === end)', () => {
    it('treats a slot with equal start and end minute as always active', () => {
        const schedule: RoutineSchedule = {
            home: { mapId: 'cottage', position: { x: 0, y: 0, z: 0 } },
            entries: [
                { id: 'always-on', startMinute: 300, endMinute: 300, mapId: 'plaza', position: { x: 1, y: 0, z: 1 } },
            ],
        };
        expect(resolveRoutineTarget(schedule, 0).id).toBe('always-on');
        expect(resolveRoutineTarget(schedule, 1_439).id).toBe('always-on');
    });

    it('treats a wrapping window (end < start) as spanning midnight', () => {
        const schedule: RoutineSchedule = {
            home: { mapId: 'cottage', position: { x: 0, y: 0, z: 0 } },
            entries: [
                { id: 'night-watch', startMinute: 1_320, endMinute: 60, mapId: 'wall', position: { x: 1, y: 0, z: 1 } },
            ],
        };
        expect(resolveRoutineTarget(schedule, 1_350).id).toBe('night-watch');
        expect(resolveRoutineTarget(schedule, 30).id).toBe('night-watch');
        expect(resolveRoutineTarget(schedule, 600)).toMatchObject({ id: 'home' });
    });
});

describe('validateDays — direct rejection paths (via state-aware slot conditions)', () => {
    const stateAwareSchedule = (days: number[]): StateAwareRoutineSchedule => ({
        entries: [{
            id: 'market-day',
            mapId: 'market',
            position: { x: 0, y: 0, z: 0 },
            when: { days },
        }],
    });

    it('rejects an empty days array', () => {
        expect(() => resolveStateAwareRoutineTarget(stateAwareSchedule([]), baseObservation))
            .toThrow('must not be empty');
    });

    it('rejects a non-integer day', () => {
        expect(() => resolveStateAwareRoutineTarget(stateAwareSchedule([1.5]), baseObservation))
            .toThrow('must contain non-negative integers');
    });

    it('rejects a negative day', () => {
        expect(() => resolveStateAwareRoutineTarget(stateAwareSchedule([-1]), baseObservation))
            .toThrow('must contain non-negative integers');
    });

    it('rejects a duplicate day', () => {
        expect(() => resolveStateAwareRoutineTarget(stateAwareSchedule([1, 1]), baseObservation))
            .toThrow('contains duplicate 1');
    });
});

describe('validatePublicValue — finite scalar rejection', () => {
    it('accepts a finite number public state value', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [{
                id: 'quota-met',
                mapId: 'market',
                position: { x: 0, y: 0, z: 0 },
                when: { publicPreconditions: [{ key: 'gold', operator: 'equals', value: 42 }] },
            }],
        };
        const observation = { ...baseObservation, publicState: { gold: 42 } };
        expect(resolveStateAwareRoutineTarget(schedule, observation).id).toBe('quota-met');
    });

    it('rejects a non-finite number precondition value', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [{
                id: 'quota-met',
                mapId: 'market',
                position: { x: 0, y: 0, z: 0 },
                when: { publicPreconditions: [{ key: 'gold', operator: 'equals', value: Number.NaN }] },
            }],
        };
        expect(() => resolveStateAwareRoutineTarget(schedule, baseObservation))
            .toThrow('must be a finite scalar public value');
    });
});

describe('validateUniqueIdentifiers — duplicate cue rejection', () => {
    it('rejects a duplicate required cue id', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [{
                id: 'guard-post',
                mapId: 'wall',
                position: { x: 0, y: 0, z: 0 },
                when: { requiredCueIds: ['alarm', 'alarm'] },
            }],
        };
        expect(() => resolveStateAwareRoutineTarget(schedule, baseObservation))
            .toThrow('contains duplicate alarm');
    });
});

describe('validateStateAwareObservation — day and observationTick guards', () => {
    const schedule: StateAwareRoutineSchedule = {
        entries: [{ id: 'plaza', mapId: 'plaza', position: { x: 0, y: 0, z: 0 } }],
    };

    it('rejects a negative observation day', () => {
        expect(() => resolveStateAwareRoutineTarget(schedule, { ...baseObservation, day: -1 }))
            .toThrow('Routine day must be a non-negative integer');
    });

    it('rejects a non-integer observation day', () => {
        expect(() => resolveStateAwareRoutineTarget(schedule, { ...baseObservation, day: 1.5 }))
            .toThrow('Routine day must be a non-negative integer');
    });

    it('rejects a negative observationTick', () => {
        expect(() => resolveStateAwareRoutineTarget(schedule, { ...baseObservation, observationTick: -1 }))
            .toThrow('observationTick must be a non-negative integer');
    });

    it('rejects a non-integer observationTick', () => {
        expect(() => resolveStateAwareRoutineTarget(schedule, { ...baseObservation, observationTick: 1.5 }))
            .toThrow('observationTick must be a non-negative integer');
    });

    it('accepts a valid non-negative integer observationTick', () => {
        expect(resolveStateAwareRoutineTarget(schedule, { ...baseObservation, observationTick: 5 }).id)
            .toBe('plaza');
    });
});

describe('validatePrecondition — one-of/not-one-of empty values rejection', () => {
    it('rejects an empty one-of values array', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [{
                id: 'shop',
                mapId: 'market',
                position: { x: 0, y: 0, z: 0 },
                when: { publicPreconditions: [{ key: 'faction', operator: 'one-of', values: [] }] },
            }],
        };
        expect(() => resolveStateAwareRoutineTarget(schedule, baseObservation)).toThrow('must not be empty');
    });

    it('rejects an empty not-one-of values array', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [{
                id: 'shop',
                mapId: 'market',
                position: { x: 0, y: 0, z: 0 },
                when: { publicPreconditions: [{ key: 'faction', operator: 'not-one-of', values: [] }] },
            }],
        };
        expect(() => resolveStateAwareRoutineTarget(schedule, baseObservation)).toThrow('must not be empty');
    });

    it('accepts a satisfied one-of precondition', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [{
                id: 'shop',
                mapId: 'market',
                position: { x: 0, y: 0, z: 0 },
                when: { publicPreconditions: [{ key: 'faction', operator: 'one-of', values: ['guild', 'clan'] }] },
            }],
        };
        const observation = { ...baseObservation, publicState: { faction: 'guild' } };
        expect(resolveStateAwareRoutineTarget(schedule, observation).id).toBe('shop');
    });
});

describe('validateSlotConditions — phaseIds emptiness', () => {
    it('rejects an empty phaseIds array', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [{
                id: 'evening-only',
                mapId: 'tavern',
                position: { x: 0, y: 0, z: 0 },
                when: { phaseIds: [] },
            }],
        };
        expect(() => resolveStateAwareRoutineTarget(schedule, baseObservation)).toThrow('must not be empty');
    });
});

describe('resolveStateAwareRoutineTarget — duplicate slot id and startMinute/endMinute exclusivity', () => {
    it('rejects a duplicate routine slot id', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [
                { id: 'dup', mapId: 'a', position: { x: 0, y: 0, z: 0 } },
                { id: 'dup', mapId: 'b', position: { x: 1, y: 0, z: 1 } },
            ],
        };
        expect(() => resolveStateAwareRoutineTarget(schedule, baseObservation))
            .toThrow('Duplicate routine slot id dup');
    });

    it('excludes a slot whose only startMinute bound has not yet arrived', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [
                { id: 'late-slot', mapId: 'plaza', position: { x: 0, y: 0, z: 0 }, startMinute: 900 },
            ],
        };
        expect(() => resolveStateAwareRoutineTarget(schedule, { ...baseObservation, minuteOfDay: 100 }))
            .toThrow(/No state-aware routine slot matches/);
    });

    it('includes a slot once its only startMinute bound has arrived', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [
                { id: 'late-slot', mapId: 'plaza', position: { x: 0, y: 0, z: 0 }, startMinute: 900 },
            ],
        };
        expect(resolveStateAwareRoutineTarget(schedule, { ...baseObservation, minuteOfDay: 950 }).id)
            .toBe('late-slot');
    });

    it('excludes a slot whose only endMinute bound has already passed', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [
                { id: 'early-slot', mapId: 'plaza', position: { x: 0, y: 0, z: 0 }, endMinute: 200 },
            ],
        };
        expect(() => resolveStateAwareRoutineTarget(schedule, { ...baseObservation, minuteOfDay: 300 }))
            .toThrow(/No state-aware routine slot matches/);
    });

    it('includes a slot while its only endMinute bound has not yet passed', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [
                { id: 'early-slot', mapId: 'plaza', position: { x: 0, y: 0, z: 0 }, endMinute: 200 },
            ],
        };
        expect(resolveStateAwareRoutineTarget(schedule, { ...baseObservation, minuteOfDay: 100 }).id)
            .toBe('early-slot');
    });
});

describe('RoutineAgent constructor — unsupported slotSelection and cross-map mapper type', () => {
    const schedule: RoutineSchedule = {
        home: { mapId: 'cottage', position: { x: 0, y: 0, z: 0 } },
        entries: [],
    };

    it('rejects an unsupported slotSelection value', () => {
        expect(() => new RoutineAgent({
            schedule,
            slotSelection: 'unsupported' as never,
        })).toThrow('Unsupported routine slot selection unsupported');
    });

    it('rejects a non-function mapCrossMapTransition', () => {
        expect(() => new RoutineAgent({
            schedule,
            mapCrossMapTransition: 'not-a-function' as never,
        })).toThrow('mapCrossMapTransition must be a function');
    });
});

describe('RoutineAgent.decide — activity dwell scoring across separate observations', () => {
    it('offers the activity again once completedActivities does not contain the day-scoped key', () => {
        const schedule: RoutineSchedule = {
            home: { mapId: 'cottage', position: { x: 0, y: 0, z: 0 } },
            entries: [{
                id: 'forge',
                startMinute: 480,
                endMinute: 1_020,
                mapId: 'town',
                position: { x: 0, y: 0, z: 0 },
                action: 'work-forge',
            }],
        };
        const agent = new RoutineAgent({ schedule });
        const observation = { day: 0, minuteOfDay: 600, mapId: 'town', position: { x: 0, y: 0, z: 0 } };
        const decision = agent.decide(observation);
        expect(decision.intent).toMatchObject({ kind: 'action', action: 'work-forge' });
        expect(decision.activityKey).toBe('0:forge');
    });
});

describe('RoutineAgent.decide — direct day validation', () => {
    it('rejects a negative observation day passed straight to decide()', () => {
        const schedule: RoutineSchedule = {
            home: { mapId: 'cottage', position: { x: 0, y: 0, z: 0 } },
            entries: [],
        };
        const agent = new RoutineAgent({ schedule });
        expect(() => agent.decide({ day: -1, minuteOfDay: 0, mapId: 'town', position: { x: 0, y: 0, z: 0 } }))
            .toThrow('Routine day must be a non-negative integer');
    });

    it('rejects a non-integer observation day passed straight to decide()', () => {
        const schedule: RoutineSchedule = {
            home: { mapId: 'cottage', position: { x: 0, y: 0, z: 0 } },
            entries: [],
        };
        const agent = new RoutineAgent({ schedule });
        expect(() => agent.decide({ day: 1.5, minuteOfDay: 0, mapId: 'town', position: { x: 0, y: 0, z: 0 } }))
            .toThrow('Routine day must be a non-negative integer');
    });
});

describe('resolveStateAwareRoutineTarget — both-bounds interval exclusion', () => {
    it('excludes a slot with both startMinute and endMinute when outside the window', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [
                { id: 'midday', mapId: 'plaza', position: { x: 0, y: 0, z: 0 }, startMinute: 600, endMinute: 700 },
            ],
        };
        expect(() => resolveStateAwareRoutineTarget(schedule, { ...baseObservation, minuteOfDay: 100 }))
            .toThrow(/No state-aware routine slot matches/);
    });

    it('includes a slot with both bounds when inside the window', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [
                { id: 'midday', mapId: 'plaza', position: { x: 0, y: 0, z: 0 }, startMinute: 600, endMinute: 700 },
            ],
        };
        expect(resolveStateAwareRoutineTarget(schedule, { ...baseObservation, minuteOfDay: 650 }).id)
            .toBe('midday');
    });
});

describe('validateIdentifier — empty and whitespace-only string rejection', () => {
    it('rejects a whitespace-only routine slot id', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [{ id: '   ', mapId: 'plaza', position: { x: 0, y: 0, z: 0 } }],
        };
        expect(() => resolveStateAwareRoutineTarget(schedule, baseObservation))
            .toThrow('must be a non-empty string');
    });
});

describe('validatePrecondition — unsupported operator rejection', () => {
    it('rejects an operator outside the closed set', () => {
        const schedule: StateAwareRoutineSchedule = {
            entries: [{
                id: 'shop',
                mapId: 'market',
                position: { x: 0, y: 0, z: 0 },
                when: {
                    publicPreconditions: [
                        { key: 'faction', operator: 'greater-than' as never, value: 1 },
                    ],
                },
            }],
        };
        expect(() => resolveStateAwareRoutineTarget(schedule, baseObservation))
            .toThrow('has an unsupported public precondition operator');
    });
});

describe('RoutineAgent.decide — dwell when the resolved target has no action', () => {
    it('falls back to a routine-dwell wait when the target defines no action', () => {
        const schedule: RoutineSchedule = {
            home: { mapId: 'cottage', position: { x: 0, y: 0, z: 0 } },
            entries: [{
                id: 'wander',
                startMinute: 480,
                endMinute: 1_020,
                mapId: 'town',
                position: { x: 0, y: 0, z: 0 },
                // no action — arrival should not trigger the activity evaluator
            }],
        };
        const agent = new RoutineAgent({ schedule });
        const decision = agent.decide({ day: 0, minuteOfDay: 600, mapId: 'town', position: { x: 0, y: 0, z: 0 } });
        expect(decision).toMatchObject({ intent: { kind: 'wait', reason: 'routine-dwell' } });
        expect(decision.activityKey).toBeUndefined();
    });
});

describe('RoutineSlotConflictError', () => {
    it('sorts and freezes the conflicting slot ids', () => {
        const error = new RoutineSlotConflictError(['zebra', 'alpha']);
        expect(error.slotIds).toEqual(['alpha', 'zebra']);
        expect(Object.isFrozen(error.slotIds)).toBe(true);
        expect(error.message).toContain('alpha, zebra');
    });
});

describe('RoutineAgent.resetDay', () => {
    it('clears only completed activities for the given day, keeping others intact', () => {
        const schedule: RoutineSchedule = {
            home: { mapId: 'cottage', position: { x: 0, y: 0, z: 0 } },
            entries: [{
                id: 'forge',
                startMinute: 480,
                endMinute: 1_020,
                mapId: 'town',
                position: { x: 0, y: 0, z: 0 },
                action: 'work-forge',
            }],
        };
        const agent = new RoutineAgent({ schedule });
        const day0 = agent.decide({ day: 0, minuteOfDay: 600, mapId: 'town', position: { x: 0, y: 0, z: 0 } });
        agent.acknowledge(day0, true);
        const day1 = agent.decide({ day: 1, minuteOfDay: 600, mapId: 'town', position: { x: 0, y: 0, z: 0 } });
        agent.acknowledge(day1, true);
        expect(agent.snapshot().completedActivities).toEqual(['0:forge', '1:forge']);

        agent.resetDay(0);
        expect(agent.snapshot().completedActivities).toEqual(['1:forge']);
    });
});
