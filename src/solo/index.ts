/// <reference path="../yuka.d.ts" />
export { SoloCommandAdapter } from './adapter.js';
export { SoloAIBridge } from './vehicle.js';
export { runGovernedPlaythrough } from './playthrough.js';
export type {
    SoloAICommand,
    SoloCommandAdapterOptions,
    SoloCommandResultLike,
    SoloDispatchOutcome,
    SoloJsonValue,
    SoloRuntimeCommandPort,
} from './adapter.js';
export type { SoloAIBridgeOptions, SoloVehicleEntityState } from './vehicle.js';
export type {
    GovernedPlaythroughOptions,
    GovernedPlaythroughReport,
    GovernedPlaythroughStep,
} from './playthrough.js';
