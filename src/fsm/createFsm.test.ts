import { describe, expect, it } from 'vitest';
import { StateMachine, Vehicle } from 'yuka';
import { createCombatVehicle } from '../core/VehicleFactory.js';
import {
    createFsm,
    getStateName,
    restoreFsmState,
    snapshotFsmState,
    validateFsmStateSnapshot,
} from './createFsm.js';

describe('createFsm', () => {
    it('registers every state and enters the initial one, retyped as AIVehicle', () => {
        const vehicle = new Vehicle();
        const aiVehicle = createFsm(vehicle, {
            patrol: createCombatVehicle({ speed: 1 }).stateMachine.states.get('patrol')!,
        }, 'patrol');
        expect(aiVehicle).toBe(vehicle);
        expect(aiVehicle.stateMachine).toBeInstanceOf(StateMachine);
        expect(getStateName(aiVehicle.stateMachine)).toBe('patrol');
    });
});

describe('getStateName', () => {
    it('returns undefined when the machine has no active state', () => {
        const fsm = new StateMachine(new Vehicle());
        expect(getStateName(fsm)).toBeUndefined();
    });
});

describe('Yuka FSM persistence', () => {
    it('round-trips the registered state id without serializing object graphs', () => {
        const vehicle = createCombatVehicle({ speed: 2 }, { initialState: 'chase' });
        const snapshot = snapshotFsmState(vehicle.stateMachine);
        expect(JSON.parse(JSON.stringify(snapshot))).toEqual({
            schema: 'arcade-ai-yuka-fsm',
            version: 1,
            state: 'chase',
        });

        vehicle.stateMachine.changeTo('patrol');
        restoreFsmState(vehicle.stateMachine, snapshot);
        expect(getStateName(vehicle.stateMachine)).toBe('chase');
    });

    it('rejects unknown states and inactive machines', () => {
        const vehicle = createCombatVehicle({ speed: 2 });
        expect(() => restoreFsmState(vehicle.stateMachine, {
            schema: 'arcade-ai-yuka-fsm',
            version: 1,
            state: 'missing',
        })).toThrow(/unknown state/);
        expect(getStateName(vehicle.stateMachine)).toBe('patrol');
        expect(() => restoreFsmState(vehicle.stateMachine, {
            schema: 'arcade-ai-yuka-fsm',
            version: 1,
            state: 'chase',
            injected: true,
        })).toThrow(/unknown field: injected/);
        expect(getStateName(vehicle.stateMachine)).toBe('patrol');
        expect(() => snapshotFsmState(new StateMachine(new Vehicle()))).toThrow(/without an active/);
    });

    it('exports a closed validator for untrusted JSON snapshots', () => {
        expect(validateFsmStateSnapshot(JSON.parse(JSON.stringify({
            schema: 'arcade-ai-yuka-fsm',
            version: 1,
            state: 'attack',
        })))).toEqual({
            schema: 'arcade-ai-yuka-fsm',
            version: 1,
            state: 'attack',
        });
        expect(() => validateFsmStateSnapshot(null)).toThrow(/must be an object/);
        expect(() => validateFsmStateSnapshot({
            schema: 'wrong-schema',
            version: 1,
            state: 'attack',
        })).toThrow(/Unsupported Yuka FSM snapshot/);
        expect(() => validateFsmStateSnapshot({
            schema: 'arcade-ai-yuka-fsm',
            version: 2,
            state: 'attack',
        })).toThrow(/Unsupported Yuka FSM snapshot/);
        expect(() => validateFsmStateSnapshot({
            schema: 'arcade-ai-yuka-fsm',
            version: 1,
            state: '',
        })).toThrow(/non-empty string/);

        let getterCalls = 0;
        const accessorBacked = {
            schema: 'arcade-ai-yuka-fsm',
            version: 1,
        } as Record<string, unknown>;
        Object.defineProperty(accessorBacked, 'state', {
            enumerable: true,
            get: () => {
                getterCalls += 1;
                return 'attack';
            },
        });
        expect(() => validateFsmStateSnapshot(accessorBacked)).toThrow(/enumerable data field/);
        expect(getterCalls).toBe(0);

        const missingSchema = { version: 1, state: 'attack' };
        const originalSchema = Object.getOwnPropertyDescriptor(Object.prototype, 'schema');
        let inheritedGetterCalls = 0;
        try {
            Object.defineProperty(Object.prototype, 'schema', {
                configurable: true,
                value: 'arcade-ai-yuka-fsm',
            });
            expect(() => validateFsmStateSnapshot(missingSchema)).toThrow(/missing field: schema/);

            Object.defineProperty(Object.prototype, 'schema', {
                configurable: true,
                get: () => {
                    inheritedGetterCalls += 1;
                    return 'arcade-ai-yuka-fsm';
                },
            });
            expect(() => validateFsmStateSnapshot(missingSchema)).toThrow(/missing field: schema/);
            expect(inheritedGetterCalls).toBe(0);
        } finally {
            if (originalSchema) {
                Object.defineProperty(Object.prototype, 'schema', originalSchema);
            } else {
                Reflect.deleteProperty(Object.prototype, 'schema');
            }
        }
    });
});
