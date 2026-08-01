export type SnapshotRecord = Readonly<Record<string, unknown>>;

export const SNAPSHOT_ARRAY_LIMIT = 100_000;

export function validateClosedSnapshotRecord(
    value: unknown,
    requiredKeys: readonly string[],
    optionalKeys: readonly string[],
    label: string,
): SnapshotRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${label} must be an object`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${label} must have a plain object prototype`);
    }
    const allowed = new Set([...requiredKeys, ...optionalKeys]);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const record = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== 'string' || !allowed.has(key)) {
            throw new TypeError(`${label} contains unknown field: ${String(key)}`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)?.value as
            PropertyDescriptor | undefined;
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
            throw new TypeError(`${label}.${key} must be an enumerable data field`);
        }
        record[key] = descriptor.value;
    }
    for (const key of requiredKeys) {
        if (!Object.hasOwn(record, key)) {
            throw new TypeError(`${label} is missing field: ${key}`);
        }
    }
    return Object.freeze(record);
}

export function validateSnapshotArray(
    value: unknown,
    label: string,
    maximumLength = SNAPSHOT_ARRAY_LIMIT,
): readonly unknown[] {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError(`${label} must be an array`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(descriptors, 'length')?.value as
        PropertyDescriptor | undefined;
    if (!lengthDescriptor || !('value' in lengthDescriptor)
        || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
        throw new TypeError(`${label} has an invalid length`);
    }
    const length = lengthDescriptor.value as number;
    if (length > maximumLength) {
        throw new TypeError(`${label} exceeds the maximum supported length of ${maximumLength}`);
    }
    const allowed = new Set(['length']);
    for (let index = 0; index < length; index += 1) {
        allowed.add(String(index));
    }
    for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== 'string' || !allowed.has(key)) {
            throw new TypeError(`${label} contains unknown field: ${String(key)}`);
        }
    }
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
            descriptors,
            String(index),
        )?.value as PropertyDescriptor | undefined;
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
            throw new TypeError(`${label}[${index}] must be an enumerable data element`);
        }
        Object.defineProperty(output, String(index), {
            configurable: true,
            enumerable: true,
            value: descriptor.value,
            writable: true,
        });
    }
    return Object.freeze(output);
}

export function requireNonEmptyString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value;
}

export function requireIntegerInRange(
    value: unknown,
    minimum: number,
    maximum: number,
    label: string,
): number {
    if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
        throw new TypeError(`${label} must be an integer from ${minimum} through ${maximum}`);
    }
    return value as number;
}
