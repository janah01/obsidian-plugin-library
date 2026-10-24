/**
 * Comprehensive tests for src/settings-widgets.ts — settings widget utilities
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  closeSetting,
  linkSetting,
  composeSetters,
  setTextToEnum,
  setTextToNumber,
  resetButton,
  dropdownSelect,
} from "../../src/settings-widgets.js";
import type {
  ValueComponent,
  ButtonComponent,
  DropdownComponent,
} from "obsidian";

describe("settings-widgets.ts — widget utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("closeSetting", () => {
    it("closes modal by clicking close button", () => {
      const closeButton = document.createElement("div");
      closeButton.className = "modal-close-button";
      closeButton.click = vi.fn();

      const modal = document.createElement("div");
      modal.className = "modal";
      modal.appendChild(closeButton);

      const container = document.createElement("div");
      modal.appendChild(container);

      document.body.appendChild(modal);

      closeSetting(container);

      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(closeButton.click).toHaveBeenCalled();

      document.body.removeChild(modal);
    });

    it("does nothing when no modal found", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      expect(() => {
        closeSetting(container);
      }).not.toThrow();

      document.body.removeChild(container);
    });

    it("does nothing when no close button found", () => {
      const modal = document.createElement("div");
      modal.className = "modal";

      const container = document.createElement("div");
      modal.appendChild(container);

      document.body.appendChild(modal);

      expect(() => {
        closeSetting(container);
      }).not.toThrow();

      document.body.removeChild(modal);
    });

    it("traverses up DOM tree to find modal", () => {
      const closeButton = document.createElement("div");
      closeButton.className = "modal-close-button";
      closeButton.click = vi.fn();

      const modal = document.createElement("div");
      modal.className = "modal";
      modal.appendChild(closeButton);

      const parent = document.createElement("div");
      const container = document.createElement("div");
      parent.appendChild(container);
      modal.appendChild(parent);

      document.body.appendChild(modal);

      closeSetting(container);

      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(closeButton.click).toHaveBeenCalled();

      document.body.removeChild(modal);
    });
  });

  describe("linkSetting", () => {
    type TestComponent = ValueComponent<string> & {
      readonly onChange: (
        callback: (value: string) => unknown,
      ) => TestComponent;
    };

    it("creates component configurator", () => {
      const getter = vi.fn(() => "initial");
      const setter = vi.fn();
      const callback = vi.fn();

      const configurator = linkSetting(getter, setter, callback);

      expect(configurator).toBeDefined();
      expect(typeof configurator).toBe("function");
    });

    it("sets initial value from getter", () => {
      const getter = vi.fn(() => "initial");
      const setter = vi.fn();
      const callback = vi.fn();

      const setValue = vi.fn().mockReturnThis();
      const onChange = vi.fn().mockReturnThis();

      const component = {
        setValue,
        onChange,
      } as unknown as TestComponent;

      const configurator = linkSetting(getter, setter, callback);
      configurator(component);

      expect(setValue).toHaveBeenCalledWith("initial");
      expect(onChange).toHaveBeenCalled();
    });

    it("calls setter and callback on change", async () => {
      const getter = vi.fn<() => string>(() => "initial");
      const setter = vi.fn<(value: string) => unknown>();
      const callback = vi.fn<() => unknown>();

      let changeHandler: ((value: string) => unknown) | undefined;
      const setValue = vi.fn().mockReturnThis();
      const onChange = vi.fn((handler: (value: string) => unknown) => {
        changeHandler = handler;
        return {} as TestComponent;
      });

      const component = {
        setValue,
        onChange,
      } as unknown as TestComponent;

      const configurator = linkSetting(getter, setter, callback);
      configurator(component);

      expect(changeHandler).toBeDefined();

      await changeHandler?.("new-value");

      expect(setter).toHaveBeenCalledWith("new-value", component, getter);
      expect(callback).toHaveBeenCalledWith("new-value", component, getter);
    });

    it("reverts value when setter returns false", async () => {
      const getter = vi.fn(() => "initial");
      const setter = vi.fn(() => false);
      const callback = vi.fn();

      let changeHandler: ((value: string) => unknown) | undefined;
      const setValue = vi.fn().mockReturnThis();
      const onChange = vi.fn((handler: (value: string) => unknown) => {
        changeHandler = handler;
        return {} as TestComponent;
      });

      const component = {
        setValue,
        onChange,
      } as unknown as TestComponent;

      const configurator = linkSetting(getter, setter, callback);
      configurator(component);

      await changeHandler?.("invalid");

      expect(setter).toHaveBeenCalledWith("invalid", component, getter);
      expect(setValue).toHaveBeenCalledWith("initial");
      expect(callback).not.toHaveBeenCalled();
    });

    it("calls pre action before setup", () => {
      const getter = vi.fn(() => "initial");
      const setter = vi.fn();
      const callback = vi.fn();
      const pre = vi.fn();

      const setValue = vi.fn().mockReturnThis();
      const onChange = vi.fn().mockReturnThis();

      const component = {
        setValue,
        onChange,
      } as unknown as TestComponent;

      const configurator = linkSetting(getter, setter, callback, { pre });
      configurator(component);

      expect(pre).toHaveBeenCalledWith(component);
    });

    it("calls post action after setup", () => {
      const getter = vi.fn(() => "initial");
      const setter = vi.fn();
      const callback = vi.fn();
      const post = vi.fn();

      const setValue = vi.fn().mockReturnThis();
      const onChange = vi.fn().mockReturnThis();

      const component = {
        setValue,
        onChange,
      } as unknown as TestComponent;

      const configurator = linkSetting(getter, setter, callback, { post });
      configurator(component);

      expect(post).toHaveBeenCalledWith(component, expect.any(Function));
    });

    it("handles async setter", async () => {
      const getter = vi.fn(() => "initial");
      const setter = vi.fn(async () => {
        await Promise.resolve();
      });
      const callback = vi.fn();

      let changeHandler: ((value: string) => unknown) | undefined;
      const setValue = vi.fn().mockReturnThis();
      const onChange = vi.fn((handler: (value: string) => unknown) => {
        changeHandler = handler;
        return {} as TestComponent;
      });

      const component = {
        setValue,
        onChange,
      } as unknown as TestComponent;

      const configurator = linkSetting(getter, setter, callback);
      configurator(component);

      await changeHandler?.("new-value");

      expect(setter).toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
    });

    describe("a focused number field", () => {
      // An `<input type="number">` as Chromium reported it in Obsidian 1.14.4.
      // On macOS and Windows a text that is not a number yet, such as `14.`,
      // reads as "" with `validity.badInput`; on Ubuntu `14.` reads as "14".
      // Keys insert at the caret. Writing a different text moves the caret to
      // the end (macOS, Windows) or to the start (Ubuntu).
      const PLATFORMS = ["macOS/Windows", "Ubuntu"] as const;
      type Platform = (typeof PLATFORMS)[number];
      const FLOAT = /^-?(?:\d+|\d*\.\d+)(?:[eE][-+]?\d+)?$/u;

      function numberField(
        platform: Platform,
        initial: string,
        parent: HTMLElement = document.body,
      ) {
        const inputEl = parent.ownerDocument.createElement("input");
        inputEl.type = "number";
        parent.append(inputEl);
        let text = initial,
          caret = initial.length,
          handler: ((value: string) => unknown) | undefined;
        const reported = (): { readonly badInput: boolean; value: string } => {
          if (text === "" || FLOAT.test(text)) {
            return { badInput: false, value: text };
          }
          if (platform === "Ubuntu" && /^-?\d+\.$/u.test(text)) {
            return { badInput: false, value: text.slice(0, -1) };
          }
          return { badInput: true, value: "" };
        };
        Object.defineProperty(inputEl, "value", {
          configurable: true,
          get: () => reported().value,
          set: (value: string) => {
            if (value !== text) {
              text = value;
              caret = platform === "Ubuntu" ? 0 : value.length;
            }
          },
        });
        Object.defineProperty(inputEl, "validity", {
          configurable: true,
          get: () => ({ badInput: reported().badInput }),
        });
        const setValue = vi.fn((value: string) => {
            inputEl.value = value;
          }),
          component = {
            getValue: (): string => inputEl.value,
            inputEl,
            onChange(callback: (value: string) => unknown): unknown {
              handler = callback;
              return component;
            },
            setValue(value: string): unknown {
              setValue(value);
              return component;
            },
          } as unknown as TestComponent;
        return {
          component,
          inputEl,
          setValue,
          text: (): string => text,
          // Types `keys` one after the other; `replaceAll` selects the text first.
          async type(keys: string, replaceAll = false): Promise<void> {
            inputEl.focus();
            if (replaceAll) {
              text = "";
              caret = 0;
            }
            for (const key of keys) {
              text = `${text.slice(0, caret)}${key}${text.slice(caret)}`;
              caret += 1;
              // One key after the other, as a keyboard types them.
              await handler?.(inputEl.value);
            }
          },
        };
      }

      // Binds like `UpdatableUI.newSetting` refreshes: every accepted change
      // runs the binder again on the same component.
      function bindRefreshing(
        component: TestComponent,
        link: (refresh: () => void) => (component: TestComponent) => void,
      ): void {
        const bind = link(() => {
          bind(component);
        });
        bind(component);
      }

      // The Font size row of a plugin: empty unsets it, else a number.
      async function typeFontSize(
        platform: Platform,
        start: number | undefined,
        keys: string,
      ): Promise<{
        readonly stored: number | undefined;
        readonly text: string;
      }> {
        const data: { fontSize?: number } = {},
          field = numberField(platform, start?.toString() ?? "");
        if (start !== undefined) {
          data.fontSize = start;
        }
        bindRefreshing(field.component, (refresh) =>
          linkSetting(
            () => data.fontSize?.toString() ?? "",
            composeSetters<string, TestComponent>(
              (value) => {
                if (value) {
                  return false;
                }
                delete data.fontSize;
                return true;
              },
              setTextToNumber((value) => {
                data.fontSize = value;
              }),
            ),
            refresh,
          ),
        );
        await field.type(keys);
        return { stored: data.fontSize, text: field.text() };
      }

      // The Notice timeout row: a required number.
      async function typeTimeout(
        platform: Platform,
        start: number,
        keys: string,
        replaceAll = false,
      ): Promise<{ readonly stored: number; readonly text: string }> {
        const data = { timeout: start },
          field = numberField(platform, start.toString());
        bindRefreshing(field.component, (refresh) =>
          linkSetting(
            () => data.timeout.toString(),
            setTextToNumber<TestComponent>((value) => {
              data.timeout = value;
            }),
            refresh,
          ),
        );
        await field.type(keys, replaceAll);
        return { stored: data.timeout, text: field.text() };
      }

      afterEach(() => {
        document.body.replaceChildren();
      });

      describe.each(PLATFORMS)("on %s", (platform) => {
        it("stores 14.5 typed after a font size of 14", async () => {
          expect(await typeFontSize(platform, 14, ".5")).toEqual({
            stored: 14.5,
            text: "14.5",
          });
        });

        it("stores 5.5 typed after a timeout of 5", async () => {
          expect(await typeTimeout(platform, 5, ".5")).toEqual({
            stored: 5.5,
            text: "5.5",
          });
        });

        it("stores 5.05 typed after a timeout of 5", async () => {
          expect(await typeTimeout(platform, 5, ".05")).toEqual({
            stored: 5.05,
            text: "5.05",
          });
        });

        it("stores 1e3 as 1000 and keeps the text", async () => {
          expect(await typeTimeout(platform, 1, "e3")).toEqual({
            stored: 1000,
            text: "1e3",
          });
        });

        it("takes a minus sign typed over a selected number", async () => {
          expect(await typeTimeout(platform, 5, "-1", true)).toEqual({
            stored: -1,
            text: "-1",
          });
        });

        it("does not rewrite a draft that stands for the stored number", async () => {
          expect(await typeTimeout(platform, 0, "400")).toEqual({
            stored: 400,
            text: "0400",
          });
        });

        it("writes the stored number back over a rejected draft", async () => {
          const data = { count: 1 },
            field = numberField(platform, "1");
          bindRefreshing(field.component, (refresh) =>
            linkSetting(
              () => data.count.toString(),
              setTextToNumber<TestComponent>((value) => {
                data.count = value;
              }, true),
              refresh,
            ),
          );
          field.setValue.mockClear();

          await field.type(".5");

          expect(data.count).toBe(1);
          expect(field.setValue.mock.calls).toEqual([["1"]]);
          expect(field.text()).toBe("1");
        });

        it("stores 0 typed into an empty field without writing it back", async () => {
          expect(await typeFontSize(platform, undefined, "0")).toEqual({
            stored: 0,
            text: "0",
          });
        });
      });

      it("stores nothing and writes nothing while the field reports bad input", async () => {
        const setter = vi.fn(() => true),
          callback = vi.fn(),
          field = numberField("macOS/Windows", "14");
        linkSetting(() => "14", setter, callback)(field.component);
        field.setValue.mockClear();

        await field.type(".");

        expect(field.inputEl.validity.badInput).toBe(true);
        expect(setter).not.toHaveBeenCalled();
        expect(callback).not.toHaveBeenCalled();
        expect(field.setValue).not.toHaveBeenCalled();
        expect(field.text()).toBe("14.");
      });

      it("still stores a value that post activates while the field shows a bad draft", async () => {
        const data = { size: 14 },
          field = numberField("macOS/Windows", "14");
        let activate: ((value: string) => PromiseLike<void>) | undefined;
        linkSetting(
          () => data.size.toString(),
          setTextToNumber<TestComponent>((value) => {
            data.size = value;
          }),
          vi.fn(),
          {
            post(_component, activate0) {
              activate = activate0;
            },
          },
        )(field.component);
        await field.type(".");

        await activate?.("20");

        expect(field.inputEl.validity.badInput).toBe(true);
        expect(data.size).toBe(20);
      });

      it("keeps a draft that is not a number yet when the field refreshes", async () => {
        const data = { size: 14 },
          field = numberField("macOS/Windows", "14"),
          bind = linkSetting(
            () => data.size.toString(),
            setTextToNumber<TestComponent>((value) => {
              data.size = value;
            }),
            vi.fn(),
          );
        bind(field.component);
        await field.type(".");
        field.setValue.mockClear();
        data.size = 20;

        bind(field.component);

        expect(field.setValue).not.toHaveBeenCalled();
        expect(field.text()).toBe("14.");
      });

      it("writes a different number stored elsewhere into the focused field", () => {
        const data = { size: 14 },
          field = numberField("Ubuntu", "14"),
          bind = linkSetting(() => data.size.toString(), vi.fn(), vi.fn());
        field.inputEl.focus();
        bind(field.component);
        field.setValue.mockClear();
        data.size = 20;

        bind(field.component);

        expect(field.setValue.mock.calls).toEqual([["20"]]);
        expect(field.text()).toBe("20");
      });

      it("writes the first draw before post makes the field a number field", () => {
        const field = numberField("macOS/Windows", "0400");
        field.inputEl.type = "text";
        field.inputEl.focus();

        linkSetting(() => "400", vi.fn(), vi.fn(), {
          post() {
            field.inputEl.type = "number";
          },
        })(field.component);

        expect(field.setValue.mock.calls).toEqual([["400"]]);
        expect(field.inputEl.type).toBe("number");
        expect(field.text()).toBe("400");
      });

      it("skips the write on a refresh once post made it a number field", async () => {
        const data = { timeout: 0 },
          field = numberField("macOS/Windows", "0");
        field.inputEl.type = "text";
        bindRefreshing(field.component, (refresh) =>
          linkSetting(
            () => data.timeout.toString(),
            setTextToNumber<TestComponent>((value) => {
              data.timeout = value;
            }),
            refresh,
            {
              post() {
                field.inputEl.type = "number";
              },
            },
          ),
        );
        field.setValue.mockClear();

        await field.type("400");

        expect(data.timeout).toBe(400);
        expect(field.setValue).not.toHaveBeenCalled();
        expect(field.text()).toBe("0400");
      });

      it("writes the stored number into an unfocused field with a draft", () => {
        const field = numberField("macOS/Windows", "14.");

        linkSetting(() => "14", vi.fn(), vi.fn())(field.component);

        expect(field.setValue.mock.calls).toEqual([["14"]]);
        expect(field.text()).toBe("14");
      });

      it("writes the stored value back into a focused text field on reject", async () => {
        const inputEl = document.body.appendChild(
            document.createElement("input"),
          ),
          setValue = vi.fn((value: string) => {
            inputEl.value = value;
          });
        let handler: ((value: string) => unknown) | undefined;
        const component = {
          inputEl,
          onChange(callback: (value: string) => unknown): unknown {
            handler = callback;
            return component;
          },
          setValue(value: string): unknown {
            setValue(value);
            return component;
          },
        } as unknown as TestComponent;
        linkSetting(
          () => "400",
          vi.fn(() => false),
          vi.fn(),
        )(component);
        inputEl.focus();
        inputEl.value = "0400";
        setValue.mockClear();

        await handler?.(inputEl.value);

        expect(setValue.mock.calls).toEqual([["400"]]);
        expect(inputEl.value).toBe("400");
      });

      it("skips the write into a number field focused in another document", () => {
        const frame = document.body.appendChild(
            document.createElement("iframe"),
          ),
          { contentDocument } = frame;
        if (!contentDocument) throw new Error("iframe has no document");
        const field = numberField(
          "macOS/Windows",
          "0400",
          contentDocument.body,
        );
        field.inputEl.focus();

        linkSetting(() => "400", vi.fn(), vi.fn())(field.component);

        // As in a pop-out window, the global document does not see this focus.
        expect(contentDocument.activeElement).toBe(field.inputEl);
        expect(document.activeElement).not.toBe(field.inputEl);
        expect(field.setValue).not.toHaveBeenCalled();
        expect(field.text()).toBe("0400");
      });
    });
  });

  describe("composeSetters", () => {
    type TestComponent = ValueComponent<string>;

    it("composes multiple setters", async () => {
      const setter1 = vi.fn(() => true);
      const setter2 = vi.fn(() => true);

      const composed = composeSetters<string, TestComponent>(setter1, setter2);

      const component = {} as TestComponent;
      const getter = () => "value";

      const result = await composed("new", component, getter);

      expect(result).toBe(true);
      expect(setter1).toHaveBeenCalledWith("new", component, getter);
      expect(setter2).not.toHaveBeenCalled(); // Short-circuits on first true
    });

    it("returns false when all setters return false", async () => {
      const setter1 = vi.fn(() => false);
      const setter2 = vi.fn(() => false);

      const composed = composeSetters<string, TestComponent>(setter1, setter2);

      const component = {} as TestComponent;
      const getter = () => "value";

      const result = await composed("new", component, getter);

      expect(result).toBe(false);
      expect(setter1).toHaveBeenCalled();
      expect(setter2).toHaveBeenCalled();
    });

    it("stops at first truthy setter", async () => {
      const setter1 = vi.fn(() => false);
      const setter2 = vi.fn(() => true);
      const setter3 = vi.fn(() => true);

      const composed = composeSetters<string, TestComponent>(
        setter1,
        setter2,
        setter3,
      );

      const component = {} as TestComponent;
      const getter = () => "value";

      const result = await composed("new", component, getter);

      expect(result).toBe(true);
      expect(setter1).toHaveBeenCalled();
      expect(setter2).toHaveBeenCalled();
      expect(setter3).not.toHaveBeenCalled();
    });

    it("handles empty setters array", async () => {
      const composed = composeSetters<string, TestComponent>();

      const component = {} as TestComponent;
      const getter = () => "value";

      const result = await composed("new", component, getter);

      expect(result).toBe(false);
    });
  });

  describe("setTextToEnum", () => {
    type TestComponent = ValueComponent<string>;

    it("validates value is in enum", async () => {
      const enums = ["option1", "option2", "option3"] as const;
      const setter =
        vi.fn<
          (
            value: string,
            component: TestComponent,
            getter: () => string,
          ) => unknown
        >();

      const validator = setTextToEnum(enums, setter);

      const component = {} as TestComponent;
      const getter = () => "option1";

      const result = await validator("option1", component, getter);

      expect(result).toBe(true);
      expect(setter).toHaveBeenCalledWith("option1", component, getter);
    });

    it("rejects value not in enum", async () => {
      const enums = ["option1", "option2", "option3"] as const;
      const setter =
        vi.fn<
          (
            value: string,
            component: TestComponent,
            getter: () => string,
          ) => unknown
        >();

      const validator = setTextToEnum(enums, setter);

      const component = {} as TestComponent;
      const getter = () => "option1";

      const result = await validator("invalid", component, getter);

      expect(result).toBe(false);
      expect(setter).not.toHaveBeenCalled();
    });

    it("returns false when setter returns false", async () => {
      const enums = ["option1", "option2"] as const;
      const setter = vi.fn<
        (
          value: string,
          component: TestComponent,
          getter: () => string,
        ) => unknown
      >(() => false);

      const validator = setTextToEnum(enums, setter);

      const component = {} as TestComponent;
      const getter = () => "option1";

      const result = await validator("option1", component, getter);

      expect(result).toBe(false);
    });

    it("handles empty enum array", async () => {
      const enums = [] as const;
      const setter =
        vi.fn<
          (
            value: string,
            component: TestComponent,
            getter: () => string,
          ) => unknown
        >();

      const validator = setTextToEnum(enums, setter);

      const component = {} as TestComponent;
      const getter = () => "";

      const result = await validator("any", component, getter);

      expect(result).toBe(false);
    });
  });

  describe("setTextToNumber", () => {
    type TestComponent = ValueComponent<string>;

    it("converts valid number string", async () => {
      const setter = vi.fn();

      const converter = setTextToNumber(setter);

      const component = {} as TestComponent;
      const getter = () => "123";

      const result = await converter("123", component, getter);

      expect(result).toBe(true);
      expect(setter).toHaveBeenCalledWith(123, component, getter);
    });

    it("handles decimal numbers", async () => {
      const setter = vi.fn();

      const converter = setTextToNumber(setter);

      const component = {} as TestComponent;
      const getter = () => "123.45";

      const result = await converter("123.45", component, getter);

      expect(result).toBe(true);
      expect(setter).toHaveBeenCalledWith(123.45, component, getter);
    });

    it("rejects non-numeric strings", async () => {
      const setter = vi.fn();

      const converter = setTextToNumber(setter);

      const component = {} as TestComponent;
      const getter = () => "abc";

      const result = await converter("abc", component, getter);

      expect(result).toBe(false);
      expect(setter).not.toHaveBeenCalled();
    });

    it("handles integer mode", async () => {
      const setter = vi.fn();

      const converter = setTextToNumber(setter, true);

      const component = {} as TestComponent;
      const getter = () => "42";

      const result = await converter("42", component, getter);

      expect(result).toBe(true);
      expect(setter).toHaveBeenCalledWith(42, component, getter);
    });

    it("rejects decimals in integer mode", async () => {
      const setter = vi.fn();

      const converter = setTextToNumber(setter, true);

      const component = {} as TestComponent;
      const getter = () => "42.5";

      const result = await converter("42.5", component, getter);

      expect(result).toBe(false);
      expect(setter).not.toHaveBeenCalled();
    });

    it("handles + sign as 0", async () => {
      const setter = vi.fn();

      const converter = setTextToNumber(setter);

      const component = {} as TestComponent;
      const getter = () => "+";

      const result = await converter("+", component, getter);

      expect(result).toBe(true);
      expect(setter).toHaveBeenCalledWith(0, component, getter);
    });

    it("handles - sign as 0", async () => {
      const setter = vi.fn();

      const converter = setTextToNumber(setter);

      const component = {} as TestComponent;
      const getter = () => "-";

      const result = await converter("-", component, getter);

      expect(result).toBe(true);
      expect(setter).toHaveBeenCalledWith(0, component, getter);
    });

    it("rejects infinity", async () => {
      const setter = vi.fn();

      const converter = setTextToNumber(setter);

      const component = {} as TestComponent;
      const getter = () => "Infinity";

      const result = await converter("Infinity", component, getter);

      expect(result).toBe(false);
      expect(setter).not.toHaveBeenCalled();
    });

    it("returns false when setter returns false", async () => {
      const setter = vi.fn(() => false);

      const converter = setTextToNumber(setter);

      const component = {} as TestComponent;
      const getter = () => "123";

      const result = await converter("123", component, getter);

      expect(result).toBe(false);
    });
  });

  describe("resetButton", () => {
    type TestButtonComponent = ButtonComponent;

    it("creates reset button configurator", () => {
      const resetter = vi.fn();
      const callback = vi.fn();

      const configurator = resetButton(
        "reset-icon",
        "Reset",
        resetter,
        callback,
      );

      expect(configurator).toBeDefined();
      expect(typeof configurator).toBe("function");
    });

    it("configures button with icon and tooltip", () => {
      const resetter = vi.fn();
      const callback = vi.fn();

      const setIcon = vi.fn().mockReturnThis();
      const setTooltip = vi.fn().mockReturnThis();
      const onClick = vi.fn().mockReturnThis();

      const component = {
        setIcon,
        setTooltip,
        onClick,
      } as unknown as TestButtonComponent;

      const configurator = resetButton(
        "reset-icon",
        "Reset tooltip",
        resetter,
        callback,
      );
      configurator(component);

      expect(setIcon).toHaveBeenCalledWith("reset-icon");
      expect(setTooltip).toHaveBeenCalledWith("Reset tooltip");
      expect(onClick).toHaveBeenCalled();
    });

    it("calls resetter and callback on click", async () => {
      const resetter = vi.fn();
      const callback = vi.fn();

      let clickHandler: (() => unknown) | undefined;
      const setIcon = vi.fn().mockReturnThis();
      const setTooltip = vi.fn().mockReturnThis();
      const onClick = vi.fn((handler: () => unknown) => {
        clickHandler = handler;
        return {} as TestButtonComponent;
      });

      const component = {
        setIcon,
        setTooltip,
        onClick,
      } as unknown as TestButtonComponent;

      const configurator = resetButton("icon", "tooltip", resetter, callback);
      configurator(component);

      expect(clickHandler).toBeDefined();

      await clickHandler?.();

      expect(resetter).toHaveBeenCalledWith(component);
      expect(callback).toHaveBeenCalledWith(component);
    });

    it("skips callback when resetter returns false", async () => {
      const resetter = vi.fn(() => false);
      const callback = vi.fn();

      let clickHandler: (() => unknown) | undefined;
      const setIcon = vi.fn().mockReturnThis();
      const setTooltip = vi.fn().mockReturnThis();
      const onClick = vi.fn((handler: () => unknown) => {
        clickHandler = handler;
        return {} as TestButtonComponent;
      });

      const component = {
        setIcon,
        setTooltip,
        onClick,
      } as unknown as TestButtonComponent;

      const configurator = resetButton("icon", "tooltip", resetter, callback);
      configurator(component);

      await clickHandler?.();

      expect(resetter).toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it("calls pre action", () => {
      const resetter = vi.fn();
      const callback = vi.fn();
      const pre = vi.fn();

      const setIcon = vi.fn().mockReturnThis();
      const setTooltip = vi.fn().mockReturnThis();
      const onClick = vi.fn().mockReturnThis();

      const component = {
        setIcon,
        setTooltip,
        onClick,
      } as unknown as TestButtonComponent;

      const configurator = resetButton("icon", "tooltip", resetter, callback, {
        pre,
      });
      configurator(component);

      expect(pre).toHaveBeenCalledWith(component);
    });

    it("calls post action", () => {
      const resetter = vi.fn();
      const callback = vi.fn();
      const post = vi.fn();

      const setIcon = vi.fn().mockReturnThis();
      const setTooltip = vi.fn().mockReturnThis();
      const onClick = vi.fn().mockReturnThis();

      const component = {
        setIcon,
        setTooltip,
        onClick,
      } as unknown as TestButtonComponent;

      const configurator = resetButton("icon", "tooltip", resetter, callback, {
        post,
      });
      configurator(component);

      expect(post).toHaveBeenCalledWith(component, expect.any(Function));
    });
  });

  describe("dropdownSelect", () => {
    type TestDropdownComponent = DropdownComponent & {
      readonly addOption: (
        value: string,
        text: string,
      ) => TestDropdownComponent;
      readonly addOptions: (
        options: Record<string, string>,
      ) => TestDropdownComponent;
    };

    it("creates dropdown configurator", () => {
      const callback = vi.fn();
      const selections = [
        { name: "Option 1", value: "value1" },
        { name: "Option 2", value: "value2" },
      ];

      const configurator = dropdownSelect("Select...", selections, callback);

      expect(configurator).toBeDefined();
      expect(typeof configurator).toBe("function");
    });

    it("adds unselected option", () => {
      const callback = vi.fn();
      const selections = [{ name: "Option 1", value: "value1" }];

      const addOption = vi.fn().mockReturnThis();
      const addOptions = vi.fn().mockReturnThis();
      const setValue = vi.fn().mockReturnThis();
      const onChange = vi.fn().mockReturnThis();

      const component = {
        addOption,
        addOptions,
        setValue,
        onChange,
      } as unknown as TestDropdownComponent;

      const configurator = dropdownSelect("Select...", selections, callback);
      configurator(component);

      expect(addOption).toHaveBeenCalledWith(expect.any(String), "Select...");
    });

    it("adds selection options", () => {
      const callback = vi.fn();
      const selections = [
        { name: "Option 1", value: "value1" },
        { name: "Option 2", value: "value2" },
      ];

      const addOption = vi.fn().mockReturnThis();
      const addOptions = vi.fn().mockReturnThis();
      const setValue = vi.fn().mockReturnThis();
      const onChange = vi.fn().mockReturnThis();

      const component = {
        addOption,
        addOptions,
        setValue,
        onChange,
      } as unknown as TestDropdownComponent;

      const configurator = dropdownSelect("Select...", selections, callback);
      configurator(component);

      expect(addOptions).toHaveBeenCalledWith({
        "0": "Option 1",
        "1": "Option 2",
      });
    });

    it("calls callback with selected value", async () => {
      const callback = vi.fn();
      const selections = [
        { name: "Option 1", value: "value1" },
        { name: "Option 2", value: "value2" },
      ];

      let changeHandler: ((value: string) => unknown) | undefined;
      const addOption = vi.fn().mockReturnThis();
      const addOptions = vi.fn().mockReturnThis();
      const setValue = vi.fn().mockReturnThis();
      const onChange = vi.fn((handler: (value: string) => unknown) => {
        changeHandler = handler;
        return {} as TestDropdownComponent;
      });

      const component = {
        addOption,
        addOptions,
        setValue,
        onChange,
      } as unknown as TestDropdownComponent;

      const configurator = dropdownSelect("Select...", selections, callback);
      configurator(component);

      await changeHandler?.("0");

      expect(callback).toHaveBeenCalledWith("value1", component);
    });

    it("handles empty selections", () => {
      const callback = vi.fn();
      const selections: { name: string; value: string }[] = [];

      const addOption = vi.fn().mockReturnThis();
      const addOptions = vi.fn().mockReturnThis();
      const setValue = vi.fn().mockReturnThis();
      const onChange = vi.fn().mockReturnThis();

      const component = {
        addOption,
        addOptions,
        setValue,
        onChange,
      } as unknown as TestDropdownComponent;

      const configurator = dropdownSelect("Select...", selections, callback);
      configurator(component);

      expect(addOptions).toHaveBeenCalledWith({});
    });
  });

  describe("edge cases and type safety", () => {
    it("linkSetting handles null component gracefully", () => {
      const getter = vi.fn(() => "value");
      const setter = vi.fn();
      const callback = vi.fn();

      const configurator = linkSetting(getter, setter, callback);

      expect(() => {
        configurator(null);
      }).toThrow();
    });

    it("composeSetters handles undefined return values", async () => {
      const setter1 = vi.fn(() => undefined);
      const setter2 = vi.fn(() => true);

      const composed = composeSetters<string, ValueComponent<string>>(
        setter1,
        setter2,
      );

      const result = await composed(
        "value",
        {} as ValueComponent<string>,
        () => "",
      );

      expect(result).toBe(true);
    });

    it("setTextToNumber handles very large numbers", async () => {
      const setter = vi.fn();
      const converter = setTextToNumber(setter, true);

      const result = await converter("999999999999999999999", {}, () => "");

      expect(result).toBe(false); // Too large for safe integer
    });

    it("closeSetting handles detached elements", () => {
      const container = document.createElement("div");

      expect(() => {
        closeSetting(container);
      }).not.toThrow();
    });
  });
});
