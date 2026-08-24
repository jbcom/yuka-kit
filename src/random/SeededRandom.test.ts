import { describe, expect, it } from 'vitest';
import { SeededRandom } from './SeededRandom.js';

describe('SeededRandom construction', () => {
    it('rejects a non-finite numeric seed', () => {
        expect(() => new SeededRandom(Number.POSITIVE_INFINITY)).toThrow('Seed must be finite');
        expect(() => new SeededRandom(Number.NaN)).toThrow('Seed must be finite');
    });

    it('produces deterministic, repeatable sequences for the same numeric seed', () => {
        const a = new SeededRandom(12345);
        const b = new SeededRandom(12345);
        expect(a.next()).toBe(b.next());
        expect(a.next()).toBe(b.next());
    });

    it('produces deterministic, repeatable sequences for the same string seed', () => {
        const a = new SeededRandom('quest-seed');
        const b = new SeededRandom('quest-seed');
        expect(a.next()).toBe(b.next());
    });

    it('produces different sequences for different seeds', () => {
        const a = new SeededRandom('seed-a');
        const b = new SeededRandom('seed-b');
        expect(a.next()).not.toBe(b.next());
    });

    it('next() returns a value in [0, 1)', () => {
        const random = new SeededRandom('range-check');
        for (let i = 0; i < 20; i += 1) {
            const value = random.next();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });
});

describe('SeededRandom persistence', () => {
    it('restores every state the generator can emit byte-exactly', () => {
        const source = new SeededRandom('persistent-stream');
        source.nextUint32();
        const snapshot = source.snapshot();
        const restored = new SeededRandom('different-seed');
        restored.restore(snapshot);
        expect(restored.snapshot()).toBe(snapshot);
        expect(restored.nextUint32()).toBe(source.nextUint32());
    });

    it('rejects zero because it is not a restorable xorshift32 state', () => {
        const random = new SeededRandom('persistent-stream');
        const before = random.snapshot();
        expect(() => random.restore(0)).toThrow(
            'PRNG state must be a restorable unsigned 32-bit integer from 1 through 4294967295',
        );
        expect(random.snapshot()).toBe(before);
    });

    it.each([-1, 1.5, 0x1_0000_0000, Number.NaN])('rejects invalid state %s without mutation', (state) => {
        const random = new SeededRandom(123);
        const before = random.snapshot();
        expect(() => random.restore(state)).toThrow(TypeError);
        expect(random.snapshot()).toBe(before);
    });
});
