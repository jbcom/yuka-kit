import { StateMachine, type State, type Vehicle } from 'yuka';
import type { AIVehicle } from '../core/types.js';
/**
 * Attach a StateMachine built from `states` to `vehicle` and enter
 * `initialState`. Returns the vehicle retyped as AIVehicle.
 */
export function createFsm(
    vehicle: Vehicle,
    states: Record<string, State>,
    initialState: string,
): AIVehicle {
    const fsm = new StateMachine(vehicle);
    for (const [id, state] of Object.entries(states)) {
        fsm.add(id, state);
    }
    fsm.changeTo(initialState);
    const aiVehicle = vehicle as AIVehicle;
    aiVehicle.stateMachine = fsm;
    return aiVehicle;
}
/**
 * Resolve the string id of the FSM's current state by looking it up in the
 * states map (yuka states don't know their own registration id).
 * Returns undefined when no state is active.
 */
export function getStateName(fsm: StateMachine): string | undefined {
    if (!fsm.currentState)
        return undefined;
    for (const [id, state] of fsm.states) {
        if (state === fsm.currentState)
            return id;
    }
    return undefined;
}
