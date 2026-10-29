/**
 * tests/support/dom-settings.ts
 *
 * `Setting` and the components it adds, backed by real elements, for tests
 * that draw settings through `UpdatableUI.newSetting`. The shared mock's
 * `Setting` takes a button list instead of a container and its components
 * have no elements. As in Obsidian, `setValue` writes the element without
 * firing events, `onChange` listens to `input` and `onClick` to `click`.
 * `addDropdown` draws nothing, so a setting with a dropdown cannot refresh.
 *
 * Use it in a spec file's own mock (the dynamic import is required because
 * `vi.mock` factories are hoisted above static imports):
 *
 * ```ts
 * vi.mock("obsidian", async (importOriginal) => ({
 *   ...(await importOriginal<object>()),
 *   ...(await import("../support/dom-settings.js")).DOM_SETTINGS,
 * }));
 * ```
 */

export class ValueComponent {
  public setDisabled(): this {
    return this;
  }
}

export class AbstractTextComponent<
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

export class ButtonComponent {
  public readonly buttonEl: HTMLButtonElement;
  #onClick: () => unknown = () => undefined;

  public constructor(containerEl: HTMLElement) {
    this.buttonEl = containerEl.appendChild(document.createElement("button"));
    this.buttonEl.addEventListener("click", () => this.#onClick());
  }

  public setCta(): this {
    this.buttonEl.classList.add("mod-cta");
    return this;
  }

  public removeCta(): this {
    this.buttonEl.classList.remove("mod-cta");
    return this;
  }

  public setDisabled(disabled: boolean): this {
    this.buttonEl.disabled = disabled;
    return this;
  }

  public setIcon(): this {
    return this;
  }

  public setTooltip(tooltip: string): this {
    this.buttonEl.setAttribute("aria-label", tooltip);
    return this;
  }

  public onClick(callback: () => unknown): this {
    this.#onClick = callback;
    return this;
  }
}

export class Setting {
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

  public addButton(cb: (component: ButtonComponent) => unknown): this {
    cb(new ButtonComponent(this.settingEl));
    return this;
  }

  public addTextArea(
    cb: (component: AbstractTextComponent<HTMLTextAreaElement>) => unknown,
  ): this {
    const el = this.settingEl.appendChild(document.createElement("textarea"));
    cb(new AbstractTextComponent(el));
    return this;
  }

  public addDropdown(): this {
    return this;
  }

  public addExtraButton(cb: (component: ButtonComponent) => unknown): this {
    cb(new ButtonComponent(this.settingEl));
    return this;
  }
}

export const DOM_SETTINGS = Object.freeze({
  AbstractTextComponent,
  ButtonComponent,
  Setting,
  ValueComponent,
});
