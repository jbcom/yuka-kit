import type { StateMachine, Think, Vehicle } from 'yuka';

/** Extended Vehicle with an attached StateMachine (and optionally a Think brain). */
export interface AIVehicle extends Vehicle {
  stateMachine: StateMachine;
  brain?: Think;
}

/** Minimal movement config accepted by the vehicle factory. */
export interface AIVehicleConfig {
  speed: number;
  mass?: number;
  maxForce?: number;
}

export type AIType = 'melee' | 'ranged' | 'pack' | 'ambush' | 'boss' | 'passive';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}
