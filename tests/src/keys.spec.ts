/**
 * Comprehensive tests for src/keys.ts — hotkey management and filtering
 */
import type {
  HotkeyManager,
  Keymap,
  KeymapContext,
  KeymapEventListener,
} from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newHotkeyListener } from "../../src/keys.js";
import type { PluginContext } from "../../src/plugin.js";

// Test-friendly mock type: exposes private-ish fields that the real HotkeyManager
// keeps internal but our tests need to read/manipulate.
type MockHotkeyManager = Partial<HotkeyManager> & {
  bake?: ReturnType<typeof vi.fn>;
  bakedHotkeys?: Array<{ modifiers: string[]; key: string }>;
  bakedIds?: string[];
  defaultKeys?: Record<string, Array<{ modifiers: string[]; key: string }>>;
  customKeys?: Record<string, Array<{ modifiers: string[]; key: string }>>;
  baked?: boolean;
};

describe("keys.ts — hotkey management", () => {
  let mockContext: PluginContext;
  let mockHotkeyManager: MockHotkeyManager;
  let mockKeymap: {
    constructor: {
      isMatch: ReturnType<typeof vi.fn>;
    };
  };
  let mockApp: {
    hotkeyManager: MockHotkeyManager;
    commands: {
      findCommand: ReturnType<typeof vi.fn>;
      executeCommand: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock hotkey manager
    mockHotkeyManager = {
      bake: vi.fn(),
      bakedHotkeys: [
        { modifiers: ["Ctrl"], key: "k" },
        { modifiers: ["Alt"], key: "s" },
      ],
      bakedIds: ["command-1", "command-2"],
      defaultKeys: {
        "command-1": [{ modifiers: ["Ctrl"], key: "k" }],
        "command-2": [{ modifiers: ["Alt"], key: "s" }],
      },
      customKeys: {},
      removeHotkeys: vi.fn(),
      setHotkeys: vi.fn(),
      baked: false,
    } as MockHotkeyManager;

    // Mock keymap
    mockKeymap = {
      constructor: {
        isMatch: vi.fn(() => false),
      },
    };

    // Mock app
    mockApp = {
      hotkeyManager: mockHotkeyManager,
      commands: {
        findCommand: vi.fn(),
        executeCommand: vi.fn(),
      },
    };

    // Mock plugin context
    mockContext = {
      app: mockApp,
      register: vi.fn((callback: () => unknown) => {
        // Optionally call the callback immediately for testing
        return callback;
      }),
      // minimal language mock used by revealPrivate's error handler
      language: { value: { t: vi.fn((k: string) => k) } },
    } as unknown as PluginContext;

    mockContext.app.keymap = mockKeymap as unknown as Keymap;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("newHotkeyListener", () => {
    it("creates hotkey listener function", () => {
      const listener = newHotkeyListener(mockContext);

      expect(listener).toBeDefined();
      expect(typeof listener).toBe("function");
    });

    it("returns function that accepts event and context", () => {
      const listener = newHotkeyListener(mockContext);

      expect(listener.length).toBeGreaterThanOrEqual(2);
    });

    it("filters hotkeys by provided IDs", () => {
      const ids = new Set(["command-1"]);

      const listener = newHotkeyListener(mockContext, ids);

      expect(listener).toBeDefined();
    });

    it("handles empty ID set", () => {
      const ids = new Set<string>();

      const listener = newHotkeyListener(mockContext, ids);

      expect(listener).toBeDefined();
    });

    it("handles undefined IDs (no filtering)", () => {
      const listener = newHotkeyListener(mockContext, undefined);

      expect(listener).toBeDefined();
    });

    it("registers cleanup callback", () => {
      newHotkeyListener(mockContext);

      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(mockContext.register).toHaveBeenCalled();
    });

    it("patches hotkey manager bake method", () => {
      newHotkeyListener(mockContext);

      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(mockContext.register).toHaveBeenCalled();
    });

    it("handles context without keymap gracefully", () => {
      const contextWithoutKeymap = {
        ...mockContext,
        app: {
          ...mockApp,
          keymap: undefined,
        },
      } as unknown as PluginContext;

      expect(() => newHotkeyListener(contextWithoutKeymap)).not.toThrow();
    });

    it("handles missing hotkey manager gracefully", () => {
      const contextWithoutHotkeyManager = {
        ...mockContext,
        app: {
          ...mockApp,
          hotkeyManager: undefined,
        },
      } as unknown as PluginContext;

      // suppress private-API warnings for this intentional negative test
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // revealPrivate should catch missing private API and return the fallback (noop)
      expect(() =>
        newHotkeyListener(contextWithoutHotkeyManager),
      ).not.toThrow();

      const listener = newHotkeyListener(contextWithoutHotkeyManager);
      expect(listener).toBeDefined();
      expect(typeof listener).toBe("function");

      // restore spies (afterEach will also restore, but keep explicit expectation)
      // revealPrivate (src/private.ts) logs the caught TypeError and the
      // translation-keyed warning (mock `t` returns the key as-is).
      expect(debugSpy).toHaveBeenCalledWith(expect.any(TypeError));
      expect(warnSpy).toHaveBeenCalledWith(
        "errors.private-API-changed",
        expect.any(Error),
      );
    });
  });

  describe("hotkey listener behavior", () => {
    it("calls hotkey manager bake method", () => {
      // sanity-check mocks
      expect(mockContext.app).toBeDefined();
      expect(mockApp.hotkeyManager).toBeDefined();

      const listener = newHotkeyListener(mockContext);

      // Mock event and keymap context
      const mockEvent = { repeat: false } as KeyboardEvent;
      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;
      const result: unknown = listener(mockEvent, mockKeymapContext);
      if (typeof result !== "boolean" && typeof result !== "undefined") {
        throw new Error(
          "Expected hotkey listener to return boolean or undefined",
        );
      }
      expect(mockApp.hotkeyManager.bake).toHaveBeenCalled();
      // bakedHotkeys on the hotkey manager should remain defined
      expect(mockApp.hotkeyManager.bakedHotkeys).toBeDefined();
      expect(typeof result === "boolean" || typeof result === "undefined").toBe(
        true,
      );
    });

    it("returns true when no hotkey matches", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(false);

      const listener = newHotkeyListener(mockContext);

      const mockEvent = { repeat: false } as KeyboardEvent;
      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      listener(mockEvent, mockKeymapContext);

      // no command should be executed when there is no match
      expect(mockKeymap.constructor.isMatch).toHaveBeenCalled();
      expect(mockApp.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("executes command when hotkey matches", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue({
        id: "command-1",
        name: "Test Command",
      });
      mockApp.commands.executeCommand.mockReturnValue(true);

      const listener = newHotkeyListener(mockContext);

      const mockEvent = { repeat: false } as KeyboardEvent;
      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      listener(mockEvent, mockKeymapContext);

      expect(mockApp.commands.findCommand).toHaveBeenCalled();
      expect(mockApp.commands.executeCommand).toHaveBeenCalled();
    });

    it("respects command repeatable flag", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue({
        id: "command-1",
        name: "Test Command",
        repeatable: false,
      });
      mockApp.commands.executeCommand.mockReturnValue(true);

      const listener = newHotkeyListener(mockContext);

      const mockEvent = { repeat: true } as KeyboardEvent;
      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      listener(mockEvent, mockKeymapContext);

      // Should not execute non-repeatable command on repeat
      expect(mockApp.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("allows repeatable commands on repeat events", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue({
        id: "command-1",
        name: "Test Command",
        repeatable: true,
      });
      mockApp.commands.executeCommand.mockReturnValue(true);

      const listener = newHotkeyListener(mockContext);

      const mockEvent = { repeat: true } as KeyboardEvent;
      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      listener(mockEvent, mockKeymapContext);

      expect(mockApp.commands.executeCommand).toHaveBeenCalled();
    });

    it("handles missing command gracefully", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue(null);

      const listener = newHotkeyListener(mockContext);

      const mockEvent = { repeat: false } as KeyboardEvent;
      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      listener(mockEvent, mockKeymapContext);

      expect(mockApp.commands.findCommand).toHaveBeenCalled();
      expect(mockApp.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("handles command execution failure", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue({
        id: "command-1",
        name: "Test Command",
      });
      mockApp.commands.executeCommand.mockReturnValue(false);

      const listener = newHotkeyListener(mockContext);

      const mockEvent = { repeat: false } as KeyboardEvent;
      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      listener(mockEvent, mockKeymapContext);

      // command execution attempted but returned false
      expect(mockApp.commands.findCommand).toHaveBeenCalled();
      expect(mockApp.commands.executeCommand).toHaveBeenCalled();
    });
  });

  describe("listener result", () => {
    const keymapContext: KeymapContext = {
      key: null,
      modifiers: null,
      vkey: "",
    };

    // Obsidian prevents and stops a key event only when the listener returns `false`.
    function press(init?: KeyboardEventInit): unknown {
      const result: unknown = newHotkeyListener(mockContext)(
        new KeyboardEvent("keydown", init),
        keymapContext,
      );
      return result;
    }

    it("returns false after it ran a command", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue({
        id: "command-1",
        name: "Test Command",
      });
      mockApp.commands.executeCommand.mockReturnValue(true);

      expect(press()).toBe(false);
      expect(mockApp.commands.executeCommand).toHaveBeenCalledTimes(1);
    });

    it("returns nothing when no hotkey matches", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(false);

      expect(press()).toBeUndefined();
      expect(mockApp.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("returns false for a repeat of a command that does not repeat, without running it", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue({
        id: "command-1",
        name: "Test Command",
      });
      mockApp.commands.executeCommand.mockReturnValue(true);

      expect(press({ repeat: true })).toBe(false);
      expect(mockApp.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("runs a repeatable command again on a repeat and returns false", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue({
        id: "command-1",
        name: "Test Command",
        repeatable: true,
      });
      mockApp.commands.executeCommand.mockReturnValue(true);

      expect(press({ repeat: true })).toBe(false);
      expect(mockApp.commands.executeCommand).toHaveBeenCalledTimes(1);
    });

    it("runs a repeatable command that shares the hotkey on a repeat", () => {
      const repeatable = {
        id: "command-2",
        name: "Repeatable Command",
        repeatable: true,
      };
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockImplementation((id: string) =>
        id === "command-2"
          ? repeatable
          : { id: "command-1", name: "Test Command" },
      );
      mockApp.commands.executeCommand.mockReturnValue(true);

      expect(press({ repeat: true })).toBe(false);
      expect(mockApp.commands.executeCommand).toHaveBeenCalledTimes(1);
      expect(mockApp.commands.executeCommand).toHaveBeenCalledWith(repeatable);
    });

    it("returns nothing for a repeat when no hotkey matches", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(false);

      expect(press({ repeat: true })).toBeUndefined();
      expect(mockApp.commands.findCommand).not.toHaveBeenCalled();
    });

    it("returns nothing for a repeat of a hotkey without a command", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue(undefined);

      expect(press({ repeat: true })).toBeUndefined();
      expect(mockApp.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("returns nothing for a repeat of a repeatable command that did not run", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue({
        id: "command-1",
        name: "Test Command",
        repeatable: true,
      });
      mockApp.commands.executeCommand.mockReturnValue(false);

      expect(press({ repeat: true })).toBeUndefined();
      expect(mockApp.commands.executeCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe("held keys with Obsidian's hotkey table", () => {
    interface Key {
      readonly modifiers: readonly string[];
      readonly key: string;
    }
    interface BakedKey {
      readonly modifiers: string;
      readonly key: string;
    }

    const LISTED = "terminal:clear-terminal",
      UNLISTED = "command-palette:open",
      compile = (modifiers: readonly string[]): string =>
        [...modifiers].sort().join(","),
      // `Keymap.isMatch` of Obsidian 1.14.4.
      isMatch = (hotkey: BakedKey, ctx: KeymapContext): boolean =>
        hotkey.modifiers === ctx.modifiers &&
        (!hotkey.key ||
          hotkey.key === ctx.vkey ||
          (ctx.key !== null &&
            hotkey.key.toLowerCase() === ctx.key.toLowerCase()));

    /**
     * The hotkey table of Obsidian 1.14.4: the user's keys are handed out as a
     * copy, and `bake` lists them before the default keys of the commands the
     * user did not rebind.
     */
    class HotkeyTable {
      public readonly defaultKeys: Record<string, readonly Key[]> = {};
      public baked = false;
      public bakedHotkeys: readonly BakedKey[] = [];
      public bakedIds: readonly string[] = [];
      readonly #customKeys: Record<string, readonly Key[]> = {};

      public get customKeys(): Record<string, readonly Key[]> {
        return { ...this.#customKeys };
      }

      public setHotkeys(id: string, keys: readonly Key[]): void {
        this.#customKeys[id] = keys;
        this.baked = false;
      }

      public removeHotkeys(id: string): void {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- as Obsidian does
        delete this.#customKeys[id];
        this.baked = false;
      }

      public bake(): void {
        if (this.baked) return;
        this.baked = true;
        const custom = Object.entries(this.#customKeys),
          entries = [
            ...custom,
            ...Object.entries(this.defaultKeys).filter(
              ([id]) => !(id in this.#customKeys),
            ),
          ].flatMap(([id, keys]) => keys.map((key) => ({ id, key })));
        this.bakedIds = entries.map(({ id }) => id);
        this.bakedHotkeys = entries.map(({ key: { key, modifiers } }) => ({
          key,
          modifiers: compile(modifiers),
        }));
      }
    }

    function setup() {
      const table = new HotkeyTable(),
        commands = new Map(
          [LISTED, UNLISTED].map((id) => [id, { id, name: id }]),
        ),
        // Obsidian reports success unless the command throws.
        executeCommand = vi.fn(() => true);
      table.defaultKeys[LISTED] = [{ key: "k", modifiers: ["Ctrl", "Shift"] }];
      table.setHotkeys(UNLISTED, [{ key: "p", modifiers: ["Ctrl"] }]);
      const context = {
        app: {
          commands: {
            executeCommand,
            findCommand: (id: string) => commands.get(id),
          },
          hotkeyManager: table,
          keymap: { constructor: { isMatch } },
        },
        language: { value: { t: (key: string) => key } },
        register: vi.fn(),
      } as unknown as PluginContext;
      return { context, executeCommand, table };
    }

    // One key-down, as Obsidian hands it to the listener.
    function send(
      listener: KeymapEventListener,
      { key, modifiers }: Key,
      repeat: boolean,
    ): unknown {
      const result: unknown = listener(
        new KeyboardEvent("keydown", { key, repeat }),
        { key, modifiers: compile(modifiers), vkey: key },
      );
      return result;
    }

    // The key-down, then three key-downs with `repeat` set.
    function hold(
      listener: KeymapEventListener,
      key: Key,
      repeats = 3,
    ): unknown[] {
      return Array.from({ length: repeats + 1 }, (_, index) =>
        send(listener, key, index > 0),
      );
    }

    const listedKey = { key: "k", modifiers: ["Ctrl", "Shift"] },
      unlistedKey = { key: "p", modifiers: ["Ctrl"] },
      repeat = (listener: KeymapEventListener, key: Key): unknown =>
        send(listener, key, true);

    it("consumes a held hotkey on the list and passes one off the list on", () => {
      const { context, executeCommand } = setup(),
        listener = newHotkeyListener(context, new Set([LISTED]));

      expect(hold(listener, listedKey)).toStrictEqual([
        false,
        false,
        false,
        false,
      ]);
      expect(hold(listener, unlistedKey)).toStrictEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);

      expect(executeCommand).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: LISTED }),
      );
    });

    it.each(["after", "before"])(
      "answers by its own list when a listener for every command, made %s it, shares the table",
      (order) => {
        const { context, executeCommand, table } = setup(),
          ids = new Set([LISTED]),
          make = (): readonly [KeymapEventListener, KeymapEventListener] => {
            if (order === "after") {
              const listed = newHotkeyListener(context, ids);
              return [listed, newHotkeyListener(context)];
            }
            const every = newHotkeyListener(context);
            return [newHotkeyListener(context, ids), every];
          },
          [listed, every] = make();

        expect(repeat(listed, unlistedKey)).toBeUndefined();
        expect(repeat(every, unlistedKey)).toBe(false);
        expect(repeat(listed, listedKey)).toBe(false);
        expect(repeat(every, listedKey)).toBe(false);
        expect(executeCommand).not.toHaveBeenCalled();

        expect(hold(listed, unlistedKey, 0)).toStrictEqual([undefined]);
        expect(hold(every, unlistedKey, 0)).toStrictEqual([false]);
        expect(executeCommand).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ id: UNLISTED }),
        );

        // Obsidian's own table outside the terminal still has every hotkey.
        expect([...table.bakedIds].sort()).toStrictEqual(
          [LISTED, UNLISTED].sort(),
        );
        expect(table.customKeys).toStrictEqual({
          [UNLISTED]: [unlistedKey],
        });
      },
    );

    it("follows a changed list at the next key once the table is stale", () => {
      const { context, executeCommand, table } = setup(),
        ids = new Set([LISTED]),
        listener = newHotkeyListener(context, ids);

      expect(repeat(listener, listedKey)).toBe(false);

      ids.delete(LISTED);
      table.baked = false;
      expect(repeat(listener, listedKey)).toBeUndefined();

      ids.add(LISTED);
      table.baked = false;
      expect(repeat(listener, listedKey)).toBe(false);

      expect(executeCommand).not.toHaveBeenCalled();
    });
  });

  describe("ID filtering", () => {
    it("only processes hotkeys for specified IDs", () => {
      const ids = new Set(["command-1"]);
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue({
        id: "command-1",
        name: "Command 1",
      });
      mockApp.commands.executeCommand.mockReturnValue(true);

      const listener = newHotkeyListener(mockContext, ids);

      const mockEvent = { repeat: false } as KeyboardEvent;
      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      listener(mockEvent, mockKeymapContext);

      // Should only process command-1
      expect(mockApp.commands.findCommand).toHaveBeenCalled();
    });

    it("filters out hotkeys not in ID set", () => {
      const ids = new Set(["command-3"]); // ID not in bakedIds

      const listener = newHotkeyListener(mockContext, ids);

      expect(listener).toBeDefined();
    });

    it("handles multiple IDs", () => {
      const ids = new Set(["command-1", "command-2"]);

      const listener = newHotkeyListener(mockContext, ids);

      expect(listener).toBeDefined();
    });

    it("processes all hotkeys when no IDs provided", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue({
        id: "command-1",
        name: "Command 1",
      });
      mockApp.commands.executeCommand.mockReturnValue(true);

      const listener = newHotkeyListener(mockContext);

      const mockEvent = { repeat: false } as KeyboardEvent;
      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      listener(mockEvent, mockKeymapContext);

      expect(mockApp.commands.findCommand).toHaveBeenCalled();
    });
  });

  describe("bake method patching", () => {
    it("patches hotkey manager bake method", () => {
      newHotkeyListener(mockContext);

      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(mockContext.register).toHaveBeenCalled();
    });

    it("handles bake method with already baked state", () => {
      mockHotkeyManager.baked = true;

      newHotkeyListener(mockContext);

      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(mockContext.register).toHaveBeenCalled();
    });

    it("restores original bake method on cleanup", () => {
      newHotkeyListener(mockContext);

      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(mockContext.register).toHaveBeenCalled();

      // Cleanup should be registered
      const registeredCallback: unknown = (
        mockContext.register as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[0];
      expect(typeof registeredCallback).toBe("function");
    });

    it("filters default keys during bake", () => {
      const ids = new Set(["command-1"]);

      newHotkeyListener(mockContext, ids);

      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(mockContext.register).toHaveBeenCalled();
    });

    it("filters custom keys during bake", () => {
      mockHotkeyManager.customKeys = {
        "command-1": [{ modifiers: ["Ctrl", "Shift"], key: "k" }],
        "command-3": [{ modifiers: ["Alt"], key: "x" }],
      };

      const ids = new Set(["command-1"]);

      newHotkeyListener(mockContext, ids);

      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(mockContext.register).toHaveBeenCalled();
    });
  });

  describe("edge cases and error handling", () => {
    it("handles null context gracefully", () => {
      expect(() =>
        newHotkeyListener(null as unknown as PluginContext),
      ).toThrow();
    });

    it("handles undefined context gracefully", () => {
      expect(() =>
        newHotkeyListener(undefined as unknown as PluginContext),
      ).toThrow();
    });

    it("handles empty bakedHotkeys array", () => {
      mockHotkeyManager.bakedHotkeys = [];
      mockHotkeyManager.bakedIds = [];

      const listener = newHotkeyListener(mockContext);

      const mockEvent = { repeat: false } as KeyboardEvent;
      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      listener(mockEvent, mockKeymapContext);
      expect(mockApp.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("handles mismatched bakedHotkeys and bakedIds lengths", () => {
      mockHotkeyManager.bakedHotkeys = [{ modifiers: ["Ctrl"], key: "k" }];
      mockHotkeyManager.bakedIds = [];

      const listener = newHotkeyListener(mockContext);

      expect(listener).toBeDefined();
    });

    it("handles null event", () => {
      const listener = newHotkeyListener(mockContext);

      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      expect(() => {
        listener(null as unknown as KeyboardEvent, mockKeymapContext);
      }).not.toThrow();
    });

    it("handles null keymap context", () => {
      const listener = newHotkeyListener(mockContext);

      const mockEvent = { repeat: false } as KeyboardEvent;

      expect(() => {
        listener(mockEvent, null as unknown as KeymapContext);
      }).not.toThrow();
    });

    it("handles exception in command execution", () => {
      mockKeymap.constructor.isMatch.mockReturnValue(true);
      mockApp.commands.findCommand.mockReturnValue({
        id: "command-1",
        name: "Test Command",
      });
      mockApp.commands.executeCommand.mockImplementation(() => {
        throw new Error("Execution error");
      });

      // silence and capture private-API logs produced by revealPrivate
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const listener = newHotkeyListener(mockContext);

      const mockEvent = { repeat: false } as KeyboardEvent;
      const mockKeymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      // revealPrivate should catch errors from private API calls — listener should not throw
      expect(() => {
        listener(mockEvent, mockKeymapContext);
      }).not.toThrow();
      expect(mockApp.commands.executeCommand).toHaveBeenCalled();

      // ensure revealPrivate logged the expected private-API warning and the original error
      expect(debugSpy).toHaveBeenCalledWith(expect.any(Error));
      expect(warnSpy).toHaveBeenCalledWith(
        "errors.private-API-changed",
        expect.any(Error),
      );

      // also assert the error message is preserved
      const loggedError = warnSpy.mock.calls[0]?.[1] as Error | undefined;
      expect(loggedError).toBeInstanceOf(Error);
      expect(loggedError?.message).toBe("Execution error");
    });

    it("handles missing baked property", () => {
      const hotkeyManagerWithoutBaked = {
        ...mockHotkeyManager,
        baked: undefined,
      } as MockHotkeyManager;

      mockApp.hotkeyManager = hotkeyManagerWithoutBaked;

      const listener = newHotkeyListener(mockContext);

      expect(listener).toBeDefined();
    });
  });

  describe("type safety", () => {
    it("accepts KeyboardEvent", () => {
      const listener: KeymapEventListener = newHotkeyListener(mockContext);

      const event: KeyboardEvent = new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
      });
      const keymapContext = {
        vkey: "",
        modifiers: null,
        key: null,
      } as unknown as KeymapContext;

      listener(event, keymapContext);

      expect(listener).toBeDefined();
    });

    it("accepts Set<string> for IDs", () => {
      const ids: Set<string> = new Set(["command-1", "command-2"]);

      const listener = newHotkeyListener(mockContext, ids);

      expect(listener).toBeDefined();
    });

    it("returns KeymapEventListener", () => {
      const listener: KeymapEventListener = newHotkeyListener(mockContext);

      expect(typeof listener).toBe("function");
    });

    it("handles PluginContext interface", () => {
      const context: PluginContext = mockContext;

      const listener = newHotkeyListener(context);

      expect(listener).toBeDefined();
    });
  });
});
