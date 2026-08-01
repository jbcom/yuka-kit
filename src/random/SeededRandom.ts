const hashSeed = (seed: number | string): number => {
    if (typeof seed === 'number') {
        if (!Number.isFinite(seed)) throw new TypeError('Seed must be finite');
        return seed >>> 0 || 0x6d2b79f5;
    }

    let hash = 0x811c9dc5;
    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0 || 0x6d2b79f5;
};

/** Stateful xorshift32 PRNG for deterministic AI, saves, replays, and tests. */
export class SeededRandom {
    #state: number;

    constructor(seed: number | string) {
        this.#state = hashSeed(seed);
    }

    next(): number {
        let state = this.#state;
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        this.#state = state >>> 0 || 0x6d2b79f5;
        return this.#state / 0x1_0000_0000;
    }

    nextUint32(): number {
        this.next();
        return this.#state;
    }

    /** Return the current restorable xorshift32 state in the range 1..4294967295. */
    snapshot(): number {
        return this.#state;
    }

    /** Restore an exact snapshot; zero is rejected because it is not a restorable generator state. */
    restore(state: number): void {
        if (!Number.isInteger(state) || state < 1 || state > 0xffff_ffff) {
            throw new TypeError('PRNG state must be a restorable unsigned 32-bit integer from 1 through 4294967295');
        }
        this.#state = state;
    }
}
