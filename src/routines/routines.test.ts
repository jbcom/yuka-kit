import { describe, expect, it } from 'vitest';
import { Think } from 'yuka';
import { SNAPSHOT_ARRAY_LIMIT } from '../persistence/snapshotValidation.js';
import { SoloCommandAdapter, type SoloAICommand } from '../solo/adapter.js';
import {
    RoutineAgent,
    RoutineSlotConflictError,
    RoutineSlotNotFoundError,
    resolveRoutineTarget,
    resolveStateAwareRoutineTarget,
    validateRoutineAgentSnapshot,
    type RoutineSchedule,
    type StateAwareRoutineSchedule,
} from './RoutineAgent.js';

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

    it('validates an entire closed snapshot before replacing accepted activity state', () => {
        const observation = {
            day: 2,
            minuteOfDay: 600,
            mapId: 'town',
            position: { x: 12, y: 0, z: 8 },
        };
        const agent = new RoutineAgent({ schedule });
        const activity = agent.decide(observation);
        agent.acknowledge(activity, true);
        const before = agent.snapshot();

        expect(() => agent.restore({
            ...before,
            completedActivities: [...before.completedActivities, 42],
        })).toThrow(/must be strings/);
        expect(agent.snapshot()).toEqual(before);
        expect(agent.decide(observation).intent).toMatchObject({ kind: 'wait' });

        const emptyKeyControl = new RoutineAgent({ schedule });
        emptyKeyControl.restore(before);
        expect(() => agent.restore({
            ...before,
            completedActivities: [''],
        })).toThrow(/non-empty string/);
        expect(agent.snapshot()).toEqual(before);
        expect(agent.decide(observation)).toEqual(emptyKeyControl.decide(observation));

        expect(() => validateRoutineAgentSnapshot({ ...before, injected: true }))
            .toThrow(/unknown field: injected/);
        expect(() => validateRoutineAgentSnapshot({
            ...before,
            completedActivities: [before.completedActivities[0], before.completedActivities[0]],
        })).toThrow(/must be unique/);

        const missingSchema: Record<string, unknown> = { ...before };
        delete missingSchema.schema;
        const originalSchema = Object.getOwnPropertyDescriptor(Object.prototype, 'schema');
        let inheritedGetterCalls = 0;
        try {
            Object.defineProperty(Object.prototype, 'schema', {
                configurable: true,
                value: 'arcade-ai-yuka-routine',
            });
            expect(() => validateRoutineAgentSnapshot(missingSchema)).toThrow(/missing field: schema/);

            Object.defineProperty(Object.prototype, 'schema', {
                configurable: true,
                get: () => {
                    inheritedGetterCalls += 1;
                    return 'arcade-ai-yuka-routine';
                },
            });
            expect(() => validateRoutineAgentSnapshot(missingSchema)).toThrow(/missing field: schema/);
            expect(inheritedGetterCalls).toBe(0);
        } finally {
            if (originalSchema) {
                Object.defineProperty(Object.prototype, 'schema', originalSchema);
            } else {
                Reflect.deleteProperty(Object.prototype, 'schema');
            }
        }

        const sparseActivities = Array<string>(1);
        const originalZero = Object.getOwnPropertyDescriptor(Object.prototype, '0');
        let inheritedElementGetterCalls = 0;
        let inheritedElementError: unknown;
        try {
            Object.defineProperty(Object.prototype, '0', {
                configurable: true,
                get: () => {
                    inheritedElementGetterCalls += 1;
                    return 'poisoned-inherited-activity';
                },
            });
            try {
                validateRoutineAgentSnapshot({
                    schema: 'arcade-ai-yuka-routine',
                    version: 1,
                    completedActivities: sparseActivities,
                });
            } catch (error) {
                inheritedElementError = error;
            }
        } finally {
            if (originalZero) {
                Object.defineProperty(Object.prototype, '0', originalZero);
            } else {
                Reflect.deleteProperty(Object.prototype, '0');
            }
        }
        expect(() => {
            throw inheritedElementError;
        }).toThrow(/activities\[0\].*enumerable data element/);
        expect(inheritedElementGetterCalls).toBe(0);
    });

    it('rejects one-past completed activity persistence without corrupting the boundary', () => {
        const completedActivities = Array.from(
            { length: SNAPSHOT_ARRAY_LIMIT },
            (_, index) => `activity-${String(index).padStart(6, '0')}`,
        );
        const boundary = {
            schema: 'arcade-ai-yuka-routine' as const,
            version: 1 as const,
            completedActivities,
        };
        expect(validateRoutineAgentSnapshot(boundary)).toEqual(boundary);

        const agent = new RoutineAgent({ schedule });
        agent.restore(boundary);
        const before = agent.snapshot();
        expect(before.completedActivities).toHaveLength(SNAPSHOT_ARRAY_LIMIT);
        const decision = agent.decide({
            day: SNAPSHOT_ARRAY_LIMIT,
            minuteOfDay: 600,
            mapId: 'town',
            position: { x: 12, y: 0, z: 8 },
        });
        expect(() => agent.acknowledge(decision, true))
            .toThrow(/completed activity persistence capacity/);
        expect(agent.snapshot()).toEqual(before);
        expect(() => agent.acknowledge({
            ...decision,
            activityKey: completedActivities[0],
        }, true)).not.toThrow();
        expect(validateRoutineAgentSnapshot(agent.snapshot())).toEqual(before);

        expect(() => validateRoutineAgentSnapshot({
            ...boundary,
            completedActivities: [...completedActivities, 'one-past-capacity'],
        })).toThrow(/maximum supported length/);
    }, 30_000);

    it('preserves ordered clock selection and raw map transfers by default', () => {
        const overlapping: RoutineSchedule = {
            home: schedule.home,
            entries: [
                { ...schedule.entries[0], id: 'first' },
                { ...schedule.entries[0], id: 'second' },
            ],
        };
        expect(resolveRoutineTarget(overlapping, 600).id).toBe('first');
        expect(new RoutineAgent({ schedule: overlapping }).decide({
            day: 1,
            minuteOfDay: 600,
            mapId: 'cottage',
            position: { x: 2, y: 0, z: 2 },
        }).intent).toEqual({ kind: 'transfer-map', mapId: 'town', position: { x: 12, y: 0, z: 8 } });
    });
});

