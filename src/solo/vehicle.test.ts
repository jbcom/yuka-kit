import { describe, expect, it } from 'vitest';
import { Vehicle } from 'yuka';
import { createCombatVehicle } from '../core/VehicleFactory.js';
import { getStateName } from '../fsm/createFsm.js';
import { SoloCommandAdapter, type SoloAICommand } from './adapter.js';
import { SoloAIBridge } from './vehicle.js';

function recordingAdapter() {
    const commands: SoloAICommand[] = [];
    const adapter = new SoloCommandAdapter({
        dispatch(command) {
            commands.push(command);
            return { accepted: true, tick: commands.length };
        },
    });
    return { adapter, commands };
}

describe('SoloAIBridge.syncFromSolo', () => {
    it('leaves vehicle velocity untouched when the entity reports no velocity', () => {
        const { adapter } = recordingAdapter();
        const bridge = new SoloAIBridge(adapter);
        const vehicle = new Vehicle();
        vehicle.velocity.set(9, 0, 9);
        bridge.syncFromSolo(vehicle, { id: 'slime', position: { x: 0, y: 0 } });
        expect(vehicle.velocity).toMatchObject({ x: 9, y: 0, z: 9 });
    });

    it('transitions an attached FSM to the dead state once hp reaches 0', () => {
        const { adapter } = recordingAdapter();
        const bridge = new SoloAIBridge(adapter);
        const vehicle = createCombatVehicle({ speed: 2 });
        bridge.syncFromSolo(vehicle, { id: 'slime', position: { x: 0, y: 0 }, stats: { hp: 0 } });
        expect(getStateName(vehicle.stateMachine)).toBe('dead');
    });

    it('does not re-enter the dead state once already dead', () => {
        const { adapter } = recordingAdapter();
        const bridge = new SoloAIBridge(adapter);
        const vehicle = createCombatVehicle({ speed: 2 }, { initialState: 'dead' });
        expect(() => bridge.syncFromSolo(vehicle, {
            id: 'slime',
            position: { x: 0, y: 0 },
            stats: { hp: 0 },
        })).not.toThrow();
        expect(getStateName(vehicle.stateMachine)).toBe('dead');
    });

    it('does nothing when hp reaches 0 on a vehicle without an attached FSM', () => {
        const { adapter } = recordingAdapter();
        const bridge = new SoloAIBridge(adapter);
        const vehicle = new Vehicle();
        expect(() => bridge.syncFromSolo(vehicle, {
            id: 'slime',
            position: { x: 0, y: 0 },
            stats: { hp: 0 },
        })).not.toThrow();
    });

    it('treats a missing stats block as full health (no dead transition)', () => {
        const { adapter } = recordingAdapter();
        const bridge = new SoloAIBridge(adapter);
        const vehicle = createCombatVehicle({ speed: 2 });
        bridge.syncFromSolo(vehicle, { id: 'slime', position: { x: 0, y: 0 } });
        expect(getStateName(vehicle.stateMachine)).toBe('patrol');
    });
});

describe('SoloAIBridge.dispatchToSolo', () => {
    it('waits when movement is unavailable', () => {
        const { adapter } = recordingAdapter();
        const bridge = new SoloAIBridge(adapter);
        const vehicle = new Vehicle();
        vehicle.velocity.set(5, 0, 0);
        expect(bridge.dispatchToSolo(vehicle, { id: 'slime', position: { x: 0, y: 0 } }, false))
            .toEqual({ waited: true });
    });

    it('waits at near-zero speed when the entity was already stationary', () => {
        const { adapter } = recordingAdapter();
        const bridge = new SoloAIBridge(adapter);
        const vehicle = new Vehicle();
        vehicle.velocity.set(0, 0, 0);
        const outcome = bridge.dispatchToSolo(vehicle, {
            id: 'slime',
            position: { x: 0, y: 0 },
            moving: false,
        });
        expect(outcome).toEqual({ waited: true });
    });

    it('dispatches a stop command at near-zero speed when the entity was moving', () => {
        const { adapter, commands } = recordingAdapter();
        const bridge = new SoloAIBridge(adapter);
        const vehicle = new Vehicle();
        vehicle.velocity.set(0, 0, 0);
        const outcome = bridge.dispatchToSolo(vehicle, {
            id: 'slime',
            position: { x: 0, y: 0 },
            moving: true,
        });
        expect(outcome.command).toEqual({ type: 'stop', entityId: 'slime', source: 'ai' });
        expect(commands).toEqual([{ type: 'stop', entityId: 'slime', source: 'ai' }]);
    });

    it('honors a custom velocityEpsilon', () => {
        const { adapter, commands } = recordingAdapter();
        const bridge = new SoloAIBridge(adapter, { velocityEpsilon: 1 });
        const vehicle = new Vehicle();
        vehicle.velocity.set(0.5, 0, 0);
        bridge.dispatchToSolo(vehicle, { id: 'slime', position: { x: 0, y: 0 }, moving: true });
        expect(commands[0]).toMatchObject({ type: 'stop' });
    });
});
