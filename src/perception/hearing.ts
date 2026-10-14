import type { Vec3Like } from '../core/types.js';

/** A sound made somewhere in the world. `loudness` is the level at `refDistance`. */
export interface NoiseEvent {
    readonly position: Vec3Like;
    readonly loudness: number;
    /** What made the sound, for example `'footstep'` or `'scream'`. */
    readonly kind: string;
    /** Simulation time in seconds when the sound was made. */
    readonly time: number;
    /** Who made the sound, when the listener could attribute it. */
    readonly source?: string;
}

/** Web Audio `PannerNode` distance models. */
export type NoiseDistanceModel = 'inverse' | 'linear' | 'exponential';

export interface NoiseAttenuationOptions {
    distanceModel?: NoiseDistanceModel;
    /** Distance at which the gain is 1 (default 1). */
    refDistance?: number;
    /** Distance at which `'linear'` reaches its floor (default 10000). */
    maxDistance?: number;
    /** How quickly the gain falls off (default 1). */
    rolloffFactor?: number;
}

export interface HearingOptions extends NoiseAttenuationOptions {
    /** Minimum perceived loudness this listener notices. */
    threshold: number;
    /**
     * Fraction of the sound that passes between `from` (the noise) and `to`
     * (the listener), from 0 (blocked) to 1 (clear). Only called for noises
     * that would be audible without occlusion.
     */
    occlusion?: (from: Vec3Like, to: Vec3Like, event: NoiseEvent) => number;
}

export interface HeardNoise {
    readonly event: NoiseEvent;
    /** `loudness × distance gain × transmission`. */
    readonly perceived: number;
    readonly distance: number;
    readonly transmission: number;
}

export interface HearingSensor {
    /** Every audible noise, loudest first, with deterministic tie-breaking. */
    hear(listener: Vec3Like, events: readonly NoiseEvent[]): HeardNoise[];
}

const isFiniteVec3 = (value: Vec3Like | undefined): boolean =>
    value !== undefined && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

function resolveAttenuation(options: NoiseAttenuationOptions): Required<NoiseAttenuationOptions> {
    const {
        distanceModel = 'inverse', refDistance = 1, maxDistance = 10_000, rolloffFactor = 1,
    } = options;
    if (distanceModel !== 'inverse' && distanceModel !== 'linear' && distanceModel !== 'exponential') {
        throw new TypeError('Noise distanceModel must be inverse, linear, or exponential');
    }
    if (!Number.isFinite(refDistance) || refDistance <= 0) throw new RangeError('Noise refDistance must be finite and positive');
    if (!Number.isFinite(maxDistance) || maxDistance <= refDistance) {
        throw new RangeError('Noise maxDistance must be finite and greater than refDistance');
    }
    if (!Number.isFinite(rolloffFactor) || rolloffFactor < 0) {
        throw new RangeError('Noise rolloffFactor must be finite and non-negative');
    }
    if (distanceModel === 'linear' && rolloffFactor > 1) {
        throw new RangeError('Noise rolloffFactor must be at most 1 for the linear model');
    }
    return { distanceModel, refDistance, maxDistance, rolloffFactor };
}

function gainAt(distance: number, options: Required<NoiseAttenuationOptions>): number {
    const { distanceModel, refDistance, maxDistance, rolloffFactor } = options;
    switch (distanceModel) {
        case 'linear': {
            const clamped = Math.min(Math.max(distance, refDistance), maxDistance);
            return 1 - rolloffFactor * (clamped - refDistance) / (maxDistance - refDistance);
        }
        case 'exponential':
            return (Math.max(distance, refDistance) / refDistance) ** -rolloffFactor;
        default:
            return refDistance / (refDistance + rolloffFactor * (Math.max(distance, refDistance) - refDistance));
    }
}

/** Distance gain in [0, 1] for a noise heard `distance` away. */
export function attenuateNoise(distance: number, options: NoiseAttenuationOptions = {}): number {
    if (!Number.isFinite(distance) || distance < 0) throw new RangeError('Noise distance must be finite and non-negative');
    return gainAt(distance, resolveAttenuation(options));
}

/** Throws a TypeError unless `event` is a well-formed noise event. */
export function validateNoiseEvent(event: NoiseEvent): void {
    if (typeof event !== 'object' || event === null) throw new TypeError('Noise event must be an object');
    if (!isFiniteVec3(event.position)) throw new TypeError('Noise event position must have finite x, y, and z');
    if (!Number.isFinite(event.loudness) || event.loudness < 0) {
        throw new TypeError('Noise event loudness must be finite and non-negative');
    }
    if (typeof event.kind !== 'string' || event.kind.length === 0) throw new TypeError('Noise event kind must be a non-empty string');
    if (!Number.isFinite(event.time)) throw new TypeError('Noise event time must be finite');
    if (event.source !== undefined && (typeof event.source !== 'string' || event.source.length === 0)) {
        throw new TypeError('Noise event source must be a non-empty string when present');
    }
}

