/**
 * Comprehensive tests for src/obsidian.ts — Obsidian API utilities and components
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LambdaComponent,
  ResourceComponent,
  UpdatableUI,
  statusUI,
  cleanFrontmatterCache,
  printError,
  printMalformedData,
} from "../../src/obsidian.js";
import { toJSONOrString } from "../../src/utils.js";
import { linkSetting } from "../../src/settings-widgets.js";
import type { FrontMatterCache, Notice } from "obsidian";
import type { PluginContext } from "../../src/plugin.js";
import { noop } from "es-toolkit/function";
import { runInNewContext } from "node:vm";

// `UpdatableUI.newSetting` needs text components backed by real elements,
// which the shared mock lacks: `setValue` writes the element without firing
// events and `onChange` listens to `input`, as in Obsidian. No other test here
// uses these classes.
vi.mock("obsidian", async (importOriginal) => {
  class ValueComponent {
    public setDisabled(): this {
      return this;
    }
  }
  class AbstractTextComponent<
    E extends HTMLInputElement | HTMLTextAreaElement,
  > extends ValueComponent {
    #onChange: (value: string) => unknown = () => undefined;
    public constructor(public readonly inputEl: E) {
      super();
      inputEl.addEventListener("input", () => this.#onChange(inputEl.value));
    }
    public getValue(): string {
      return this.inputEl.value;
    }
    public setValue(value: string): this {
      this.inputEl.value = value;
      return this;
    }
    public setPlaceholder(): this {
      return this;
    }
    public onChange(callback: (value: string) => unknown): this {
      this.#onChange = callback;
      return this;
    }
  }
  class Setting {
    public readonly settingEl = document.createElement("div");
    public constructor(containerEl: HTMLElement) {
      containerEl.append(this.settingEl);
    }
    public setName(): this {
      return this;
    }
    public setDesc(): this {
      return this;
    }
    public setDisabled(): this {
      return this;
    }
    public setTooltip(): this {
      return this;
    }
    public addText(
      cb: (component: AbstractTextComponent<HTMLInputElement>) => unknown,
    ): this {
      const el = this.settingEl.appendChild(document.createElement("input"));
      cb(new AbstractTextComponent(el));
      return this;
    }
    public addTextArea(
      cb: (component: AbstractTextComponent<HTMLTextAreaElement>) => unknown,
    ): this {
      const el = this.settingEl.appendChild(document.createElement("textarea"));
      cb(new AbstractTextComponent(el));
      return this;
    }
  }
  return {
    ...(await importOriginal<object>()),
    AbstractTextComponent,
    Setting,
    ValueComponent,
  };
});

describe("obsidian.ts — Obsidian API utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("LambdaComponent", () => {
    it("creates component with default callbacks", () => {
      const component = new LambdaComponent();

      expect(component).toBeDefined();
      expect(component).toBeInstanceOf(LambdaComponent);
    });

    it("calls onLoad callback when component loads", () => {
      const onLoad = vi.fn();
      const component = new LambdaComponent(onLoad);

      component.load();

      expect(onLoad).toHaveBeenCalledTimes(1);
      expect(onLoad).toHaveBeenCalledWith();
    });

    it("calls onUnload callback when component unloads", () => {
      const onUnload = vi.fn();
      const component = new LambdaComponent(undefined, onUnload);

      component.load();
      component.unload();

      expect(onUnload).toHaveBeenCalledTimes(1);
      expect(onUnload).toHaveBeenCalledWith();
    });

    it("calls both callbacks in lifecycle", () => {
      const onLoad = vi.fn();
      const onUnload = vi.fn();
      const component = new LambdaComponent(onLoad, onUnload);

      component.load();
      expect(onLoad).toHaveBeenCalledTimes(1);
      expect(onUnload).not.toHaveBeenCalled();

      component.unload();
      expect(onUnload).toHaveBeenCalledTimes(1);
    });

    it("allows multiple load/unload cycles", () => {
      const onLoad = vi.fn();
      const onUnload = vi.fn();
      const component = new LambdaComponent(onLoad, onUnload);

      component.load();
      component.unload();
      component.load();
      component.unload();

      expect(onLoad).toHaveBeenCalledTimes(2);
      expect(onUnload).toHaveBeenCalledTimes(2);
    });

    it("handles errors in onLoad callback", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
        // Mock
      });
      const onLoad = vi.fn(() => {
        throw new Error("Load error");
      });
      const component = new LambdaComponent(onLoad);

      expect(() => {
        component.load();
      }).toThrow("Load error");

      // The mocked Obsidian `Component` does not catch or log `onload` errors,
      // so `console.error` must remain silent here.
      expect(consoleError).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("handles errors in onUnload callback", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
        // Mock
      });
      const onUnload = vi.fn(() => {
        throw new Error("Unload error");
      });
      const component = new LambdaComponent(undefined, onUnload);

      component.load();
      expect(() => {
        component.unload();
      }).toThrow("Unload error");

      // The mocked Obsidian `Component` does not catch or log `onunload` errors,
      // so `console.error` must remain silent here.
      expect(consoleError).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("uses 'this' context in callbacks", () => {
      let capturedThis: unknown;
      const onLoad = function fn(this: LambdaComponent): void {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- capture this for test verification
        capturedThis = this;
      };
      const component = new LambdaComponent(onLoad);

      component.load();

      expect(capturedThis).toBe(component);
    });

    it("handles undefined callbacks gracefully", () => {
      const component = new LambdaComponent(undefined, undefined);

      expect(() => {
        component.load();
        component.unload();
      }).not.toThrow();
    });
  });

  describe("ResourceComponent", () => {
    class TestResourceComponent extends ResourceComponent<string> {
      protected override load0(): string {
        return "test-value";
      }
    }

    class AsyncResourceComponent extends ResourceComponent<number> {
      protected override async load0(): Promise<number> {
        return Promise.resolve(42);
      }
    }

    class ErrorResourceComponent extends ResourceComponent<string> {
      protected override load0(): string {
        throw new Error("Load failed");
      }
    }

    it("loads resource synchronously", async () => {
      const component = new TestResourceComponent();

      component.load();
      await component.onLoaded;

      expect(component.value).toBe("test-value");
    });

    it("loads resource asynchronously", async () => {
      const component = new AsyncResourceComponent();

      component.load();
      const value = await component.onLoaded;

      expect(value).toBe(42);
      expect(component.value).toBe(42);
    });

    it("throws when accessing value before load", () => {
      const component = new TestResourceComponent();

      expect(() => component.value).toThrow();
    });

    it("provides onLoaded promise", async () => {
      const component = new TestResourceComponent();

      component.load();
      const loadedPromise = component.onLoaded;

      expect(loadedPromise).toBeInstanceOf(Promise);
      await expect(loadedPromise).resolves.toBe("test-value");
    });

    it("handles load errors", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
        // Mock
      });
      const component = new ErrorResourceComponent();

      component.load();

      // The error is caught and logged, not re-thrown
      await new Promise((resolve) => window.setTimeout(resolve, 10));

      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("allows unload and reload", async () => {
      const component = new TestResourceComponent();

      component.load();
      await component.onLoaded;
      expect(component.value).toBe("test-value");

      component.unload();
      expect(() => component.value).toThrow();

      component.load();
      await component.onLoaded;
      expect(component.value).toBe("test-value");
    });

    it("resets value on unload", async () => {
      const component = new TestResourceComponent();

      component.load();
      await component.onLoaded;
      expect(component.value).toBe("test-value");

      component.unload();

      expect(() => component.value).toThrow();
    });

    it("allows setting value after load", async () => {
      class MutableResourceComponent extends ResourceComponent<string> {
        protected override load0(): string {
          return "initial";
        }

        public setValue(newValue: string): void {
          this.value = newValue;
        }
      }

      const component = new MutableResourceComponent();

      component.load();
      await component.onLoaded;
      expect(component.value).toBe("initial");

      component.setValue("updated");
      expect(component.value).toBe("updated");
    });

    it("throws when setting value before load", () => {
      class MutableResourceComponent extends ResourceComponent<string> {
        protected override load0(): string {
          return "initial";
        }

        public setValue(newValue: string): void {
          this.value = newValue;
        }
      }

      const component = new MutableResourceComponent();

      expect(() => {
        component.setValue("value");
      }).toThrow();
    });
  });

  describe("UpdatableUI", () => {
    it("creates updatable UI instance", () => {
      const ui = new UpdatableUI();

      expect(ui).toBeDefined();
      expect(ui).toBeInstanceOf(UpdatableUI);
    });

    it("creates and configures UI element", () => {
      const ui = new UpdatableUI();
      const create = vi.fn(() => ({ value: 0 }));
      const configure = vi.fn();

      ui.new(create, configure, null);

      expect(create).toHaveBeenCalledTimes(1);
      expect(configure).toHaveBeenCalledTimes(1);
      expect(configure).toHaveBeenCalledWith({ value: 0 });
    });

    it("creates UI element without configure", () => {
      const ui = new UpdatableUI();
      const create = vi.fn(() => ({ value: 1 }));

      ui.new(create, null, null);

      expect(create).toHaveBeenCalledTimes(1);
    });

    it("creates UI element with destroy callback", () => {
      const ui = new UpdatableUI();
      const create = vi.fn(() => ({ value: 2 }));
      const destroy = vi.fn();

      ui.new(create, null, destroy);

      expect(create).toHaveBeenCalledTimes(1);
      expect(destroy).not.toHaveBeenCalled();
    });

    it("updates UI when update is called", () => {
      const ui = new UpdatableUI();
      const configure = vi.fn();
      const create = () => ({ value: 3 });

      ui.new(create, configure, null);
      expect(configure).toHaveBeenCalledTimes(1);

      ui.update();
      expect(configure).toHaveBeenCalledTimes(2);
    });

    it("finalizes UI when destroy is called", () => {
      const ui = new UpdatableUI();
      const destroy = vi.fn();
      const create = () => ({ value: 4 });

      ui.new(create, null, destroy);
      expect(destroy).not.toHaveBeenCalled();

      ui.destroy();
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(destroy).toHaveBeenCalledWith({ value: 4 });
    });

    it("supports multiple UI elements", () => {
      const ui = new UpdatableUI();
      const configure1 = vi.fn();
      const configure2 = vi.fn();

      ui.new(() => ({ id: 1 }), configure1, null);
      ui.new(() => ({ id: 2 }), configure2, null);

      expect(configure1).toHaveBeenCalledTimes(1);
      expect(configure2).toHaveBeenCalledTimes(1);

      ui.update();

      expect(configure1).toHaveBeenCalledTimes(2);
      expect(configure2).toHaveBeenCalledTimes(2);
    });

    it("destroys all elements when destroy is called", () => {
      const ui = new UpdatableUI();
      const destroy1 = vi.fn();
      const destroy2 = vi.fn();

      ui.new(() => ({ id: 1 }), null, destroy1);
      ui.new(() => ({ id: 2 }), null, destroy2);

      ui.destroy();

      expect(destroy1).toHaveBeenCalledTimes(1);
      expect(destroy2).toHaveBeenCalledTimes(1);
    });

    it("handles errors in create gracefully", () => {
      const ui = new UpdatableUI();
      const create = (): never => {
        throw new Error("Create error");
      };

      expect(() => ui.new(create, null, null)).toThrow("Create error");
    });

    it("handles errors in configure gracefully", () => {
      const ui = new UpdatableUI();
      const configure = (): never => {
        throw new Error("Configure error");
      };
      const destroy = vi.fn();

      expect(() => ui.new(() => ({}), configure, destroy)).toThrow(
        "Configure error",
      );

      // Destroy should be called on error
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("returns this for chaining", () => {
      const ui = new UpdatableUI();

      const result = ui.new(() => ({}), null, null);

      expect(result).toBe(ui);
    });
  });

  describe("UpdatableUI.newSetting refresh of a text field", () => {
    // Types `text` at the caret like a keystroke: edit, move caret, fire input.
    async function typeAt(
      el: HTMLInputElement | HTMLTextAreaElement,
      caret: number,
      text: string,
    ): Promise<void> {
      el.focus();
      el.value = el.value.slice(0, caret) + text + el.value.slice(caret);
      el.setSelectionRange(caret + text.length, caret + text.length);
      el.dispatchEvent(new Event("input"));
      // `linkSetting` awaits its setter and callback before the refresh lands.
      await vi.runAllTimersAsync();
    }

    // Adds a text field linked to `state.stored` that refreshes `ui` on change.
    function linkedInput(
      ui: UpdatableUI,
      state: { stored: string },
      parent: HTMLElement = document.body,
    ): HTMLInputElement {
      let input: HTMLInputElement | undefined;
      ui.newSetting(parent, (setting) => {
        setting.addText(
          linkSetting(
            vi.fn(() => state.stored),
            vi.fn((value: string) => {
              state.stored = value;
            }),
            vi.fn(() => {
              ui.update();
            }),
            {
              post(component) {
                input = component.inputEl;
              },
            },
          ),
        );
      });
      if (!input) throw new Error("addText did not run");
      return input;
    }

    // Adds a text field that only the first render writes, so refreshes rely
    // on the reset.
    function firstRenderOnlyInput(ui: UpdatableUI): HTMLInputElement {
      let input: HTMLInputElement | undefined;
      ui.newSetting(document.body, (setting) => {
        setting.addText((text) => {
          if (!input) text.setValue("initial");
          input = text.inputEl;
        });
      });
      if (!input) throw new Error("addText did not run");
      return input;
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      document.body.replaceChildren();
    });

    it("keeps the caret of a focused input when its setting refreshes", async () => {
      const ui = new UpdatableUI();
      const state = { stored: "python3" };
      const input = linkedInput(ui, state);

      await typeAt(input, 0, "u");

      expect(state.stored).toBe("upython3");
      expect(input.value).toBe("upython3");
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 1]);
    });

    it("keeps the caret of a focused textarea mid-document", async () => {
      const ui = new UpdatableUI();
      let stored = '{\n  "fontFamily": "monospace"\n}',
        textArea: HTMLTextAreaElement | undefined;
      ui.newSetting(document.body, (setting) => {
        setting.addTextArea(
          linkSetting(
            vi.fn(() => stored),
            vi.fn((value: string) => {
              stored = value;
            }),
            vi.fn(() => {
              ui.update();
            }),
            {
              post(component) {
                textArea = component.inputEl;
              },
            },
          ),
        );
      });
      if (!textArea) throw new Error("addTextArea did not run");
      const caret = stored.indexOf("monospace") + "mono".length;

      await typeAt(textArea, caret, "X");

      expect(textArea.value).toBe('{\n  "fontFamily": "monoXspace"\n}');
      expect([textArea.selectionStart, textArea.selectionEnd]).toEqual([
        caret + 1,
        caret + 1,
      ]);
    });

    it("stores a second keystroke typed where the first left the caret", async () => {
      const ui = new UpdatableUI();
      const state = { stored: "python3" };
      const input = linkedInput(ui, state);

      await typeAt(input, 0, "u");
      await typeAt(input, input.selectionStart ?? 0, "v");

      expect(state.stored).toBe("uvpython3");
      expect(input.value).toBe("uvpython3");
      expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2]);
    });

    it("keeps the caret of an input focused in another document", async () => {
      const frame = document.body.appendChild(document.createElement("iframe"));
      const { contentDocument } = frame;
      if (!contentDocument) throw new Error("iframe has no document");
      const ui = new UpdatableUI();
      const input = linkedInput(
        ui,
        { stored: "python3" },
        contentDocument.body,
      );

      await typeAt(input, 0, "u");

      // As in a popout window, the global document does not see this focus.
      expect(contentDocument.activeElement).toBe(input);
      expect(document.activeElement).not.toBe(input);
      expect([input.value, input.selectionStart, input.selectionEnd]).toEqual([
        "upython3",
        1,
        1,
      ]);
    });

    it("writes nothing to a focused number input that already shows the stored number", async () => {
      const ui = new UpdatableUI();
      const state = { stored: "5" };
      const input = linkedInput(ui, state);
      input.type = "number";
      input.focus();
      input.value = "15";
      // A number input has no caret to read, so watch what the refresh writes.
      const write = vi.spyOn(input, "value", "set");

      input.dispatchEvent(new Event("input"));
      await vi.runAllTimersAsync();

      expect(state.stored).toBe("15");
      expect(write.mock.calls).toEqual([]);
    });

    it("shows a value changed elsewhere in a focused field", () => {
      const ui = new UpdatableUI();
      const state = { stored: "python3" };
      const input = linkedInput(ui, state);
      input.focus();
      state.stored = "python";

      ui.update();

      expect(input.value).toBe("python");
    });

    it("shows a different number changed elsewhere in a focused number input", () => {
      const ui = new UpdatableUI();
      const state = { stored: "5" };
      const input = linkedInput(ui, state);
      input.type = "number";
      input.focus();
      state.stored = "7";

      ui.update();

      expect(input.value).toBe("7");
    });

    it("keeps a decimal typed key by key into a focused number input", async () => {
      const ui = new UpdatableUI();
      const state = { stored: "14" };
      const input = linkedInput(ui, state);
      input.type = "number";
      // As Chromium on macOS and Windows reports it: `14.` reads as "" with
      // bad input. Record what the refreshes write.
      const writes: string[] = [];
      let text = "14";
      Object.defineProperty(input, "value", {
        configurable: true,
        get: () => (text.endsWith(".") ? "" : text),
        set: (value: string) => {
          writes.push(value);
          text = value;
        },
      });
      Object.defineProperty(input, "validity", {
        configurable: true,
        get: () => ({ badInput: text.endsWith(".") }),
      });
      input.focus();

      for (const typed of ["14.", "14.5"]) {
        text = typed;
        input.dispatchEvent(new Event("input"));
        await vi.runAllTimersAsync();
      }

      expect({ stored: state.stored, text, writes }).toEqual({
        stored: "14.5",
        text: "14.5",
        writes: [],
      });
    });

    it("shows the stored number at the first refresh after the number input loses focus", async () => {
      const ui = new UpdatableUI();
      let stored = 0,
        input: HTMLInputElement | undefined;
      ui.newSetting(document.body, (setting) => {
        setting.addText(
          linkSetting(
            () => stored.toString(),
            (value: string) => {
              stored = Number(value);
            },
            () => {
              ui.update();
            },
            {
              post(component) {
                component.inputEl.type = "number";
                input = component.inputEl;
              },
            },
          ),
        );
      });
      if (!input) throw new Error("addText did not run");
      input.focus();
      input.value = "0400";
      input.dispatchEvent(new Event("input"));
      await vi.runAllTimersAsync();
      expect([stored, input.value]).toEqual([400, "0400"]);

      input.blur();
      expect(input.value).toBe("0400");
      ui.update();

      expect(input.value).toBe("400");
    });

    it("still resets a field the user is not editing", () => {
      const ui = new UpdatableUI();
      const input = firstRenderOnlyInput(ui);
      input.value = "stale";

      ui.update();

      expect(input.value).toBe("initial");
    });

    it("still resets an unfocused field while another field has focus", () => {
      const ui = new UpdatableUI();
      const focused = linkedInput(ui, { stored: "python3" });
      const other = firstRenderOnlyInput(ui);
      focused.focus();
      other.value = "stale";

      ui.update();

      expect(other.value).toBe("initial");
    });

    it("does not reset a focused field until a refresh after it loses focus", () => {
      const ui = new UpdatableUI();
      const input = firstRenderOnlyInput(ui);
      input.focus();
      input.value = "typed";

      ui.update();
      expect(input.value).toBe("typed");

      // Losing focus resets nothing by itself; the next refresh does.
      input.blur();
      expect(input.value).toBe("typed");
      ui.update();
      expect(input.value).toBe("initial");
    });
  });

  describe("statusUI", () => {
    it("creates status UI wrapper", () => {
      const mockUI = new UpdatableUI();
      const element = document.createElement("div");

      const status = statusUI(mockUI, element);

      expect(status).toBeDefined();
      expect(typeof status.report).toBe("function");
    });

    it("forwards report calls to element textContent", () => {
      const mockUI = new UpdatableUI();
      const element = document.createElement("div");

      const status = statusUI(mockUI, element);
      status.report("test status");

      expect(element.textContent).toBe(toJSONOrString("test status"));
    });

    it("handles undefined status", () => {
      const mockUI = new UpdatableUI();
      const element = document.createElement("div");

      const status = statusUI(mockUI, element);
      status.report();

      expect(element.textContent).toBe("");
    });

    it("clears element textContent on destroy", () => {
      const mockUI = new UpdatableUI();
      const element = document.createElement("div");
      element.textContent = "Initial";

      statusUI(mockUI, element);
      mockUI.destroy();

      expect(element.textContent).toBe("");
    });

    it("handles multiple status updates", () => {
      const mockUI = new UpdatableUI();
      const element = document.createElement("div");

      const status = statusUI(mockUI, element);

      status.report("status 1");
      expect(element.textContent).toBe(toJSONOrString("status 1"));

      status.report("status 2");
      expect(element.textContent).toBe(toJSONOrString("status 2"));

      status.report();
      expect(element.textContent).toBe("");
    });

    it("handles object status", () => {
      const mockUI = new UpdatableUI();
      const element = document.createElement("div");

      const status = statusUI(mockUI, element);
      status.report({ key: "value" });

      expect(element.textContent).toBe(toJSONOrString({ key: "value" }));
    });

    it("shows the message of an error", () => {
      const element = document.createElement("div");

      statusUI(new UpdatableUI(), element).report(new Error("Malformed data"));

      expect(element.textContent).toBe("Malformed data");
    });

    it("shows the message of a JSON syntax error", () => {
      const element = document.createElement("div");
      let error: unknown = null;
      try {
        JSON.parse("{");
      } catch (caught) {
        error = caught;
      }
      if (!(error instanceof SyntaxError)) {
        throw new Error("JSON.parse did not throw a SyntaxError");
      }

      statusUI(new UpdatableUI(), element).report(error);

      expect(element.textContent).toBe(error.message);
    });

    it("shows the message of an error of either window in a pop-out window", () => {
      // A pop-out window is another realm with its own `Error`, so an error of
      // its clipboard is not an `Error` of this window, and the other way round.
      const PopoutError = runInNewContext("Error") as ErrorConstructor,
        popoutError = new PopoutError("Document is not focused."),
        element = document.createElement("div");
      Object.defineProperty(element, "ownerDocument", {
        value: { defaultView: { Error: PopoutError } },
      });
      const status = statusUI(new UpdatableUI(), element);

      status.report(popoutError);
      expect(popoutError).not.toBeInstanceOf(Error);
      expect(element.textContent).toBe("Document is not focused.");

      status.report(new Error("Malformed data"));
      expect(element.textContent).toBe("Malformed data");
    });

    it("shows the message of an error of any kind", () => {
      class ImportError extends Error {
        public override readonly name = "ImportError";
      }
      const element = document.createElement("div"),
        status = statusUI(new UpdatableUI(), element);

      for (const error of [
        new TypeError("Failed to fetch"),
        new ImportError("Malformed data"),
        new DOMException("Document is not focused.", "NotAllowedError"),
        new AggregateError([new Error("inner")], "Several errors"),
      ]) {
        status.report(error);
        expect(element.textContent).toBe(error.message);
      }
    });

    it("shows an empty line for an error without a message and clears it", () => {
      const element = document.createElement("div"),
        status = statusUI(new UpdatableUI(), element);

      status.report(new Error("Malformed data"));
      status.report(new Error());
      expect(element.textContent).toBe("");

      status.report(new Error("Malformed data"));
      status.report();
      expect(element.textContent).toBe("");
    });

    it("shows a status that only looks like an error as JSON", () => {
      const element = document.createElement("div"),
        status = statusUI(new UpdatableUI(), element),
        lookalike = { message: "Malformed data", name: "Error" };

      status.report(lookalike);
      expect(element.textContent).toBe(toJSONOrString(lookalike));

      status.report("Malformed data");
      expect(element.textContent).toBe(toJSONOrString("Malformed data"));
    });

    it("shows the message of an error in an element without a window", () => {
      // A document without a window, such as one of a closed pop-out.
      const element = document.implementation
          .createHTMLDocument()
          .createElement("div"),
        warn = vi.spyOn(console, "warn").mockImplementation(noop);

      statusUI(new UpdatableUI(), element).report(new Error("Malformed data"));

      expect(element.textContent).toBe("Malformed data");
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("cleanFrontmatterCache", () => {
    it("returns empty frozen object when cache is undefined", () => {
      const result = cleanFrontmatterCache(undefined);

      expect(result).toEqual({});
      expect(Object.isFrozen(result)).toBe(true);
    });

    it("returns empty frozen object when cache is null", () => {
      const result = cleanFrontmatterCache(null as unknown as FrontMatterCache);

      expect(result).toEqual({});
      expect(Object.isFrozen(result)).toBe(true);
    });

    it("removes top-level 'position' key and preserves other properties", () => {
      const cache: FrontMatterCache = {
        position: { start: 1, end: 2 },
        title: "My Title",
        tags: ["a", "b"],
        nested: { position: 99, inner: { x: 1 } },
      };

      const cleaned = cleanFrontmatterCache(cache);

      expect(cleaned).not.toHaveProperty("position");
      expect(cleaned).toEqual({
        title: "My Title",
        tags: ["a", "b"],
        nested: { position: 99, inner: { x: 1 } },
      });

      expect(Object.isFrozen(cleaned)).toBe(true);
      expect(Object.isFrozen(cleaned["nested"])).toBe(true);
    });

    it("does not mutate the input and returns a cloned object", () => {
      const cache: FrontMatterCache = { position: { start: 0 }, name: "A" };
      const cleaned = cleanFrontmatterCache(cache);

      expect(cleaned).not.toBe(cache);

      // mutating original should not affect cleaned result
      cache.name = "B";
      expect(cleaned).toHaveProperty("name", "A");
    });

    it("preserves nested 'position' properties (only removes top-level)", () => {
      const cache: FrontMatterCache = {
        meta: { position: 3 },
        position: { start: 0 },
      };
      const cleaned = cleanFrontmatterCache(cache);

      expect(cleaned).toHaveProperty("meta.position", 3);
      expect(cleaned).not.toHaveProperty("position");
    });

    it("returns a deeply frozen object that resists mutation", () => {
      const cache: FrontMatterCache = { a: { b: 2 } };
      const cleaned = cleanFrontmatterCache(cache);

      expect(Object.isFrozen(cleaned)).toBe(true);
      expect(Object.isFrozen(cleaned["a"])).toBe(true);

      // deep equality ensures nested value unchanged
      expect(cleaned).toEqual({ a: { b: 2 } });
    });
  });

  describe("printError", () => {
    it("prints error with context", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const ob = await import("../../src/obsidian.js");
      const util = await import("../../src/utils.js");
      const notice2Spy = vi.spyOn(ob, "notice2").mockImplementation(
        () =>
          ({
            noticeEl: document.createElement("div"),
            setMessage: () => {},
            hide: () => {},
          }) as unknown as Notice,
      );
      const activeSelfSpy = vi
        .spyOn(util, "activeSelf")
        .mockImplementation(() => window);

      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        settings: { value: { errorNoticeTimeout: 0 } },
        language: {
          value: { t: vi.fn((k: string) => `translated-${k}`) },
          onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
          language: "en",
          onLoaded: Promise.resolve(),
        },
      } as unknown as PluginContext;

      const error = new Error("Test error");

      // correct argument order: (error, message, context)
      printError(error, () => "operation failed", mockContext);

      expect(consoleError).toHaveBeenCalled();

      notice2Spy.mockRestore();
      activeSelfSpy.mockRestore();
      consoleError.mockRestore();
    });

    it("handles string errors", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const ob = await import("../../src/obsidian.js");
      const util = await import("../../src/utils.js");
      const notice2Spy = vi.spyOn(ob, "notice2").mockImplementation(
        () =>
          ({
            noticeEl: document.createElement("div"),
            setMessage: () => {},
            hide: () => {},
          }) as unknown as Notice,
      );
      const activeSelfSpy = vi
        .spyOn(util, "activeSelf")
        .mockImplementation(() => window);

      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        settings: { value: { errorNoticeTimeout: 0 } },
        language: {
          value: { t: vi.fn((k: string) => `translated-${k}`) },
          onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
          language: "en",
          onLoaded: Promise.resolve(),
        },
      } as unknown as PluginContext;

      // @ts-expect-error intentionally passing a non-Error value
      printError("string error", () => "operation", mockContext);

      expect(consoleError).toHaveBeenCalled();

      notice2Spy.mockRestore();
      activeSelfSpy.mockRestore();
      consoleError.mockRestore();
    });

    it("handles unknown error types", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const ob = await import("../../src/obsidian.js");
      const util = await import("../../src/utils.js");
      const notice2Spy = vi.spyOn(ob, "notice2").mockImplementation(
        () =>
          ({
            noticeEl: document.createElement("div"),
            setMessage: () => {},
            hide: () => {},
          }) as unknown as Notice,
      );
      const activeSelfSpy = vi
        .spyOn(util, "activeSelf")
        .mockImplementation(() => window);

      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        settings: { value: { errorNoticeTimeout: 0 } },
        language: {
          value: { t: vi.fn((k: string) => `translated-${k}`) },
          onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
          language: "en",
          onLoaded: Promise.resolve(),
        },
      } as unknown as PluginContext;

      // @ts-expect-error intentionally passing unknown type as Error
      printError({ custom: "error" }, () => "operation", mockContext);

      expect(consoleError).toHaveBeenCalled();

      notice2Spy.mockRestore();
      activeSelfSpy.mockRestore();
      consoleError.mockRestore();
    });
  });

  describe("printMalformedData", () => {
    it("prints malformed data warning", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
        // Mock
      });

      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        language: {
          value: { t: vi.fn((k: string) => `translated-${k}`) },
          onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
          language: "en",
          onLoaded: Promise.resolve(),
        },
      } as unknown as PluginContext;

      printMalformedData(mockContext, { invalid: "data" }, { valid: "data" });

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("malformed-data"),
        { invalid: "data" },
        { valid: "data" },
      );

      consoleError.mockRestore();
    });

    it("handles undefined data values", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
        // Mock
      });

      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        language: {
          value: { t: vi.fn((k: string) => `translated-${k}`) },
          onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
          language: "en",
          onLoaded: Promise.resolve(),
        },
      } as unknown as PluginContext;

      printMalformedData(mockContext, undefined, { default: "config" });

      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("handles null data values", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
        // Mock
      });

      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        language: {
          value: { t: vi.fn((k: string) => `translated-${k}`) },
          onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
          language: "en",
          onLoaded: Promise.resolve(),
        },
      } as unknown as PluginContext;

      printMalformedData(mockContext, null, { default: "state" });

      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe("edge cases and type safety", () => {
    it("handles ResourceComponent with undefined return type", () => {
      class UndefinedResourceComponent extends ResourceComponent<undefined> {
        protected override load0(): undefined {
          return undefined;
        }
      }

      const component = new UndefinedResourceComponent();

      expect(() => {
        component.load();
      }).not.toThrow();
    });

    it("handles ResourceComponent with null return type", async () => {
      class NullResourceComponent extends ResourceComponent<null> {
        protected override load0(): null {
          return null;
        }
      }

      const component = new NullResourceComponent();
      component.load();
      await component.onLoaded;

      expect(component.value).toBeNull();
    });

    it("handles UpdatableUI with async configure", () => {
      const ui = new UpdatableUI();
      const configure = vi.fn(async () => {
        await Promise.resolve();
      });

      ui.new(
        () => ({}),
        () => {
          configure().catch(noop);
        },
        null,
      );

      expect(configure).toHaveBeenCalled();
    });

    it("handles LambdaComponent with async callbacks", async () => {
      let resolved = false;
      const onLoad = async (): Promise<void> => {
        await Promise.resolve();
        resolved = true;
      };

      const component = new LambdaComponent(() => {
        onLoad().catch(noop);
      });

      component.load();
      await new Promise((resolve) => window.setTimeout(resolve, 10));

      expect(resolved).toBe(true);
    });
  });

  describe("addRibbonIcon", () => {
    it("returns object with elementRef and reload function", async () => {
      const mockLeftRibbon = {
        addRibbonItemButton: vi.fn(() => document.createElement("div")),
        removeRibbonAction: vi.fn(),
      };

      const mockLanguage = {
        value: { t: vi.fn((k: string) => k) },
        onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
        onLoaded: Promise.resolve(),
      };

      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        app: { workspace: { leftRibbon: mockLeftRibbon } },
        language: mockLanguage,
        register: vi.fn(),
        addRibbonIcon: vi.fn(() => document.createElement("div")),
      } as unknown as PluginContext;

      const { addRibbonIcon: testFunc } = await import("../../src/obsidian.js");

      const result = testFunc(
        mockContext,
        "test-id",
        "icon-name",
        () => "Test Title",
        () => {},
      );

      expect(result).toBeDefined();
      expect(result).toHaveProperty("elementRef");
      expect(result).toHaveProperty("reload");
      expect(typeof result.reload).toBe("function");
      expect(result.elementRef).toBeInstanceOf(HTMLElement);
    });

    it("calls addRibbonItemButton with correct parameters", async () => {
      const mockElement = document.createElement("div");
      const mockLeftRibbon = {
        addRibbonItemButton: vi.fn(() => mockElement),
        removeRibbonAction: vi.fn(),
      };

      const mockLanguage = {
        value: { t: vi.fn((k: string) => k) },
        onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
        onLoaded: Promise.resolve(),
      };

      const addRibbonIconMock = vi.fn(() => mockElement);
      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        app: { workspace: { leftRibbon: mockLeftRibbon } },
        language: mockLanguage,
        register: vi.fn(),
        addRibbonIcon: addRibbonIconMock,
      } as unknown as PluginContext;

      const { addRibbonIcon: testFunc } = await import("../../src/obsidian.js");

      const callback = vi.fn();
      testFunc(mockContext, "test-id", "heart", () => "My Title", callback);

      // Verify either addRibbonItemButton or addRibbonIcon was called
      expect(
        mockLeftRibbon.addRibbonItemButton.mock.calls.length > 0 ||
          addRibbonIconMock.mock.calls.length > 0,
      ).toBe(true);
    });

    it("registers cleanup function", async () => {
      const mockLeftRibbon = {
        addRibbonItemButton: vi.fn(() => document.createElement("div")),
        removeRibbonAction: vi.fn(),
      };

      const mockLanguage = {
        value: { t: vi.fn((k: string) => k) },
        onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
        onLoaded: Promise.resolve(),
      };

      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        app: { workspace: { leftRibbon: mockLeftRibbon } },
        language: mockLanguage,
        register: vi.fn(),
        addRibbonIcon: vi.fn(() => document.createElement("div")),
      } as unknown as PluginContext;

      const { addRibbonIcon: testFunc } = await import("../../src/obsidian.js");

      testFunc(
        mockContext,
        "test-id",
        "icon",
        () => "Title",
        () => {},
      );

      // Verify register was called (for cleanup and language listener)
      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(mockContext.register).toHaveBeenCalled();
    });

    it("provides reload function that updates element", async () => {
      const mockElement = document.createElement("div");
      const mockLeftRibbon = {
        addRibbonItemButton: vi.fn(() => mockElement),
        removeRibbonAction: vi.fn(),
      };

      const mockLanguage = {
        value: { t: vi.fn((k: string) => k) },
        onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
        onLoaded: Promise.resolve(),
      };

      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        app: { workspace: { leftRibbon: mockLeftRibbon } },
        language: mockLanguage,
        register: vi.fn(),
        addRibbonIcon: vi.fn(() => mockElement),
      } as unknown as PluginContext;

      const { addRibbonIcon: testFunc } = await import("../../src/obsidian.js");

      const result = testFunc(
        mockContext,
        "test-id",
        "icon",
        () => "Title",
        () => {},
      );

      expect(typeof result.reload).toBe("function");
      expect(() => {
        result.reload();
      }).not.toThrow();
    });

    it("elementRef getter returns current element", async () => {
      const mockElement = document.createElement("div");
      mockElement.id = "test-element";

      const mockLeftRibbon = {
        addRibbonItemButton: vi.fn(() => mockElement),
        removeRibbonAction: vi.fn(),
      };

      const mockLanguage = {
        value: { t: vi.fn((k: string) => k) },
        onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
        onLoaded: Promise.resolve(),
      };

      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        app: { workspace: { leftRibbon: mockLeftRibbon } },
        language: mockLanguage,
        register: vi.fn(),
        addRibbonIcon: vi.fn(() => mockElement),
      } as unknown as PluginContext;

      const { addRibbonIcon: testFunc } = await import("../../src/obsidian.js");

      const result = testFunc(
        mockContext,
        "test-id",
        "icon",
        () => "Title",
        () => {},
      );

      expect(result.elementRef.id).toBe("test-element");
    });

    it("handles fallback path when revealPrivate returns undefined", async () => {
      const mockElement = document.createElement("div");
      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        app: { workspace: { leftRibbon: undefined } },
        language: {
          value: { t: vi.fn((k: string) => k) },
          onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
          onLoaded: Promise.resolve(),
        },
        register: vi.fn(),
        addRibbonIcon: vi.fn(() => mockElement),
      } as unknown as PluginContext;

      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { addRibbonIcon: testFunc } = await import("../../src/obsidian.js");

      const result = testFunc(
        mockContext,
        "test-id",
        "icon",
        () => "Title",
        () => {},
      );

      expect(result).toBeDefined();
      expect(result.elementRef).toBe(mockElement);
      expect(debugSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it("reload function is no-op in fallback path", async () => {
      const mockElement = document.createElement("div");
      const mockContext = {
        manifest: { id: "test-plugin", name: "Test Plugin" },
        app: { workspace: { leftRibbon: undefined } },
        language: {
          value: { t: vi.fn((k: string) => k) },
          onChangeLanguage: { listen: vi.fn(() => vi.fn()) },
          onLoaded: Promise.resolve(),
        },
        register: vi.fn(),
        addRibbonIcon: vi.fn(() => mockElement),
      } as unknown as PluginContext;

      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { addRibbonIcon: testFunc } = await import("../../src/obsidian.js");

      const result = testFunc(
        mockContext,
        "test-id",
        "icon",
        () => "Title",
        () => {},
      );

      // Reload should not throw even if it's a noop
      expect(() => {
        result.reload();
      }).not.toThrow();
      expect(debugSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
