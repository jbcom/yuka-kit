/// <reference path="../yuka.d.ts" />
/**
 * @module @jbcom/yuka-kit/koota
 * Koota-ECS bridge for the AI toolkit. Imported separately from the root
 * barrel so games not on koota never pull the koota dependency.
 */
export { AIBridge, type AIBridgeTraits, type HealthSchema, type Vec3Schema } from './bridge.js';
export { AIMemory, AIState, BossType, EnemyType, Intent, YukaRef } from './traits.js';