const stateAwareSchedule: StateAwareRoutineSchedule = {
    entries: [
        {
            id: 'fallback-work',
            startMinute: 480,
            endMinute: 1_020,
            mapId: 'town',
            position: { x: 10, y: 0, z: 8 },
            action: 'routine:fallback-work',
            fallback: true,
        },
        {
            id: 'public-work',
            startMinute: 480,
            endMinute: 1_020,
            mapId: 'town',
            position: { x: 11, y: 0, z: 8 },
            action: 'routine:public-work',
            when: {
                publicPreconditions: [
                    { key: 'doorOpen', operator: 'equals', value: true },
                    { key: 'custody', operator: 'one-of', values: ['accepted', 'escorted'] },
                ],
            },
        },
        {
            id: 'phase-cue-work',
            startMinute: 480,
            endMinute: 1_020,
            mapId: 'keep',
            anchorId: 'keep-custody-work',
            position: { x: 4, y: 0, z: 6 },
            action: 'routine:phase-cue-work',
            when: {
                phaseIds: ['custody-work', 'custody-aftermath'],
                requiredCueIds: ['gate-admitted'],
                forbiddenCueIds: ['route-blocked'],
                publicPreconditions: [
                    { key: 'doorOpen', operator: 'equals', value: true },
                ],
            },
        },
    ],
};

const stateAwareObservation = () => ({
    day: 4,
    minuteOfDay: 600,
    mapId: 'town',
    position: { x: 10, y: 0, z: 8 },
    phaseId: 'custody-work',
    activeCueIds: ['gate-admitted'] as const,
    publicState: { doorOpen: true, custody: 'accepted' } as const,
    observationTick: 72,
});

