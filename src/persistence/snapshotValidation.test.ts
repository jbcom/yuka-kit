import { describe, expect, it } from 'vitest';
import {
    requireIntegerInRange,
    requireNonEmptyString,
    SNAPSHOT_ARRAY_LIMIT,
    validateClosedSnapshotRecord,
    validateSnapshotArray,
} from './snapshotValidation.js';

describe('validateClosedSnapshotRecord', () => {
    it('accepts a well-formed record with only required keys', () => {
        const record = validateClosedSnapshotRecord({ a: 1, b: 2 }, ['a', 'b'], [], 'record');
        expect(record).toEqual({ a: 1, b: 2 });
        expect(Object.isFrozen(record)).toBe(true);
    });

    it('accepts optional keys being present or absent', () => {
        expect(validateClosedSnapshotRecord({ a: 1 }, ['a'], ['b'], 'record')).toEqual({ a: 1 });
        expect(validateClosedSnapshotRecord({ a: 1, b: 2 }, ['a'], ['b'], 'record')).toEqual({ a: 1, b: 2 });
    });

    it('rejects a non-object value', () => {
        expect(() => validateClosedSnapshotRecord(null, [], [], 'record')).toThrow('must be an object');
        expect(() => validateClosedSnapshotRecord('nope', [], [], 'record')).toThrow('must be an object');
        expect(() => validateClosedSnapshotRecord([1, 2], [], [], 'record')).toThrow('must be an object');
    });

    it('rejects a value with a custom (non-plain) prototype', () => {
        class Custom {}
        expect(() => validateClosedSnapshotRecord(new Custom(), [], [], 'record'))
            .toThrow('must have a plain object prototype');
    });

    it('accepts a null-prototype object', () => {
        const value = Object.create(null);
        value.a = 1;
        expect(validateClosedSnapshotRecord(value, ['a'], [], 'record')).toEqual({ a: 1 });
    });

    it('rejects an unknown field', () => {
        expect(() => validateClosedSnapshotRecord({ a: 1, extra: 2 }, ['a'], [], 'record'))
            .toThrow('contains unknown field: extra');
    });

    it('rejects a non-enumerable field', () => {
        const value: Record<string, unknown> = {};
        Object.defineProperty(value, 'a', { value: 1, enumerable: false });
        expect(() => validateClosedSnapshotRecord(value, ['a'], [], 'record'))
            .toThrow('must be an enumerable data field');
    });

    it('rejects a getter-backed field without invoking the getter', () => {
        let reads = 0;
        const value: Record<string, unknown> = {};
        Object.defineProperty(value, 'a', {
            enumerable: true,
            get() {
                reads += 1;
                return 1;
            },
        });
        expect(() => validateClosedSnapshotRecord(value, ['a'], [], 'record'))
            .toThrow('must be an enumerable data field');
        expect(reads).toBe(0);
    });

    it('rejects a missing required field', () => {
        expect(() => validateClosedSnapshotRecord({}, ['a'], [], 'record'))
            .toThrow('is missing field: a');
    });
});

describe('validateSnapshotArray', () => {
    it('accepts a well-formed array', () => {
        const result = validateSnapshotArray([1, 2, 3], 'items');
        expect(result).toEqual([1, 2, 3]);
        expect(Object.isFrozen(result)).toBe(true);
    });

    it('accepts an empty array', () => {
        expect(validateSnapshotArray([], 'items')).toEqual([]);
    });

    it('rejects a non-array value', () => {
        expect(() => validateSnapshotArray({}, 'items')).toThrow('must be an array');
        expect(() => validateSnapshotArray('nope', 'items')).toThrow('must be an array');
    });

    it('rejects an array-like value with a non-Array prototype', () => {
        class FakeArray extends Array {}
        const fake = new FakeArray(1, 2, 3);
        expect(() => validateSnapshotArray(fake, 'items')).toThrow('must be an array');
    });

    // Note: a genuine JS Array cannot hold a non-integer, negative, or missing
    // `length` (assignment throws RangeError), and Array.isArray rejects any
    // non-Array object even with Array.prototype attached — so the
    // invalid-length guard on a real array is unreachable defensive code and
    // is not exercised here.

    it('rejects an array exceeding the maximum supported length', () => {
        const value = [1, 2, 3, 4, 5];
        expect(() => validateSnapshotArray(value, 'items', 3)).toThrow('exceeds the maximum supported length of 3');
    });

    it('uses SNAPSHOT_ARRAY_LIMIT as the default maximum', () => {
        expect(SNAPSHOT_ARRAY_LIMIT).toBe(100_000);
    });

    it('rejects an array carrying a named property outside its index range', () => {
        const value: unknown[] = [1, 2];
        (value as unknown as Record<string, unknown>).extra = 'nope';
        expect(() => validateSnapshotArray(value, 'items')).toThrow('contains unknown field: extra');
    });

    it('rejects an array carrying a symbol key', () => {
        const value: unknown[] = [1, 2];
        Object.defineProperty(value, Symbol('tag'), { value: 'x', enumerable: true });
        expect(() => validateSnapshotArray(value, 'items')).toThrow(/contains unknown field/);
    });

    it('rejects a non-enumerable array element', () => {
        const value: unknown[] = [1];
        Object.defineProperty(value, '0', { value: 1, enumerable: false, configurable: true });
        expect(() => validateSnapshotArray(value, 'items')).toThrow('must be an enumerable data element');
    });

    it('rejects a getter-backed array element without invoking the getter', () => {
        let reads = 0;
        const value: unknown[] = [1];
        Object.defineProperty(value, '0', {
            enumerable: true,
            configurable: true,
            get() {
                reads += 1;
                return 1;
            },
        });
        expect(() => validateSnapshotArray(value, 'items')).toThrow('must be an enumerable data element');
        expect(reads).toBe(0);
    });
});

describe('requireNonEmptyString', () => {
    it('returns the value when it is a non-empty string', () => {
        expect(requireNonEmptyString('hello', 'field')).toBe('hello');
    });

    it('rejects an empty string', () => {
        expect(() => requireNonEmptyString('', 'field')).toThrow('must be a non-empty string');
    });

    it('rejects a non-string value', () => {
        expect(() => requireNonEmptyString(42, 'field')).toThrow('must be a non-empty string');
        expect(() => requireNonEmptyString(null, 'field')).toThrow('must be a non-empty string');
    });
});

describe('requireIntegerInRange', () => {
    it('returns the value when it is an integer within range', () => {
        expect(requireIntegerInRange(5, 0, 10, 'field')).toBe(5);
        expect(requireIntegerInRange(0, 0, 10, 'field')).toBe(0);
        expect(requireIntegerInRange(10, 0, 10, 'field')).toBe(10);
    });

    it('rejects a non-integer value', () => {
        expect(() => requireIntegerInRange(1.5, 0, 10, 'field')).toThrow('must be an integer from 0 through 10');
    });

    it('rejects a value below the minimum', () => {
        expect(() => requireIntegerInRange(-1, 0, 10, 'field')).toThrow('must be an integer from 0 through 10');
    });

    it('rejects a value above the maximum', () => {
        expect(() => requireIntegerInRange(11, 0, 10, 'field')).toThrow('must be an integer from 0 through 10');
    });
});
