import { describe, expect, it } from 'vitest';
import { SeededRandom } from './SeededRandom.js';

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
