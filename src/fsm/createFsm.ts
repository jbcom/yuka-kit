import { StateMachine, type State, type Vehicle } from 'yuka';
import type { AIVehicle } from '../core/types.js';

export interface FsmStateSnapshot {
    schema: 'arcade-ai-yuka-fsm';
    version: 1;
    state: string;
}
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

/** Capture the registered state id without serializing Yuka object graphs. */
export function snapshotFsmState(fsm: StateMachine): FsmStateSnapshot {
    const state = getStateName(fsm);
    if (!state) throw new TypeError('Cannot snapshot an FSM without an active registered state');
    return { schema: 'arcade-ai-yuka-fsm', version: 1, state };
}

/** Restore a validated registered state id into an existing Yuka FSM. */
export function restoreFsmState(fsm: StateMachine, snapshot: FsmStateSnapshot): void {
    if (snapshot.schema !== 'arcade-ai-yuka-fsm' || snapshot.version !== 1) {
        throw new TypeError('Unsupported Yuka FSM snapshot');
    }
    if (!fsm.states.has(snapshot.state)) {
        throw new TypeError(`FSM snapshot references unknown state: ${snapshot.state}`);
    }
    if (!fsm.in(snapshot.state)) fsm.changeTo(snapshot.state);
}
