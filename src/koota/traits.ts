/**
 * Koota traits for yuka-driven AI (from bok's src/traits/ai.ts).
 * The only ECS-specific part of this package — non-koota games use the rest
 * of the modules directly on plain yuka objects.
 */
import { trait } from 'koota';
import type { GameEntity } from 'yuka';
/** Current AI behavioral state name. */
export const AIState = trait({ state: 'idle' });
/**
 * Reference to the live yuka Vehicle/GameEntity. Callback-based (AoS) since
 * it holds a stateful class instance, not POD.
 */
export const YukaRef = trait(() => ({ vehicle: null as GameEntity | null }));
/** AI perception memory — last known target (player) position. */
export const AIMemory = trait({ lastSeenX: 0, lastSeenY: 0, lastSeenZ: 0, lastSeenTime: 0 });
/** Goal intent output from the yuka goal system. */
export const Intent = trait({ goal: '' });
/** Enemy configuration ID (references the game's content data). */
export const EnemyType = trait({ configId: '' });
/** Boss configuration ID and current phase. */
export const BossType = trait({ configId: '', phase: 1 });
