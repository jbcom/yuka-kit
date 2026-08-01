/// <reference path="../yuka.d.ts" />
export { SoloCommandAdapter } from './adapter.js';
export {
    AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA,
    AICommandEnvelopeValidationError,
    createAICommandDispatchEnvelope,
    validateAICommandDispatchContext,
    validateAICommandDispatchEnvelope,
    validateStrictSoloAICommand,
} from './strict.js';
export { SoloAIBridge } from './vehicle.js';
export { runGovernedPlaythrough } from './playthrough.js';
export type {
    SoloAICommand,
    SoloCommandAdapterOptions,
    SoloCommandResultLike,
    SoloDispatchOutcome,
    SoloJsonValue,
    SoloRuntimeCommandPort,
    AIEnvelopeDispatchOutcome,
    AIEnvelopeDispatchRejectionCode,
} from './adapter.js';
export type {
    AICommandDispatchContext,
    AICommandDispatchEnvelope,
    AICommandEnvelopeValidationCode,
    CreateAICommandDispatchEnvelopeOptions,
    StrictSoloAICommand,
    StrictSoloJsonValue,
    TrustedAICommandCompiler,
} from './strict.js';
export type { SoloAIBridgeOptions, SoloVehicleEntityState } from './vehicle.js';
export type {
    GovernedPlaythroughOptions,
    GovernedPlaythroughReport,
    GovernedPlaythroughStep,
} from './playthrough.js';
