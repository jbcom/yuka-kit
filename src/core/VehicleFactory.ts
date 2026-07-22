import { Vehicle } from 'yuka';
import {
    AttackState,
    ChaseState,
    DeadState,
    PatrolState,
    type AttackStateOptions,
    type ChaseStateOptions,
    type PatrolStateOptions,
} from '../fsm/states/index.js';
import { createFsm } from '../fsm/createFsm.js';
import type { AIVehicle, AIVehicleConfig } from './types.js';
/** Create a bare yuka Vehicle from a movement config (no FSM, no brain). */
export function createVehicle(config: AIVehicleConfig): Vehicle {
    const vehicle = new Vehicle();
    vehicle.mass = config.mass ?? 1;
    vehicle.maxSpeed = config.speed;
    vehicle.maxForce = config.maxForce ?? config.speed * 2;
    return vehicle;
}
export interface CombatVehicleOptions {
    target?: Vehicle;
    patrol?: PatrolStateOptions;
    chase?: ChaseStateOptions;
    attack?: AttackStateOptions;
    onAttack?: (owner: Vehicle) => void;
    initialState?: 'patrol' | 'chase' | 'attack' | 'dead';
}
/**
 * Create a combat-ready AIVehicle with the standard patrol/chase/attack/dead
 * FSM (bok's EnemyVehicleFactory, genericized off EnemyConfig).
 */
export function createCombatVehicle(
    config: AIVehicleConfig,
    options: CombatVehicleOptions = {},
): AIVehicle {
    const vehicle = createVehicle(config);
    const patrol = new PatrolState(options.patrol);
    const chase = new ChaseState(options.chase);
    const attack = new AttackState(options.attack);
    const dead = new DeadState();
    if (options.target) {
        patrol.setTarget(options.target);
        chase.setTarget(options.target);
        attack.setTarget(options.target);
    }
    if (options.onAttack) {
        attack.onAttack = options.onAttack;
    }
    return createFsm(vehicle, { patrol, chase, attack, dead }, options.initialState ?? 'patrol');
}
