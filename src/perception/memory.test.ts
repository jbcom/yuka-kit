import { describe, expect, it } from 'vitest';
import {
    PerceptionMemory,
    validatePerceptionMemorySnapshot,
    type HeardNoise,
} from '../index.js';

const at = (x: number) => ({ x, y: 0, z: 0 });
const heard = (x: number, time: number, extra: Partial<HeardNoise['event']> = {}, perceived = 2): HeardNoise => ({
    event: { position: at(x), loudness: 4, kind: 'footstep', time, source: 'mummy', ...extra },
    perceived,
    distance: x,
    transmission: 1,
});

describe('PerceptionMemory', () => {
    it('remembers sightings and noises per target with decaying confidence', () => {
        const memory = new PerceptionMemory({ halfLife: 10 });
        memory.recordSighting('mummy', at(3), 0);
        memory.recordNoise(heard(5, 2, { source: 'priest' }));

        const mummy = memory.get('mummy', 10);
        expect(mummy).toMatchObject({ targetId: 'mummy', lastSeen: { position: at(3), time: 0 }, lastHeard: null });
        expect(mummy?.confidence).toBeCloseTo(0.5);
        expect(memory.get('priest', 2)).toMatchObject({
            confidence: 0.5,
            lastHeard: { position: at(5), time: 2, loudness: 2, kind: 'footstep' },
        });
        expect(memory.size).toBe(2);
    });

    it('never changes state when read', () => {
        const memory = new PerceptionMemory({ halfLife: 1 });
        memory.recordSighting('mummy', at(1), 0);
        const before = JSON.stringify(memory.snapshot());
        memory.get('mummy', 5);
        memory.recall(100);
        memory.strongest(3);
        expect(JSON.stringify(memory.snapshot())).toBe(before);
    });

    it('raises confidence to the larger of decayed and new evidence', () => {
        const memory = new PerceptionMemory({ halfLife: 10 });
        memory.recordSighting('mummy', at(1), 0, 0.8);
        memory.recordNoise(heard(2, 10), { confidence: 0.2 }); // decayed 0.4 beats 0.2
        expect(memory.get('mummy', 10)?.confidence).toBeCloseTo(0.4);
        memory.recordSighting('mummy', at(3), 10); // 1 beats 0.4
        expect(memory.get('mummy', 10)?.confidence).toBe(1);
        expect(memory.get('mummy', 10)?.lastHeard?.position).toEqual(at(2));
    });

    it('folds out-of-order evidence in without moving time backwards', () => {
        const memory = new PerceptionMemory({ halfLife: 10 });
        memory.recordSighting('mummy', at(9), 10, 0.1);
        memory.recordSighting('mummy', at(1), 0, 1); // older sighting, stronger
        const record = memory.get('mummy', 10);
        expect(record?.lastSensedTime).toBe(10);
        expect(record?.lastSeen).toEqual({ position: at(9), time: 10 });
        expect(record?.confidence).toBeCloseTo(0.5);
        memory.recordNoise(heard(4, 8));
        memory.recordNoise(heard(5, 6));
        expect(memory.get('mummy', 10)?.lastHeard?.time).toBe(8);
    });

    it('reports the newest position from either sense, preferring sight on a tie', () => {
        const memory = new PerceptionMemory({ halfLife: 10 });
        memory.recordSighting('mummy', at(1), 4);
        memory.recordNoise(heard(2, 6));
        expect(memory.lastKnownPosition('mummy', 6)).toEqual({ position: at(2), time: 6, sense: 'hearing' });
        memory.recordSighting('mummy', at(3), 6);
        expect(memory.lastKnownPosition('mummy', 6)).toEqual({ position: at(3), time: 6, sense: 'sight' });
        memory.recordNoise(heard(1, 0, { source: 'dog' }));
        expect(memory.lastKnownPosition('dog', 0)?.sense).toBe('hearing');
        expect(memory.lastKnownPosition('nobody', 0)).toBeNull();
    });

    it('orders recall by confidence, then recency, then target id', () => {
        const memory = new PerceptionMemory({ halfLife: 10 });
        memory.recordSighting('c', at(0), 0, 0.5);
        memory.recordSighting('b', at(0), 0, 0.5);
        // Same decayed confidence as b and c at t=5, but more recent.
        memory.recordSighting('a', at(0), 5, 0.5 * 0.5 ** (5 / 10));
        memory.recordSighting('z', at(0), 0, 1);
        expect(memory.recall(5).map(({ targetId }) => targetId)).toEqual(['z', 'a', 'b', 'c']);
        expect(memory.strongest(5)?.targetId).toBe('z');
    });

    it('forgets weak records on read and deletes them on prune', () => {
        const memory = new PerceptionMemory({ halfLife: 1, forgetBelow: 0.25 });
        memory.recordSighting('mummy', at(0), 0);
        memory.recordSighting('dog', at(0), 3);
        expect(memory.get('mummy', 2)?.confidence).toBe(0.25); // exactly at the threshold: kept
        expect(memory.get('mummy', 2.5)).toBeNull();
        expect(memory.recall(3).map(({ targetId }) => targetId)).toEqual(['dog']);
        expect(memory.prune(3)).toBe(1);
        expect(memory.size).toBe(1);
        expect(memory.strongest(100)).toBeNull();
        expect(memory.forget('dog')).toBe(true);
        expect(memory.forget('dog')).toBe(false);
        memory.recordSighting('x', at(0), 0);
        memory.clear();
        expect(memory.size).toBe(0);
    });

    it('evicts the weakest, then oldest, then lowest id when over capacity', () => {
        const memory = new PerceptionMemory({ halfLife: 10, capacity: 3 });
        memory.recordSighting('b', at(0), 0, 0.5);
        memory.recordSighting('a', at(0), 0, 0.5);
        memory.recordSighting('strong', at(0), 0, 1);
        memory.recordSighting('new', at(0), 0, 0.9);
        expect(memory.recall(0).map(({ targetId }) => targetId)).toEqual(['strong', 'new', 'b']);
        memory.recordSighting('newer', at(0), 0, 0.5);
        expect(memory.recall(0).map(({ targetId }) => targetId)).toEqual(['strong', 'new', 'newer']);
    });

    it('validates evidence before changing anything', () => {
        const memory = new PerceptionMemory({ halfLife: 10 });
        expect(() => memory.recordSighting('', at(0), 0)).toThrow(/targetId/);
        expect(() => memory.recordSighting('m', { x: 0, y: Number.NaN, z: 0 }, 0)).toThrow(/position/);
        expect(() => memory.recordSighting('m', null as never, 0)).toThrow(/position/);
        expect(() => memory.recordSighting('m', at(0), Number.NaN)).toThrow(/time/);
        expect(() => memory.recordSighting('m', at(0), 0, 1.5)).toThrow(/confidence/);
        expect(() => memory.recordNoise(heard(1, 0, { source: undefined }))).toThrow(/targetId/);
        expect(() => memory.recordNoise(heard(1, 0), { confidence: -1 })).toThrow(/confidence/);
        expect(() => memory.recordNoise(heard(1, 0, {}, Number.NaN))).toThrow(/perceived/);
        expect(() => memory.get('m', Number.NaN)).toThrow(/time/);
        expect(() => memory.recall(Number.NaN)).toThrow(/time/);
        expect(() => memory.prune(Number.NaN)).toThrow(/time/);
        expect(memory.size).toBe(0);
        memory.recordNoise(heard(1, 0, { source: undefined }), { targetId: 'mummy' });
        expect(memory.size).toBe(1);
    });

    it('validates options', () => {
        expect(() => new PerceptionMemory({ halfLife: 0 })).toThrow(/halfLife must be positive/);
        expect(() => new PerceptionMemory({ halfLife: Number.NaN })).toThrow(/halfLife/);
        expect(() => new PerceptionMemory({ halfLife: 1, forgetBelow: 2 })).toThrow(/forgetBelow/);
        expect(() => new PerceptionMemory({ halfLife: 1, capacity: 0 })).toThrow(/capacity/);
        expect(() => new PerceptionMemory({ halfLife: 1, hearingConfidence: -0.1 })).toThrow(/hearingConfidence/);
    });
});

