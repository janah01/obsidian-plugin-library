import { isEqualWith, isPlainObject } from "es-toolkit/predicate";
import type { DeepWritable } from "ts-essentials";
import {
  type InverseTypeofMapE,
  type PrimitiveOfE,
  genericTypeofGuardE,
  primitiveOfE,
} from "./typeof.js";
import { type AnyObject, type ReadonlyTuple } from "./types.js";
import { inSet, isHomogenousArray, lazyInit } from "./utils.js";

export interface Fixed<T> {
  readonly value: DeepWritable<T>;
  readonly valid: boolean;
}
export type Fixer<T> = (value: unknown) => Fixed<T>;

/**
 * Pairs `unchecked` with the value a fixer made of it. `valid` is whether
 * `fixed` keeps everything `unchecked` holds.
 *
 * A fixer that only adds keys the value lacked, at any depth, keeps the value
 * valid, so data saved before a setting existed is not malformed. A changed,
 * retyped or dropped value makes it invalid, and so does an array that grew
 * or shrank.
 */
export function markFixed<T>(
  unchecked: unknown,
  fixed: DeepWritable<T>,
): Fixed<T> {
  const validator = lazyInit(() => keepsEverything(unchecked, fixed));
  return Object.freeze({
    get valid() {
      return validator();
    },
    value: fixed,
  });
}

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return isPlainObject(value);
}

function enumerableSymbols(value: object): readonly symbol[] {
  return Object.getOwnPropertySymbols(value).filter((symbol) =>
    Object.prototype.propertyIsEnumerable.call(value, symbol),
  );
}

/**
 * Deep equality, except that a plain object in `fixed` may hold string keys
 * its counterpart in `unchecked` lacks. Symbol keys must match exactly.
 */
function keepsEverything(unchecked: unknown, fixed: unknown): boolean {
  // Plain-object pairs being compared; meeting one again closes a cycle.
  const comparing: (readonly [object, object])[] = [];
  const compare = (left: unknown, right: unknown): boolean | undefined => {
    // A value the fixer kept as it is keeps everything it holds, however deep.
    if (Object.is(left, right)) {
      return true;
    }
    if (!isPlainRecord(left) || !isPlainRecord(right)) {
      // Anything else compares as `isEqual` does, with this rule inside.
      return undefined;
    }
    if (
      comparing.some(([left0, right0]) => left0 === left && right0 === right)
    ) {
      return true;
    }
    const symbols = enumerableSymbols(left);
    if (symbols.length !== enumerableSymbols(right).length) {
      return false;
    }
    comparing.push([left, right]);
    try {
      return [...Object.keys(left), ...symbols].every(
        (key) =>
          Object.prototype.propertyIsEnumerable.call(right, key) &&
          isEqualWith(left[key], right[key], compare),
      );
    } finally {
      comparing.pop();
    }
  };
  return isEqualWith(unchecked, fixed, compare);
}

export function fixTyped<S, K extends keyof S>(
  defaults: S,
  from: AnyObject,
  key: K,
  types: readonly InverseTypeofMapE<S[K]>[],
): PrimitiveOfE<S[K]> {
  const val = from[key];
  return genericTypeofGuardE(types, val) ? val : primitiveOfE(defaults[key]);
}

export function fixArray<
  S,
  K extends keyof S,
  V extends (S[K] extends readonly (infer V0)[] ? V0 : never),
>(
  defaults: S,
  from: AnyObject,
  key: K,
  types: readonly InverseTypeofMapE<V>[],
): PrimitiveOfE<V>[] {
  const default0 = defaults[key];
  if (!Array.isArray(default0)) {
    throw new TypeError(String(default0));
  }
  const val = from[key];
  if (isHomogenousArray(types, val)) {
    return val;
  }
  const default1: readonly V[] = default0;
  return default1.map(primitiveOfE);
}

export function fixInSet<S, const Vs extends ReadonlyTuple>(
  defaults: S,
  from: AnyObject,
  key: keyof S,
  set: Vs,
): Vs[number] {
  const val = from[key];
  return inSet(set, val) ? val : defaults[key];
}