describe('state-aware routine selection', () => {
    it('selects phase and cue specificity before public facts and declared fallback', () => {
        expect(resolveStateAwareRoutineTarget(stateAwareSchedule, stateAwareObservation()).id)
            .toBe('phase-cue-work');

        const withoutCue = { ...stateAwareObservation(), activeCueIds: [] };
        expect(resolveStateAwareRoutineTarget(stateAwareSchedule, withoutCue).id)
            .toBe('public-work');

        const withoutPublicAuthority = {
            ...withoutCue,
            publicState: { doorOpen: false, custody: 'accepted' } as const,
        };
        expect(resolveStateAwareRoutineTarget(stateAwareSchedule, withoutPublicAuthority).id)
            .toBe('fallback-work');
    });

    it('uses explicit absence, exclusion, and list operators without treating missing facts as unequal', () => {
        const predicateSchedule: StateAwareRoutineSchedule = {
            entries: [{
                id: 'guarded',
                startMinute: 0,
                endMinute: 0,
                mapId: 'town',
                position: { x: 1, y: 0, z: 1 },
                when: {
                    publicPreconditions: [
                        { key: 'load', operator: 'not-one-of', values: ['unsafe', 'unknown'] },
                        { key: 'wounded', operator: 'not-equals', value: true },
                        { key: 'route', operator: 'exists' },
                        { key: 'quarantine', operator: 'missing' },
                    ],
                },
            }],
        };
        const base = {
            day: 1,
            minuteOfDay: 12,
            mapId: 'town',
            position: { x: 0, y: 0, z: 0 },
        };
        expect(resolveStateAwareRoutineTarget(predicateSchedule, {
            ...base,
            publicState: { load: 'safe', wounded: false, route: null },
        }).id).toBe('guarded');
        expect(() => resolveStateAwareRoutineTarget(predicateSchedule, {
            ...base,
            publicState: { load: 'safe', route: null },
        })).toThrow(RoutineSlotNotFoundError);
    });

    it('supports exact authored days and phase-only slots without invented clock windows', () => {
        const daySchedule: StateAwareRoutineSchedule = {
            entries: [{
                id: 'council-session',
                mapId: 'hall',
                position: { x: 3, y: 0, z: 5 },
                when: { phaseId: 'council', days: [2, 5] },
            }],
        };
        const observation = {
            day: 5,
            minuteOfDay: 1_439,
            mapId: 'hall',
            position: { x: 0, y: 0, z: 0 },
            phaseId: 'council',
        };
        expect(resolveStateAwareRoutineTarget(daySchedule, observation).id).toBe('council-session');
        expect(() => resolveStateAwareRoutineTarget(daySchedule, { ...observation, day: 4 }))
            .toThrow(RoutineSlotNotFoundError);
        expect(() => resolveRoutineTarget(daySchedule as unknown as RoutineSchedule, 600))
            .toThrow('council-session.startMinute must be an integer from 0 through 1439');
    });

    it('supports authored one-sided clock bounds without inventing the missing bound', () => {
        const entries = [
            {
                id: 'all-day-council',
                mapId: 'hall',
                position: { x: 1, y: 0, z: 1 },
                when: { phaseId: 'council' },
            },
            {
                id: 'after-briefing',
                startMinute: 800,
                mapId: 'hall',
                position: { x: 2, y: 0, z: 2 },
                when: { phaseId: 'council' },
            },
        ] as const;
        const observation = {
            day: 2,
            minuteOfDay: 799,
            mapId: 'hall',
            position: { x: 0, y: 0, z: 0 },
            phaseId: 'council',
        };
        for (const orderedEntries of [entries, [...entries].reverse()]) {
            const openEndedSchedule: StateAwareRoutineSchedule = { entries: orderedEntries };
            expect(resolveStateAwareRoutineTarget(openEndedSchedule, observation).id)
                .toBe('all-day-council');
            expect(resolveStateAwareRoutineTarget(openEndedSchedule, {
                ...observation, minuteOfDay: 800,
            }).id).toBe('after-briefing');
        }
    });

    it('selects the narrowest matching authored phase set and rejects dual phase syntax', () => {
        const phaseSchedule: StateAwareRoutineSchedule = {
            entries: [
                {
                    id: 'broad-phase',
                    mapId: 'hall',
                    position: { x: 1, y: 0, z: 1 },
                    when: { phaseIds: ['council', 'aftermath'] },
                },
                {
                    id: 'exact-phase',
                    mapId: 'hall',
                    position: { x: 2, y: 0, z: 2 },
                    when: { phaseId: 'council' },
                },
            ],
        };
        const observation = {
            day: 2,
            minuteOfDay: 600,
            mapId: 'hall',
            position: { x: 0, y: 0, z: 0 },
            phaseId: 'council',
        };
        expect(resolveStateAwareRoutineTarget(phaseSchedule, observation).id).toBe('exact-phase');
        expect(resolveStateAwareRoutineTarget(phaseSchedule, {
            ...observation, phaseId: 'aftermath',
        }).id).toBe('broad-phase');

        expect(() => resolveStateAwareRoutineTarget({
            entries: [{
                id: 'invalid-phase',
                mapId: 'hall',
                position: { x: 0, y: 0, z: 0 },
                when: { phaseId: 'council', phaseIds: ['council'] },
            }],
        }, observation)).toThrow('must not define both phaseId and phaseIds');
    });

    it('fails closed on equal-specificity overlaps independently of source order', () => {
        const slots = [
            {
                id: 'b-slot',
                startMinute: 0,
                endMinute: 0,
                mapId: 'town',
                position: { x: 1, y: 0, z: 1 },
                when: { phaseId: 'open' },
            },
            {
                id: 'a-slot',
                startMinute: 0,
                endMinute: 0,
                mapId: 'town',
                position: { x: 2, y: 0, z: 2 },
                when: { requiredCueIds: ['open'] },
            },
        ] as const;
        for (const entries of [slots, [...slots].reverse()]) {
            const decide = () => resolveStateAwareRoutineTarget(
                { entries },
                {
                    day: 1,
                    minuteOfDay: 600,
                    mapId: 'town',
                    position: { x: 0, y: 0, z: 0 },
                    phaseId: 'open',
                    activeCueIds: ['open'],
                },
            );
            expect(decide).toThrow(RoutineSlotConflictError);
            try {
                decide();
            } catch (error) {
                expect(error).toMatchObject({ slotIds: ['a-slot', 'b-slot'] });
            }
        }
    });

    it('rejects invalid or ambiguity-inflating public contracts', () => {
        expect(() => resolveStateAwareRoutineTarget({
            entries: [{
                id: 'invalid',
                startMinute: 0,
                endMinute: 0,
                mapId: 'town',
                position: { x: 0, y: 0, z: 0 },
                when: {
                    requiredCueIds: ['same'],
                    forbiddenCueIds: ['same'],
                },
            }],
        }, stateAwareObservation())).toThrow('both requires and forbids cue same');

        expect(() => resolveStateAwareRoutineTarget({
            entries: [{
                id: 'invalid',
                startMinute: 0,
                endMinute: 0,
                mapId: 'town',
                position: { x: 0, y: 0, z: 0 },
                when: {
                    publicPreconditions: [
                        { key: 'door', operator: 'equals', value: true },
                        { key: 'door', operator: 'not-equals', value: false },
                    ],
                },
            }],
        }, stateAwareObservation())).toThrow('duplicate public precondition door');

        expect(() => resolveStateAwareRoutineTarget(stateAwareSchedule, {
            ...stateAwareObservation(),
            publicState: { route: { hidden: true } as never },
        })).toThrow('publicState.route must be a finite scalar public value');
    });
});

