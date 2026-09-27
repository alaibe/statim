export type Guard<T> = (value: unknown) => value is T;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const isString = (value: unknown): value is string => typeof value === 'string';

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

export const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function oneOf<const T extends readonly string[]>(...values: T): Guard<T[number]> {
  return (value): value is T[number] => (values as readonly unknown[]).includes(value);
}

export function optional<T>(guard: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || guard(value);
}

export function arrayOf<T>(guard: Guard<T>): Guard<T[]> {
  return (value): value is T[] => Array.isArray(value) && value.every(guard);
}

export function shape<T>(fields: { [K in keyof T]-?: Guard<T[K]> }): Guard<T> {
  const entries = Object.entries(fields) as [string, Guard<unknown>][];
  return (value): value is T =>
    isRecord(value) && entries.every(([key, guard]) => guard(value[key]));
}
