import { describe, expect, it } from 'vitest';
import {
    attenuateNoise,
    createHearingSensor,
    NoiseBuffer,
    perceiveNoise,
    type NoiseEvent,
} from '../index.js';

const at = (x: number, z = 0) => ({ x, y: 0, z });
const noise = (x: number, loudness: number, extra: Partial<NoiseEvent> = {}): NoiseEvent => ({
    position: at(x), loudness, kind: 'footstep', time: 0, ...extra,
});

describe('attenuateNoise', () => {
    it('implements the Web Audio inverse model by default', () => {
        expect(attenuateNoise(0)).toBe(1);
        expect(attenuateNoise(1)).toBe(1);
        expect(attenuateNoise(4)).toBe(0.25);
        expect(attenuateNoise(4, { refDistance: 2 })).toBe(0.5);
        expect(attenuateNoise(5, { rolloffFactor: 2 })).toBeCloseTo(1 / 9);
    });

    it('implements the exponential model, which is inverse-square at rolloff 2', () => {
        expect(attenuateNoise(4, { distanceModel: 'exponential', rolloffFactor: 2 })).toBe(1 / 16);
        expect(attenuateNoise(0.5, { distanceModel: 'exponential' })).toBe(1);
    });

    it('implements the linear model, clamped to [refDistance, maxDistance]', () => {
        const linear = { distanceModel: 'linear' as const, refDistance: 1, maxDistance: 11 };
        expect(attenuateNoise(0, linear)).toBe(1);
        expect(attenuateNoise(6, linear)).toBe(0.5);
        expect(attenuateNoise(50, linear)).toBe(0);
        expect(attenuateNoise(50, { ...linear, rolloffFactor: 0.5 })).toBe(0.5);
    });

    it('rejects invalid distances and options', () => {
        expect(() => attenuateNoise(-1)).toThrow(/distance must be finite and non-negative/);
        expect(() => attenuateNoise(Number.NaN)).toThrow(/distance/);
        expect(() => attenuateNoise(1, { distanceModel: 'cubic' as never })).toThrow(/distanceModel/);
        expect(() => attenuateNoise(1, { refDistance: 0 })).toThrow(/refDistance/);
        expect(() => attenuateNoise(1, { maxDistance: 1 })).toThrow(/maxDistance/);
        expect(() => attenuateNoise(1, { rolloffFactor: -1 })).toThrow(/rolloffFactor/);
        expect(() => attenuateNoise(1, { distanceModel: 'linear', rolloffFactor: 2 })).toThrow(/at most 1/);
    });
});

describe('perceiveNoise', () => {
    it('applies loudness, distance, and the listener threshold', () => {
        const heard = perceiveNoise(at(0), noise(4, 8), { threshold: 1 });
        expect(heard).toEqual({ event: noise(4, 8), perceived: 2, distance: 4, transmission: 1 });
        expect(perceiveNoise(at(0), noise(4, 8), { threshold: 2.5 })).toBeNull();
        // A sharper listener (lower threshold) hears what a duller one misses.
        expect(perceiveNoise(at(0), noise(16, 8), { threshold: 0.4 })?.perceived).toBe(0.5);
        expect(perceiveNoise(at(0), noise(16, 8), { threshold: 1 })).toBeNull();
    });

    it('scales by occlusion and only asks about otherwise-audible noises', () => {
        const calls: number[] = [];
        const occlusion = (from: { x: number }) => {
            calls.push(from.x);
            return 0.25;
        };
        expect(perceiveNoise(at(0), noise(2, 8), { threshold: 0.5, occlusion })?.perceived).toBe(1);
        expect(perceiveNoise(at(0), noise(2, 8), { threshold: 2, occlusion })).toBeNull();
        expect(perceiveNoise(at(0), noise(100, 8), { threshold: 2, occlusion })).toBeNull();
        expect(calls).toEqual([2, 2]);
    });

    it('treats a silent noise as unheard even with a zero threshold', () => {
        expect(perceiveNoise(at(0), noise(1, 0), { threshold: 0 })).toBeNull();
        expect(perceiveNoise(at(0), noise(1, 1), { threshold: 0, occlusion: () => 0 })).toBeNull();
    });

    it('rejects malformed events, listeners, options, and occlusion results', () => {
        expect(() => perceiveNoise(at(0), noise(1, -1), { threshold: 0 })).toThrow(/loudness/);
        expect(() => perceiveNoise(at(0), noise(1, 1, { kind: '' }), { threshold: 0 })).toThrow(/kind/);
        expect(() => perceiveNoise(at(0), noise(1, 1, { time: Number.NaN }), { threshold: 0 })).toThrow(/time/);
        expect(() => perceiveNoise(at(0), noise(1, 1, { source: '' }), { threshold: 0 })).toThrow(/source/);
        expect(() => perceiveNoise(at(0), { ...noise(1, 1), position: { x: 1, y: Number.NaN, z: 0 } }, { threshold: 0 }))
            .toThrow(/position/);
        expect(() => perceiveNoise(at(0), null as never, { threshold: 0 })).toThrow(/must be an object/);
        expect(() => perceiveNoise({ x: Number.NaN, y: 0, z: 0 }, noise(1, 1), { threshold: 0 })).toThrow(/Listener/);
        expect(() => perceiveNoise(at(0), noise(1, 1), { threshold: -1 })).toThrow(/threshold/);
        expect(() => perceiveNoise(at(0), noise(1, 1), { threshold: 0, occlusion: 1 as never })).toThrow(/occlusion must be a function/);
        expect(() => perceiveNoise(at(0), noise(1, 1), { threshold: 0, occlusion: () => 2 })).toThrow(/\[0, 1\]/);
        expect(() => perceiveNoise(at(0), noise(1, 1), { threshold: 0, occlusion: () => Number.NaN })).toThrow(/\[0, 1\]/);
    });
});