describe('state-aware RoutineAgent boundary', () => {
    it('maps cross-map travel to an immutable opt-in action-intent context', () => {
        let mapperCalls = 0;
        const observation = stateAwareObservation();
        const agent = new RoutineAgent({
            schedule: stateAwareSchedule,
            slotSelection: 'state-aware',
            mapCrossMapTransition: (context) => {
                mapperCalls += 1;
                expect(Object.isFrozen(context)).toBe(true);
                expect(Object.isFrozen(context.observation)).toBe(true);
                expect(Object.isFrozen(context.observation.position)).toBe(true);
                expect(Object.isFrozen(context.observation.activeCueIds)).toBe(true);
                expect(Object.isFrozen(context.observation.publicState)).toBe(true);
                expect(Object.isFrozen(context.target)).toBe(true);
                expect(Object.isFrozen(context.target.position)).toBe(true);
                return {
                    kind: 'action',
                    action: 'request-scheduled-transition',
                    payload: {
                        slotId: context.target.id,
                        destinationMapId: context.target.mapId,
                        destinationAnchorId: context.target.anchorId,
                        observationTick: context.observation.observationTick,
                    },
                };
            },
        });

        expect(agent.decide(observation).intent).toEqual({
            kind: 'action',
            action: 'request-scheduled-transition',
            payload: {
                slotId: 'phase-cue-work',
                destinationMapId: 'keep',
                destinationAnchorId: 'keep-custody-work',
                observationTick: 72,
            },
        });
        expect(mapperCalls).toBe(1);
        expect(observation).toEqual(stateAwareObservation());
    });

    it('dispatches the mapped transition only as an AI-source Solo action command', () => {
        const commands: SoloAICommand[] = [];
        const adapter = new SoloCommandAdapter({
            dispatch(command) {
                commands.push(command);
                return { accepted: true, tick: 73 };
            },
        });
        const agent = new RoutineAgent({
            schedule: stateAwareSchedule,
            slotSelection: 'state-aware',
            mapCrossMapTransition: ({ target, observation }) => ({
                kind: 'action',
                action: 'request-scheduled-transition',
                payload: {
                    routineId: 'routine:test/v1',
                    slotId: target.id,
                    destinationMapId: target.mapId,
                    destinationAnchorId: target.anchorId,
                    observationTick: observation.observationTick,
                    idempotencyKey: `routine:test/v1:${target.id}:${observation.observationTick}`,
                },
            }),
        });
        const observation = stateAwareObservation();
        const decision = agent.decide(observation);
        const outcome = adapter.dispatch('npc-test', observation.position, decision.intent);

        expect(outcome.result).toEqual({ accepted: true, tick: 73 });
        expect(commands).toEqual([{
            type: 'action',
            entityId: 'npc-test',
            action: 'request-scheduled-transition',
            payload: {
                routineId: 'routine:test/v1',
                slotId: 'phase-cue-work',
                destinationMapId: 'keep',
                destinationAnchorId: 'keep-custody-work',
                observationTick: 72,
                idempotencyKey: 'routine:test/v1:phase-cue-work:72',
            },
            source: 'ai',
        }]);
        expect(commands.some((command) => command.type === 'transfer-map')).toBe(false);
    });

    it('persists only accepted state-aware activity keys and restores without duplication', () => {
        const activityObservation = (day: number) => ({
            ...stateAwareObservation(),
            day,
            mapId: 'keep',
            position: { x: 4, y: 0, z: 6 },
        });
        const agent = new RoutineAgent({
            schedule: stateAwareSchedule,
            slotSelection: 'state-aware',
        });

        const rejected = agent.decide(activityObservation(5));
        expect(rejected.intent).toMatchObject({ kind: 'action', action: 'routine:phase-cue-work' });
        agent.acknowledge(rejected, false);
        expect(agent.snapshot()).toEqual({
            schema: 'arcade-ai-yuka-routine',
            version: 1,
            completedActivities: [],
        });

        agent.acknowledge(rejected, true);
        const earlier = agent.decide(activityObservation(4));
        agent.acknowledge(earlier, true);
        expect(agent.snapshot()).toEqual({
            schema: 'arcade-ai-yuka-routine',
            version: 1,
            completedActivities: ['4:phase-cue-work', '5:phase-cue-work'],
        });

        const restored = new RoutineAgent({
            schedule: stateAwareSchedule,
            slotSelection: 'state-aware',
        });
        restored.restore(agent.snapshot());
        expect(restored.decide(activityObservation(4)).intent).toEqual({
            kind: 'wait',
            reason: 'routine-dwell',
        });
    });

    it('dispatches nothing when slot resolution conflicts', () => {
        let mapperCalls = 0;
        const conflicting: StateAwareRoutineSchedule = {
            entries: [
                {
                    id: 'left', startMinute: 0, endMinute: 0,
                    mapId: 'left', position: { x: 0, y: 0, z: 0 },
                },
                {
                    id: 'right', startMinute: 0, endMinute: 0,
                    mapId: 'right', position: { x: 0, y: 0, z: 0 },
                },
            ],
        };
        const agent = new RoutineAgent({
            schedule: conflicting,
            slotSelection: 'state-aware',
            mapCrossMapTransition: () => {
                mapperCalls += 1;
                return { kind: 'action', action: 'must-not-run' };
            },
        });
        expect(() => agent.decide({
            day: 1, minuteOfDay: 1, mapId: 'home', position: { x: 0, y: 0, z: 0 },
        })).toThrow(RoutineSlotConflictError);
        expect(mapperCalls).toBe(0);
    });

    it('dispatches nothing when no authored slot or declared fallback matches', () => {
        let mapperCalls = 0;
        const agent = new RoutineAgent({
            schedule: {
                entries: [{
                    id: 'only-on-day-two',
                    mapId: 'keep',
                    position: { x: 0, y: 0, z: 0 },
                    when: { days: [2] },
                }],
            },
            slotSelection: 'state-aware',
            mapCrossMapTransition: () => {
                mapperCalls += 1;
                return { kind: 'action', action: 'must-not-run' };
            },
        });
        expect(() => agent.decide({
            day: 1, minuteOfDay: 1, mapId: 'home', position: { x: 0, y: 0, z: 0 },
        })).toThrow(RoutineSlotNotFoundError);
        expect(mapperCalls).toBe(0);
    });

    it('rejects accidental state selectors in legacy mode and non-action mapper results', () => {
        expect(() => new RoutineAgent({ schedule: stateAwareSchedule } as never))
            .toThrow('State-aware routine slots require slotSelection: state-aware');

        const agent = new RoutineAgent({
            schedule: stateAwareSchedule,
            slotSelection: 'state-aware',
            mapCrossMapTransition: (() => ({
                kind: 'transfer-map', mapId: 'keep', position: { x: 0, y: 0, z: 0 },
            })) as never,
        });
        expect(() => agent.decide(stateAwareObservation()))
            .toThrow('mapCrossMapTransition must return a non-empty action intent');
    });

    it('mutation shield: every authored gate independently changes the selected slot', () => {
        const base = stateAwareObservation();
        const winner = (observation: ReturnType<typeof stateAwareObservation>) => (
            resolveStateAwareRoutineTarget(stateAwareSchedule, observation).id
        );
        expect(winner(base)).toBe('phase-cue-work');
        expect(winner({ ...base, phaseId: 'other-phase' })).toBe('public-work');
        expect(winner({ ...base, activeCueIds: [] })).toBe('public-work');
        expect(winner({ ...base, activeCueIds: ['gate-admitted', 'route-blocked'] })).toBe('public-work');
        expect(winner({
            ...base,
            activeCueIds: [],
            publicState: { ...base.publicState, doorOpen: false },
        })).toBe('fallback-work');
    });
});
