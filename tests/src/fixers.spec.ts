/**
 * Comprehensive tests for src/fixers.ts — settings validation and fixing utilities
 */
import { isEqual, isPlainObject } from "es-toolkit/predicate";
import { runInNewContext } from "node:vm";
import { describe, it, expect } from "vitest";
import {
  markFixed,
  fixTyped,
  fixArray,
  fixInSet,
  type Fixed,
} from "../../src/fixers.js";
import type { AnyObject } from "../../src/types.js";

describe("fixers.ts — settings validation and fixing", () => {
  describe("markFixed", () => {
    it("marks valid fixed values when unchecked matches fixed", () => {
      const unchecked = { name: "test", value: 42 };
      const fixed = { name: "test", value: 42 };
      const result = markFixed(unchecked, fixed);

      expect(result.value).toEqual(fixed);
      expect(result.valid).toBe(true);
    });

    it("marks invalid when unchecked differs from fixed", () => {
      const unchecked = { name: "test", value: 99 };
      const fixed = { name: "test", value: 42 };
      const result = markFixed(unchecked, fixed);

      expect(result.value).toEqual(fixed);
      expect(result.valid).toBe(false);
    });

    it("returns frozen object", () => {
      const result = markFixed("original", "fixed");
      expect(Object.isFrozen(result)).toBe(true);
    });

    it("handles primitive values", () => {
      expect(markFixed(42, 42).valid).toBe(true);
      expect(markFixed(42, 43).valid).toBe(false);
      expect(markFixed("hello", "hello").valid).toBe(true);
      expect(markFixed("hello", "world").valid).toBe(false);
      expect(markFixed(true, true).valid).toBe(true);
      expect(markFixed(true, false).valid).toBe(false);
    });

    it("handles null and undefined", () => {
      expect(markFixed(null, null).valid).toBe(true);
      expect(markFixed(undefined, undefined).valid).toBe(true);
      expect(markFixed(null, undefined).valid).toBe(false);
      expect(markFixed(undefined, null).valid).toBe(false);
    });

    it("handles nested objects", () => {
      const unchecked = { a: { b: { c: 1 } } };
      const fixed = { a: { b: { c: 1 } } };
      expect(markFixed(unchecked, fixed).valid).toBe(true);

      const unchecked2 = { a: { b: { c: 1 } } };
      const fixed2 = { a: { b: { c: 2 } } };
      expect(markFixed(unchecked2, fixed2).valid).toBe(false);
    });

    it("handles arrays", () => {
      expect(markFixed([1, 2, 3], [1, 2, 3]).valid).toBe(true);
      expect(markFixed([1, 2, 3], [1, 2, 4]).valid).toBe(false);
      expect(markFixed([1, 2], [1, 2, 3]).valid).toBe(false);
    });

    it("uses lazy evaluation for valid property", () => {
      const unchecked = { expensive: "computation" };
      const fixed = { expensive: "computation" };
      const result = markFixed(unchecked, fixed);

      // Access valid property multiple times
      expect(result.valid).toBe(true);
      expect(result.valid).toBe(true);
      expect(result.valid).toBe(true);
    });

    it("handles complex mixed structures", () => {
      const unchecked = {
        str: "text",
        num: 42,
        arr: [1, 2, { nested: true }],
        obj: { key: "value" },
      };
      const fixed = {
        str: "text",
        num: 42,
        arr: [1, 2, { nested: true }],
        obj: { key: "value" },
      };
      expect(markFixed(unchecked, fixed).valid).toBe(true);
    });

    it("accepts a value that only lacks a key the fixer added", () => {
      expect(markFixed({ a: 1 }, { a: 1, b: 2 }).valid).toBe(true);
    });

    it("accepts a value that only lacks a nested key the fixer added", () => {
      expect(markFixed({ o: { a: 1 } }, { o: { a: 1, b: 2 } }).valid).toBe(
        true,
      );
    });

    it("accepts an array element that only lacks a key the fixer added", () => {
      expect(markFixed([{ a: 1 }], [{ a: 1, b: 2 }]).valid).toBe(true);
    });

    it("accepts an empty object that the fixer filled", () => {
      expect(markFixed({}, { a: 1, b: { c: 2 } }).valid).toBe(true);
    });

    it("rejects a changed or retyped value next to an added key", () => {
      expect(markFixed({ a: 1 }, { a: 2, b: 2 }).valid).toBe(false);
      expect(markFixed({ a: "1" }, { a: 1 }).valid).toBe(false);
      expect(markFixed({ o: { a: "1" } }, { o: { a: 1, b: 2 } }).valid).toBe(
        false,
      );
    });

    it("rejects a key the fixer dropped", () => {
      expect(markFixed({ a: 1, z: 2 }, { a: 1 }).valid).toBe(false);
      expect(markFixed({ a: 1, o: "x" }, { a: 1 }).valid).toBe(false);
      expect(
        markFixed({ o: { a: 1, z: 2 } }, { o: { a: 1, b: 2 } }).valid,
      ).toBe(false);
      expect(
        markFixed(JSON.parse('{"__proto__":{"a":1},"b":1}'), { b: 1 }).valid,
      ).toBe(false);
    });

    it("rejects a value that is not a plain object where the fixer made one", () => {
      expect(markFixed("x", {}).valid).toBe(false);
      expect(markFixed([], {}).valid).toBe(false);
      expect(markFixed(null, {}).valid).toBe(false);
      expect(markFixed({}, []).valid).toBe(false);
      expect(markFixed({ o: [] }, { o: { a: 1 } }).valid).toBe(false);
    });

    it("rejects an array that grew or shrank", () => {
      expect(markFixed([1, 2], [1, 2, 3]).valid).toBe(false);
      expect(markFixed([1, 2, 3], [1, 2]).valid).toBe(false);
      expect(markFixed([{ a: 1 }], [{ a: 1 }, { a: 2 }]).valid).toBe(false);
    });

    it("compares symbol keys strictly", () => {
      const symbol = Symbol("marker");
      expect(markFixed({ [symbol]: true }, { recovery: {} }).valid).toBe(false);
      expect(markFixed({ a: 1 }, { a: 1, [symbol]: true }).valid).toBe(false);
      expect(markFixed({ [symbol]: true }, { [symbol]: false }).valid).toBe(
        false,
      );
      expect(
        markFixed({ [symbol]: true }, { [symbol]: true, b: 1 }).valid,
      ).toBe(true);
    });

    it("terminates on cyclic values", () => {
      const cyclic: Record<string, unknown> = {};
      cyclic["self"] = cyclic;
      expect(markFixed(cyclic, { self: cyclic, x: 1 }).valid).toBe(true);

      const even: Record<string, unknown> = {},
        odd: Record<string, unknown> = { self: even };
      even["self"] = odd;
      expect(markFixed(cyclic, even).valid).toBe(true);
      expect(markFixed(cyclic, { self: { self: 1 } }).valid).toBe(false);
    });

    it("applies the same rule to values from another window", () => {
      // A pop-out window is another realm with its own `Object.prototype`.
      function foreign(source: string): unknown {
        const ret: unknown = runInNewContext(`(${source})`);
        return ret;
      }
      expect(
        markFixed(foreign('{ "a": 1, "o": { "l": [{ "b": 1 }] } }'), {
          a: 1,
          o: { d: 3, l: [{ b: 1, c: 2 }] },
        }).valid,
      ).toBe(true);
      expect(markFixed(foreign('{ "a": 1, "z": 2 }'), { a: 1 }).valid).toBe(
        false,
      );
      expect(markFixed(foreign('{ "a": "1" }'), { a: 1, b: 2 }).valid).toBe(
        false,
      );
      expect(markFixed(foreign("[1, 2]"), [1, 2, 3]).valid).toBe(false);
      expect(markFixed(foreign("[]"), {}).valid).toBe(false);
    });

    it("applies the same rule to objects without a prototype", () => {
      function bare(
        entries: Readonly<Record<string, unknown>>,
      ): Record<string, unknown> {
        const ret = { ...entries };
        Reflect.setPrototypeOf(ret, null);
        return ret;
      }
      expect(markFixed(bare({ a: 1 }), { a: 1, b: 2 }).valid).toBe(true);
      expect(
        markFixed({ o: bare({ a: 1 }) }, { o: { a: 1, b: 2 } }).valid,
      ).toBe(true);
      expect(markFixed(bare({ a: 1, z: 2 }), { a: 1 }).valid).toBe(false);
      expect(markFixed(bare({ a: 1 }), { a: 2 }).valid).toBe(false);
    });

    it("ignores the order of keys", () => {
      expect(markFixed({ b: 2, a: 1 }, { a: 1, c: 3, b: 2 }).valid).toBe(true);
      expect(
        markFixed(
          { o: { y: 1, x: [{ q: 1, p: 2 }] } },
          { o: { x: [{ p: 2, q: 1, r: 3 }], y: 1 } },
        ).valid,
      ).toBe(true);
    });

    it("counts a key that holds undefined as a key", () => {
      // JSON cannot hold `undefined`, but a value built in memory can.
      expect(markFixed({}, { a: undefined }).valid).toBe(true);
      expect(markFixed({ a: undefined }, {}).valid).toBe(false);
      expect(markFixed({ a: undefined }, { a: null }).valid).toBe(false);
    });

    it("differs from deep equality only by the keys the fixer added", () => {
      // Park-Miller, seeded, so that a failing case can be replayed.
      let seed = 20_261_024;
      const LEAVES: readonly unknown[] = [0, 1, -1, 2.5, "", "a", true, null],
        KEYS: readonly string[] = ["a", "b", "c", "d"],
        ran = { added: 0, changed: 0, dropped: 0, resized: 0 };
      function random(): number {
        seed = (seed * 48_271) % 2_147_483_647;
        return seed / 2_147_483_647;
      }
      function below(count: number): number {
        return Math.floor(random() * count);
      }
      function isRecord(value: unknown): value is Record<string, unknown> {
        return isPlainObject(value);
      }
      function generateObject(depth: number): Record<string, unknown> {
        return Object.fromEntries(
          KEYS.filter(() => random() < 0.5).map((key) => [
            key,
            generate(depth - 1),
          ]),
        );
      }
      function generate(depth: number): unknown {
        const roll = random();
        if (depth <= 0 || roll < 0.35) {
          return LEAVES[below(LEAVES.length)];
        }
        if (roll < 0.7) {
          return generateObject(depth);
        }
        return Array.from({ length: below(4) }, () => generate(depth - 1));
      }
      function copy(value: unknown): unknown {
        const ret: unknown = JSON.parse(JSON.stringify(value));
        return ret;
      }
      function objectsIn(value: unknown): readonly Record<string, unknown>[] {
        if (isRecord(value)) {
          return [value, ...Object.values(value).flatMap(objectsIn)];
        }
        return Array.isArray(value) ? value.flatMap(objectsIn) : [];
      }
      function arraysIn(value: unknown): readonly unknown[][] {
        if (Array.isArray(value)) {
          return [value, ...value.flatMap(arraysIn)];
        }
        return isRecord(value) ? Object.values(value).flatMap(arraysIn) : [];
      }
      function isLeaf(value: unknown): boolean {
        return typeof value !== "object" || value === null;
      }
      // The rule, restated: drop from `fixed` each key that its counterpart
      // in `unchecked` lacks, then compare deeply.
      function prune(fixed: unknown, unchecked: unknown): unknown {
        if (isRecord(fixed) && isRecord(unchecked)) {
          return Object.fromEntries(
            Object.entries(fixed)
              .filter(([key]) =>
                Object.prototype.hasOwnProperty.call(unchecked, key),
              )
              .map(([key, value]) => [key, prune(value, unchecked[key])]),
          );
        }
        if (Array.isArray(fixed) && Array.isArray(unchecked)) {
          return fixed.map((item, index) => prune(item, unchecked[index]));
        }
        return fixed;
      }
      function pick<T>(items: readonly T[]): T | undefined {
        return items[below(items.length)];
      }

      for (let round = 0; round < 400; round += 1) {
        const unchecked = generateObject(4),
          check = (fixed: unknown, expected: boolean | null): void => {
            const { valid } = markFixed(unchecked, fixed);
            expect(valid).toBe(isEqual(unchecked, prune(fixed, unchecked)));
            if (expected !== null) {
              expect(valid).toBe(expected);
            }
          };
        check(copy(unchecked), true);
        check(generateObject(4), null);

        const added = copy(unchecked),
          addTo = pick(objectsIn(added));
        if (addTo) {
          addTo[`added${String(round)}`] = generate(2);
          check(added, true);
          ran.added += 1;
        }

        const changed = copy(unchecked),
          change = pick([
            ...objectsIn(changed).flatMap((object) =>
              Object.keys(object)
                .filter((key) => isLeaf(object[key]))
                .map((key) => (): void => {
                  object[key] = "changed";
                }),
            ),
            ...arraysIn(changed).flatMap((array) =>
              array
                .map((item, index) => (isLeaf(item) ? index : -1))
                .filter((index) => index >= 0)
                .map((index) => (): void => {
                  array[index] = "changed";
                }),
            ),
          ]);
        if (change) {
          change();
          check(changed, false);
          ran.changed += 1;
        }

        const dropped = copy(unchecked),
          dropFrom = pick(
            objectsIn(dropped).filter((object) => Object.keys(object).length),
          ),
          dropKey = dropFrom ? pick(Object.keys(dropFrom)) : undefined;
        if (dropFrom && dropKey !== undefined) {
          Reflect.deleteProperty(dropFrom, dropKey);
          check(dropped, false);
          ran.dropped += 1;
        }

        const resized = copy(unchecked),
          resize = pick(arraysIn(resized));
        if (resize) {
          if (resize.length && random() < 0.5) {
            resize.pop();
          } else {
            resize.push(generate(1));
          }
          check(resized, false);
          ran.resized += 1;
        }
      }
      for (const count of Object.values(ran)) {
        expect(count).toBeGreaterThan(100);
      }
    });
  });

  describe("fixTyped", () => {
    interface TestSettings {
      name: string;
      age: number;
      active: boolean;
    }

    it("returns valid value when type matches", () => {
      const defaults: TestSettings = { name: "default", age: 0, active: false };
      const from: AnyObject = {
        name: "John",
        age: 30,
        active: true,
      };

      expect(fixTyped(defaults, from, "name", ["string"])).toBe("John");
      expect(fixTyped(defaults, from, "age", ["number"])).toBe(30);
      expect(fixTyped(defaults, from, "active", ["boolean"])).toBe(true);
    });

    it("returns default when type does not match", () => {
      const defaults: TestSettings = { name: "default", age: 0, active: false };
      const from: AnyObject = {
        name: 123,
        age: "not a number",
        active: "yes",
      };

      expect(fixTyped(defaults, from, "name", ["string"])).toBe("default");
      expect(fixTyped(defaults, from, "age", ["number"])).toBe(0);
      expect(fixTyped(defaults, from, "active", ["boolean"])).toBe(false);
    });

    it("handles multiple allowed types", () => {
      const defaults = { value: "default" as string | number };
      const from1: AnyObject = { value: "text" };
      const from2: AnyObject = { value: 42 };
      const from3: AnyObject = {
        value: true,
      };

      expect(fixTyped(defaults, from1, "value", ["string", "number"])).toBe(
        "text",
      );
      expect(fixTyped(defaults, from2, "value", ["string", "number"])).toBe(42);
      expect(fixTyped(defaults, from3, "value", ["string", "number"])).toBe(
        "default",
      );
    });

    it("handles null values", () => {
      const defaults = { optional: null as string | null };
      const from: AnyObject = { optional: null };

      expect(fixTyped(defaults, from, "optional", ["string", "null"])).toBe(
        null,
      );
    });

    it("handles undefined values", () => {
      const defaults = { optional: undefined as string | undefined };
      const from: AnyObject = { optional: undefined };

      expect(
        fixTyped(defaults, from, "optional", ["string", "undefined"]),
      ).toBe(undefined);
    });
  });

  describe("fixArray", () => {
    interface SettingsWithArray {
      tags: string[];
      scores: number[];
      flags: boolean[];
    }

    it("returns valid array when all elements match type", () => {
      const defaults: SettingsWithArray = {
        tags: ["default"],
        scores: [0],
        flags: [false],
      };
      const from: AnyObject = {
        tags: ["a", "b", "c"],
        scores: [1, 2, 3],
        flags: [true, false, true],
      };

      expect(fixArray(defaults, from, "tags", ["string"])).toEqual([
        "a",
        "b",
        "c",
      ]);
      expect(fixArray(defaults, from, "scores", ["number"])).toEqual([1, 2, 3]);
      expect(fixArray(defaults, from, "flags", ["boolean"])).toEqual([
        true,
        false,
        true,
      ]);
    });

    it("returns default array when elements have wrong type", () => {
      const defaults: SettingsWithArray = {
        tags: ["default"],
        scores: [0],
        flags: [false],
      };
      const from: AnyObject = {
        tags: [1, 2, 3] as unknown,
        scores: ["a", "b"] as unknown,
        flags: ["yes", "no"] as unknown,
      };

      expect(fixArray(defaults, from, "tags", ["string"])).toEqual(["default"]);
      expect(fixArray(defaults, from, "scores", ["number"])).toEqual([0]);
      expect(fixArray(defaults, from, "flags", ["boolean"])).toEqual([false]);
    });

    it("returns default array when value is not an array", () => {
      const defaults: SettingsWithArray = {
        tags: ["default"],
        scores: [0],
        flags: [false],
      };
      const from: AnyObject = {
        tags: "not an array",
        scores: 42,
        flags: null,
      };

      expect(fixArray(defaults, from, "tags", ["string"])).toEqual(["default"]);
      expect(fixArray(defaults, from, "scores", ["number"])).toEqual([0]);
      expect(fixArray(defaults, from, "flags", ["boolean"])).toEqual([false]);
    });

    it("handles empty arrays", () => {
      const defaults = { items: ["default"] };
      const from: AnyObject = { items: [] };

      expect(fixArray(defaults, from, "items", ["string"])).toEqual([]);
    });

    it("handles arrays with mixed valid types", () => {
      const defaults = { values: ["default"] as (string | number)[] };
      const from: AnyObject = { values: ["a", 1, "b", 2] };

      expect(fixArray(defaults, from, "values", ["string", "number"])).toEqual([
        "a",
        1,
        "b",
        2,
      ]);
    });

    it("rejects arrays with partially invalid elements", () => {
      const defaults = { items: ["default"] };
      const from: AnyObject = {
        items: ["valid", 123, "also valid"],
      };

      // Should reject entire array and return default
      expect(fixArray(defaults, from, "items", ["string"])).toEqual([
        "default",
      ]);
    });

    it("throws TypeError when default is not an array", () => {
      const defaults = { notArray: "string" };
      const from: AnyObject = {
        notArray: ["a", "b"] as unknown,
      };

      expect(() => {
        // @ts-expect-error: testing behavior when default is not an array
        fixArray(defaults, from, "notArray", ["string"]);
      }).toThrow(TypeError);
    });
  });

  describe("fixInSet", () => {
    it("returns value when it exists in set", () => {
      const defaults = { color: "red" as const };
      const set = ["red", "green", "blue"] as const;
      const from1: AnyObject = { color: "green" };
      const from2: AnyObject = { color: "blue" };

      expect(fixInSet(defaults, from1, "color", set)).toBe("green");
      expect(fixInSet(defaults, from2, "color", set)).toBe("blue");
    });

    it("returns default when value not in set", () => {
      const defaults = { color: "red" as const };
      const set = ["red", "green", "blue"] as const;
      const from: AnyObject = { color: "yellow" };

      expect(fixInSet(defaults, from, "color", set)).toBe("red");
    });

    it("handles numeric sets", () => {
      const defaults = { level: 1 };
      const set = [1, 2, 3, 4, 5] as const;
      const from1: AnyObject = { level: 3 };
      const from2: AnyObject = { level: 10 };

      expect(fixInSet(defaults, from1, "level", set)).toBe(3);
      expect(fixInSet(defaults, from2, "level", set)).toBe(1);
    });

    it("handles mixed-type sets", () => {
      const defaults = { value: "default" as const };
      const set = ["a", 1, true, null] as const;
      const from1: AnyObject = {
        value: 1,
      };
      const from2: AnyObject = {
        value: true,
      };
      const from3: AnyObject = {
        value: "invalid",
      };

      expect(fixInSet(defaults, from1, "value", set)).toBe(1);
      expect(fixInSet(defaults, from2, "value", set)).toBe(true);
      expect(fixInSet(defaults, from3, "value", set)).toBe("default");
    });

    it("handles empty set", () => {
      const defaults = { value: "default" };
      const set = [] as const;
      const from: AnyObject = { value: "anything" };

      expect(fixInSet(defaults, from, "value", set)).toBe("default");
    });

    it("handles single-element set", () => {
      const defaults = { value: "only" as const };
      const set = ["only"] as const;
      const from1: AnyObject = { value: "only" };
      const from2: AnyObject = { value: "other" };

      expect(fixInSet(defaults, from1, "value", set)).toBe("only");
      expect(fixInSet(defaults, from2, "value", set)).toBe("only");
    });

    it("uses strict equality for set membership", () => {
      const defaults = { value: 0 };
      const set = [0, 1, 2] as const;
      const from1: AnyObject = { value: 0 };
      const from2: AnyObject = {
        value: false,
      };

      expect(fixInSet(defaults, from1, "value", set)).toBe(0);
      // false should not match 0 with strict equality
      expect(fixInSet(defaults, from2, "value", set)).toBe(0);
    });
  });

  describe("Fixed interface", () => {
    it("Fixed type has correct shape", () => {
      const fixed: Fixed<string> = {
        value: "test",
        valid: true,
      };

      expect(fixed.value).toBe("test");
      expect(fixed.valid).toBe(true);
    });
  });
});
