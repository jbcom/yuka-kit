/**
 * Koota traits for yuka-driven AI.
 * The only ECS-specific part of this package — non-koota games use the rest
 * of the modules directly on plain yuka objects.
 */
import { trait } from 'koota';
import type { GameEntity } from 'yuka';
import type { PerceptionMemory } from '../perception/memory.js';
/** Current AI behavioral state name. */
export const AIState = trait({ state: 'idle' });
/**
 * Reference to the live yuka Vehicle/GameEntity. Callback-based (AoS) since
 * it holds a stateful class instance, not POD.
 */
export const YukaRef = trait(() => ({ vehicle: null as GameEntity | null }));
/** AI perception memory — last known target (player) position. */
export const AIMemory = trait({ lastSeenX: 0, lastSeenY: 0, lastSeenZ: 0, lastSeenTime: 0 });
/** Last noise heard: where, when, how loudly (perceived), and what kind. */
export const AIHearing = trait({
    lastHeardX: 0,
    lastHeardY: 0,
    lastHeardZ: 0,
    lastHeardTime: 0,
    lastHeardLoudness: 0,
    lastHeardKind: '',
});
/**
 * The entity's per-target `PerceptionMemory`. Callback-based (AoS) because it
 * holds a stateful class instance, like `YukaRef`.
 */
export const AIPerceptionMemory = trait(() => ({ memory: null as PerceptionMemory | null }));
/**
 * The strongest remembered target, mirrored from `PerceptionMemory` by
 * `AIBridge.syncPerceptionMemory`. `sense` is `'sight'`, `'hearing'`, or `''`
 * when nothing is remembered.
 */
export const AIAwareness = trait({
    targetId: '',
    confidence: 0,
    x: 0,
    y: 0,
    z: 0,
    time: 0,
    sense: '' as '' | 'sight' | 'hearing',
});
/** Goal intent output from the yuka goal system. */
export const Intent = trait({ goal: '' });
/** Enemy configuration ID (references the game's content data). */
export const EnemyType = trait({ configId: '' });
/** Boss configuration ID and current phase. */
export const BossType = trait({ configId: '', phase: 1 });
