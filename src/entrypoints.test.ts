import { describe, expect, it } from 'vitest';

/**
 * Smoke test for the package.json "exports" subpaths themselves — every
 * name a consumer can import from `@jbcom/yuka-kit/koota` and
 * `@jbcom/yuka-kit/solo` must actually resolve through each barrel, not
 * just through the individual source module it re-exports.
 */
describe('koota entry-point barrel', () => {
    it('re-exports every documented koota symbol', async () => {
        const api = await import('./koota/index.js');
        expect(typeof api.AIBridge).toBe('function');
        expect(api.AIMemory).toBeDefined();
        expect(api.AIState).toBeDefined();
        expect(api.BossType).toBeDefined();
        expect(api.EnemyType).toBeDefined();
        expect(api.Intent).toBeDefined();
        expect(api.YukaRef).toBeDefined();
    });
});

describe('solo entry-point barrel', () => {
    it('re-exports every documented Solo symbol', async () => {
        const api = await import('./solo/index.js');
        expect(typeof api.SoloCommandAdapter).toBe('function');
        expect(typeof api.SoloAIBridge).toBe('function');
        expect(typeof api.runGovernedPlaythrough).toBe('function');
        expect(typeof api.createAICommandDispatchEnvelope).toBe('function');
        expect(typeof api.validateAICommandDispatchContext).toBe('function');
        expect(typeof api.validateAICommandDispatchEnvelope).toBe('function');
        expect(typeof api.validateStrictSoloAICommand).toBe('function');
        expect(typeof api.AICommandEnvelopeValidationError).toBe('function');
        expect(typeof api.AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA).toBe('string');
    });
});