describe('createHearingSensor', () => {
    it('returns audible noises loudest first with deterministic ties', () => {
        const sensor = createHearingSensor({ threshold: 0.5 });
        const events = [
            noise(2, 2, { kind: 'scream', source: 'b' }),
            noise(1, 8, { kind: 'gunshot' }),
            noise(2, 2, { kind: 'scream', source: 'a' }),
            noise(2, 2, { kind: 'cough', time: 0 }),
            noise(2, 2, { kind: 'cough', time: 5 }),
            noise(50, 1, { kind: 'whisper' }),
            noise(2, 2, { kind: 'scream', source: 'a' }),
        ];
        const heard = sensor.hear(at(0), events);
        expect(heard.map(({ event }) => `${event.kind}:${event.source ?? '-'}:${event.time}`)).toEqual([
            'gunshot:-:0',
            'cough:-:5',
            'cough:-:0',
            'scream:a:0',
            'scream:a:0',
            'scream:b:0',
        ]);
        expect(heard[3]?.event).toBe(events[2]);
        expect(heard[4]?.event).toBe(events[6]);
        expect(() => sensor.hear({ x: 0, y: 0, z: Number.POSITIVE_INFINITY }, events)).toThrow(/Listener/);
    });

    it('validates its options up front', () => {
        expect(() => createHearingSensor({ threshold: Number.NaN })).toThrow(/threshold/);
    });
});

describe('NoiseBuffer', () => {
    it('keeps recent noises within ttl and drops the oldest when full', () => {
        const buffer = new NoiseBuffer({ ttl: 2, capacity: 3 });
        buffer.emit(noise(0, 1, { time: 1, kind: 'a' }));
        buffer.emit(noise(0, 1, { time: 0, kind: 'b' }));
        buffer.emit(noise(0, 1, { time: 3, kind: 'c' }));
        buffer.emit(noise(0, 1, { time: 4, kind: 'd' })); // evicts b (oldest)
        expect(buffer.size).toBe(3);
        expect(buffer.active(4).map(({ kind }) => kind)).toEqual(['c', 'd']);
        expect(buffer.active(3).map(({ kind }) => kind)).toEqual(['a', 'c']);
        expect(buffer.prune(4)).toBe(1);
        expect(buffer.size).toBe(2);
        buffer.clear();
        expect(buffer.size).toBe(0);
    });

    it('feeds a hearing sensor', () => {
        const buffer = new NoiseBuffer({ ttl: 1 });
        buffer.emit(noise(3, 9, { time: 10, source: 'mummy' }));
        const [heard] = createHearingSensor({ threshold: 1 }).hear(at(0), buffer.active(10.5));
        expect(heard?.event.source).toBe('mummy');
        expect(heard?.perceived).toBe(3);
    });

    it('validates options, events, and times', () => {
        expect(() => new NoiseBuffer({ ttl: -1 })).toThrow(/ttl/);
        expect(() => new NoiseBuffer({ ttl: 1, capacity: 0 })).toThrow(/capacity/);
        const buffer = new NoiseBuffer({ ttl: 1 });
        expect(() => buffer.emit(noise(0, Number.NaN))).toThrow(/loudness/);
        expect(buffer.size).toBe(0);
        expect(() => buffer.active(Number.NaN)).toThrow(/finite/);
        expect(() => buffer.prune(Number.NaN)).toThrow(/finite/);
    });
});