describe('PerceptionMemory persistence', () => {
    it('round-trips through JSON and keeps decaying from the saved evidence', () => {
        const memory = new PerceptionMemory({ halfLife: 10, capacity: 8, hearingConfidence: 0.4 });
        memory.recordSighting('mummy', at(1), 0);
        memory.recordNoise(heard(2, 3));
        memory.recordNoise(heard(7, 5, { source: 'dog', kind: 'bark' }));
        const snapshot = JSON.parse(JSON.stringify(memory.snapshot()));
        expect(snapshot.records.map(({ targetId }: { targetId: string }) => targetId)).toEqual(['dog', 'mummy']);
        const restored = PerceptionMemory.restore(snapshot);
        expect(restored.recall(20)).toEqual(memory.recall(20));
        expect(restored.snapshot()).toEqual(memory.snapshot());
        restored.recordNoise(heard(1, 21, { source: 'cat' }));
        expect(restored.get('cat', 21)?.confidence).toBe(0.4);
    });

    it('detaches snapshots from later evidence', () => {
        const memory = new PerceptionMemory({ halfLife: 10 });
        memory.recordSighting('mummy', at(1), 0);
        const snapshot = memory.snapshot();
        memory.recordSighting('mummy', at(9), 1);
        expect(snapshot.records[0]?.lastSeen?.position).toEqual(at(1));
    });

    it('rejects malformed snapshots', () => {
        const memory = new PerceptionMemory({ halfLife: 10, capacity: 2 });
        memory.recordSighting('mummy', at(1), 0);
        memory.recordNoise(heard(2, 1, { source: 'dog' }));
        const good = memory.snapshot();
        const record = good.records[0] as (typeof good.records)[number];
        const attempts: Array<[unknown, RegExp]> = [
            [{ ...good, schema: 'x' }, /Unsupported perception memory snapshot/],
            [{ ...good, version: 2 }, /Unsupported/],
            [{ ...good, halfLife: 0 }, /halfLife/],
            [{ ...good, records: [record, record] }, /duplicates/],
            [{ ...good, records: [record, record, record] }, /maximum supported length of 2/],
            [{ ...good, records: [{ ...record, lastSeen: null, lastHeard: null }] }, /sighting or a noise/],
            [{ ...good, records: [{ ...record, confidence: 2 }] }, /confidence/],
            [{ ...good, records: [{ ...record, lastSensedTime: -5 }] }, /must not precede/],
            [{ ...good, records: [{ ...record, lastHeard: { position: at(0), time: 9, loudness: 1, kind: 'x' } }] }, /must not precede/],
            [{ ...good, records: [{ ...record, lastHeard: { position: at(0), time: 0, loudness: 1, kind: '' } }] }, /kind/],
            [{ ...good, records: [{ ...record, lastSeen: { position: { x: 0, y: 0 }, time: 0 } }] }, /missing field: z/],
            [{ ...good, records: [{ ...record, lastSeen: { position: at(0), time: 0, extra: 1 } }] }, /unknown field: extra/],
            [{ ...good, extra: true }, /unknown field: extra/],
        ];
        for (const [snapshot, error] of attempts) {
            expect(() => PerceptionMemory.restore(snapshot)).toThrow(error);
        }
        expect(validatePerceptionMemorySnapshot(JSON.parse(JSON.stringify(good)))).toEqual(good);
    });
});
