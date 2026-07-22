import { describe, expect, it } from 'vitest';
import { StateMachine, Vehicle } from 'yuka';
import { createCombatVehicle } from '../core/VehicleFactory.js';
import { getStateName, restoreFsmState, snapshotFsmState } from './createFsm.js';

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
        expect(() => snapshotFsmState(new StateMachine(new Vehicle()))).toThrow(/without an active/);
    });
});
