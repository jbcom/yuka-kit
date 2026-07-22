import type { Vec3Like } from './core/types.js';

export type AgentIntent =
    | { kind: 'move-to'; target: Vec3Like; speed?: number }
    | { kind: 'move-away'; from: Vec3Like; speed?: number }
    | { kind: 'action'; action: string; payload?: unknown }
    | { kind: 'transfer-map'; mapId: string; position: Vec3Like }
    | { kind: 'stop' }
    | { kind: 'wait'; reason?: string };