function validateHearing(options: HearingOptions): Required<NoiseAttenuationOptions> {
    if (!Number.isFinite(options.threshold) || options.threshold < 0) {
        throw new RangeError('Hearing threshold must be finite and non-negative');
    }
    if (options.occlusion !== undefined && typeof options.occlusion !== 'function') {
        throw new TypeError('Hearing occlusion must be a function');
    }
    return resolveAttenuation(options);
}

function perceive(
    listener: Vec3Like,
    event: NoiseEvent,
    options: HearingOptions,
    attenuation: Required<NoiseAttenuationOptions>,
): HeardNoise | null {
    validateNoiseEvent(event);
    const distance = Math.hypot(
        event.position.x - listener.x, event.position.y - listener.y, event.position.z - listener.z,
    );
    const open = event.loudness * gainAt(distance, attenuation);
    if (open < options.threshold || open === 0) return null;
    let transmission = 1;
    if (options.occlusion) {
        transmission = options.occlusion(event.position, listener, event);
        if (!Number.isFinite(transmission) || transmission < 0 || transmission > 1) {
            throw new RangeError(`Hearing occlusion must return a number in [0, 1]; received ${String(transmission)}`);
        }
    }
    const perceived = open * transmission;
    if (perceived < options.threshold || perceived === 0) return null;
    return { event, perceived, distance, transmission };
}

/**
 * How loudly `listener` hears `event`, or `null` when it is below the
 * listener's threshold (or silent). Occlusion is queried only for noises that
 * would otherwise be audible.
 */
export function perceiveNoise(listener: Vec3Like, event: NoiseEvent, options: HearingOptions): HeardNoise | null {
    if (!isFiniteVec3(listener)) throw new TypeError('Listener position must have finite x, y, and z');
    return perceive(listener, event, options, validateHearing(options));
}

const compareText = (left = '', right = ''): number => (left < right ? -1 : left > right ? 1 : 0);

/** A listener with its own threshold, distance model, and occlusion. */
export function createHearingSensor(options: HearingOptions): HearingSensor {
    const attenuation = validateHearing(options);
    return {
        hear(listener, events) {
            if (!isFiniteVec3(listener)) throw new TypeError('Listener position must have finite x, y, and z');
            const heard: Array<{ noise: HeardNoise; index: number }> = [];
            events.forEach((event, index) => {
                const noise = perceive(listener, event, options, attenuation);
                if (noise) heard.push({ noise, index });
            });
            heard.sort((left, right) =>
                right.noise.perceived - left.noise.perceived
                || right.noise.event.time - left.noise.event.time
                || compareText(left.noise.event.kind, right.noise.event.kind)
                || compareText(left.noise.event.source, right.noise.event.source)
                || left.index - right.index);
            return heard.map(({ noise }) => noise);
        },
    };
}

export interface NoiseBufferOptions {
    /** Seconds a noise stays audible after it is made. */
    ttl: number;
    /** Maximum noises held; the oldest is dropped first (default 256). */
    capacity?: number;
}

/** World-owned list of recent noises that every listener hears from. */
export class NoiseBuffer {
    readonly #ttl: number;
    readonly #capacity: number;
    #events: NoiseEvent[] = [];

    constructor(options: NoiseBufferOptions) {
        if (!Number.isFinite(options.ttl) || options.ttl < 0) throw new RangeError('NoiseBuffer ttl must be finite and non-negative');
        const capacity = options.capacity ?? 256;
        if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('NoiseBuffer capacity must be a positive integer');
        this.#ttl = options.ttl;
        this.#capacity = capacity;
    }

    get size(): number {
        return this.#events.length;
    }

    /** Record a noise. When full, the oldest noise (by time, then emission order) is dropped. */
    emit(event: NoiseEvent): void {
        validateNoiseEvent(event);
        this.#events.push(event);
        if (this.#events.length > this.#capacity) {
            let oldest = 0;
            this.#events.forEach((candidate, index) => {
                if (candidate.time < (this.#events[oldest] as NoiseEvent).time) oldest = index;
            });
            this.#events.splice(oldest, 1);
        }
    }

    /** Noises still audible at `now`: `now - ttl <= time <= now`, in emission order. */
    active(now: number): NoiseEvent[] {
        if (!Number.isFinite(now)) throw new TypeError('NoiseBuffer time must be finite');
        return this.#events.filter((event) => event.time <= now && now - event.time <= this.#ttl);
    }

    /** Drop noises older than `now - ttl`. Returns how many were dropped. */
    prune(now: number): number {
        if (!Number.isFinite(now)) throw new TypeError('NoiseBuffer time must be finite');
        const before = this.#events.length;
        this.#events = this.#events.filter((event) => now - event.time <= this.#ttl);
        return before - this.#events.length;
    }

    clear(): void {
        this.#events = [];
    }
}
