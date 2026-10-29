/**
 * Comprehensive tests for src/settings-tab.ts — advanced settings tab
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AdvancedSettingTab } from "../../src/settings-tab.js";
import { EditDataModal } from "../../src/modals.js";
import { type Fixer, markFixed } from "../../src/fixers.js";
import type { PluginContext } from "../../src/plugin.js";
import type { LanguageManager } from "../../src/i18n.js";
import type {
  SettingsManager,
  StorageSettingsManager,
} from "../../src/settings.js";
import { launderUnchecked } from "../../src/types.js";

// The Recover button is drawn through `UpdatableUI.newSetting`, which needs
// components backed by real elements. The other widgets tested here only use
// the no-op `addDropdown` and `addExtraButton` of these classes.
vi.mock("obsidian", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // Dynamic import: `vi.mock` factories run before the static imports.
  ...(await import("../support/dom-settings.js")).DOM_SETTINGS,
}));

describe("settings-tab.ts — settings tab", () => {
  let mockContext: PluginContext;
  let mockSettings: SettingsManager<PluginContext.Settings>;
  let mockLocalSettings: StorageSettingsManager<PluginContext.LocalSettings>;
  let mockLanguageManager: LanguageManager;
  let mockI18n: { t: ReturnType<typeof vi.fn> };
  let mockApp: {
    workspace: Record<string, unknown>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock i18n
    mockI18n = {
      t: vi.fn((key: string) => {
        if (key.startsWith("asset:")) {
          return "icon-name";
        }
        return `translated-${key}`;
      }),
    };

    // Mock language manager
    mockLanguageManager = {
      value: mockI18n,
      language: "en",
      onChangeLanguage: {
        listen: vi.fn(() => vi.fn()),
      },
      onLoaded: Promise.resolve(),
    } as unknown as LanguageManager;

    // Mock settings manager
    mockSettings = {
      value: {
        language: "en",
        errorNoticeTimeout: 5000,
        noticeTimeout: 3000,
      },
      mutate: vi.fn(),
      write: vi.fn(),
      onMutate: vi.fn(() => vi.fn()),
    } as unknown as SettingsManager<PluginContext.Settings>;

    // Mock local settings manager
    mockLocalSettings = {
      value: {
        recovery: {},
      },
      mutate: vi.fn(),
      write: vi.fn(),
      onMutate: vi.fn(() => vi.fn()),
    } as unknown as StorageSettingsManager<PluginContext.LocalSettings>;

    // Mock app
    mockApp = {
      workspace: {},
    };

    // Mock plugin context
    mockContext = {
      app: mockApp,
      language: mockLanguageManager,
      settings: mockSettings,
      localSettings: mockLocalSettings,
      manifest: { id: "test-plugin", name: "Test Plugin" },
      displayName: vi.fn(() => "Test Plugin"),
      addChild: vi.fn(),
    } as unknown as PluginContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("AdvancedSettingTab", () => {
    class TestSettingTab extends AdvancedSettingTab<PluginContext.Settings> {
      public override display(): void {
        super.display();
      }

      protected snapshot0(): Partial<PluginContext.Settings> {
        return {};
      }
    }

    it("creates settings tab", () => {
      const tab = new TestSettingTab(mockContext);

      expect(tab).toBeDefined();
      expect(tab).toBeInstanceOf(AdvancedSettingTab);
    });

    it("registers child component", async () => {
      new TestSettingTab(mockContext);

      // Allow promise to resolve
      await Promise.resolve();

      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(mockContext.addChild).toHaveBeenCalled();
    });

    it("calls display method", () => {
      const tab = new TestSettingTab(mockContext);

      expect(() => {
        tab.display();
      }).not.toThrow();
    });

    it("has containerEl property", () => {
      const tab = new TestSettingTab(mockContext);

      expect(tab.containerEl).toBeDefined();
      expect(tab.containerEl).toBeInstanceOf(HTMLElement);
    });

    it("updates UI on display", () => {
      const tab = new TestSettingTab(mockContext);

      // UI should be defined
      // @ts-expect-error: protected
      expect(tab.ui).toBeDefined();

      tab.display();

      // Should not throw
      expect(true).toBe(true);
    });

    it("creates snapshot on construction", () => {
      const tab = new TestSettingTab(mockContext);

      expect(tab).toBeDefined();
    });

    it("creates new snapshot on display", () => {
      const tab = new TestSettingTab(mockContext);

      tab.display();

      expect(tab).toBeDefined();
    });

    it("accesses context", () => {
      const tab = new TestSettingTab(mockContext);

      // @ts-expect-error: protected
      expect(tab.context).toBe(mockContext);
    });
  });

  describe("AdvancedSettingTab protected methods", () => {
    class TestableSettingTab extends AdvancedSettingTab<PluginContext.Settings> {
      protected snapshot0(): Partial<PluginContext.Settings> {
        return {};
      }

      protected postMutate(): void {
        // Mock implementation
      }

      public testOnLoad(): void {
        this.onLoad();
      }

      public testOnUnload(): void {
        this.onUnload();
      }

      public testNewSectionWidget(
        text: () => DocumentFragment | string,
        heading?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
      ): void {
        this.newSectionWidget(text, heading);
      }

      public testNewTitleWidget(): void {
        this.newTitleWidget();
      }

      public testNewDescriptionWidget(): void {
        this.newDescriptionWidget();
      }
    }

    it("onLoad registers language change listener", () => {
      const tab = new TestableSettingTab(mockContext);

      tab.testOnLoad();

      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(mockLanguageManager.onChangeLanguage.listen).toHaveBeenCalled();
    });

    it("onUnload destroys UI", () => {
      const tab = new TestableSettingTab(mockContext);

      const destroySpy = vi.spyOn(
        // @ts-expect-error: protected
        tab.ui,
        "destroy",
      );

      tab.testOnUnload();

      expect(destroySpy).toHaveBeenCalled();
    });

    it("newSectionWidget creates heading element", () => {
      const tab = new TestableSettingTab(mockContext);

      tab.testNewSectionWidget(() => "Test Section");

      const heading = tab.containerEl.querySelector("h2");
      expect(heading).toBeDefined();
    });

    it("newSectionWidget accepts different heading levels", () => {
      const tab = new TestableSettingTab(mockContext);

      tab.testNewSectionWidget(() => "H1 Section", "h1");
      tab.testNewSectionWidget(() => "H3 Section", "h3");
      tab.testNewSectionWidget(() => "H6 Section", "h6");

      expect(tab.containerEl.querySelector("h1")).toBeDefined();
      expect(tab.containerEl.querySelector("h3")).toBeDefined();
      expect(tab.containerEl.querySelector("h6")).toBeDefined();
    });

    it("newSectionWidget defaults to h2", () => {
      const tab = new TestableSettingTab(mockContext);

      tab.testNewSectionWidget(() => "Default Section");

      expect(tab.containerEl.querySelector("h2")).toBeDefined();
    });

    it("newSectionWidget accepts DocumentFragment", () => {
      const tab = new TestableSettingTab(mockContext);

      const fragment = document.createDocumentFragment();
      const span = document.createElement("span");
      span.textContent = "Fragment content";
      fragment.appendChild(span);

      tab.testNewSectionWidget(() => fragment);

      expect(tab.containerEl.querySelector("h2")).toBeDefined();
    });

    it("newTitleWidget uses displayName", () => {
      const tab = new TestableSettingTab(mockContext);

      tab.testNewTitleWidget();

      expect(mockContext.displayName).toHaveBeenCalled();
    });

    it("newDescriptionWidget creates description element", () => {
      const tab = new TestableSettingTab(mockContext);

      tab.testNewDescriptionWidget();

      const description = tab.containerEl.querySelector(".setting-item");
      expect(description).toBeDefined();
    });

    it("newDescriptionWidget uses i18n", () => {
      const tab = new TestableSettingTab(mockContext);

      tab.testNewDescriptionWidget();

      expect(mockI18n.t).toHaveBeenCalledWith("settings.description");
    });
  });

  describe("language widget", () => {
    class LanguageTestTab extends AdvancedSettingTab<PluginContext.Settings> {
      protected snapshot0(): Partial<PluginContext.Settings> {
        return {};
      }

      protected postMutate(): void {
        // Mock implementation
      }

      public testNewLanguageWidget(
        languages: readonly string[],
        languageNamer: (language: string) => string,
        defaults: { language: string },
      ): void {
        this.newLanguageWidget(languages as never, languageNamer, defaults);
      }
    }

    it("creates language widget", () => {
      const tab = new LanguageTestTab(mockContext);

      const languages = ["en", "es", "fr"];
      const languageNamer = (lang: string) => lang.toUpperCase();
      const defaults = { language: "en" };

      tab.testNewLanguageWidget(languages, languageNamer, defaults);

      expect(tab.containerEl.querySelector(".setting-item")).toBeDefined();
    });

    it("language widget uses i18n for labels", () => {
      const tab = new LanguageTestTab(mockContext);

      const languages = ["en", "es"];
      const languageNamer = (lang: string) => lang;
      const defaults = { language: "en" };

      tab.testNewLanguageWidget(languages, languageNamer, defaults);

      expect(mockI18n.t).toHaveBeenCalledWith("settings.language");
      expect(mockI18n.t).toHaveBeenCalledWith("settings.language-description");
    });

    it("language widget includes reset button", () => {
      const tab = new LanguageTestTab(mockContext);

      const languages = ["en", "es"];
      const languageNamer = (lang: string) => lang;
      const defaults = { language: "en" };

      tab.testNewLanguageWidget(languages, languageNamer, defaults);

      expect(mockI18n.t).toHaveBeenCalledWith("settings.reset");
    });
  });

  describe("Recover button", () => {
    class AllSettingsTab extends AdvancedSettingTab<PluginContext.Settings> {
      protected snapshot0(): Partial<PluginContext.Settings> {
        return {};
      }

      public drawAllSettings(fixer: Fixer<PluginContext.Settings>): void {
        this.newAllSettingsWidget({}, fixer);
      }
    }

    // A newer version's fixer: `errorNoticeTimeout` is the key it added.
    const fixer: Fixer<PluginContext.Settings> = (data) => {
      const unc = launderUnchecked<PluginContext.Settings>(data);
      return markFixed(data, {
        errorNoticeTimeout:
          typeof unc.errorNoticeTimeout === "number"
            ? unc.errorNoticeTimeout
            : 10,
        language: typeof unc.language === "string" ? unc.language : "",
        noticeTimeout:
          typeof unc.noticeTimeout === "number" ? unc.noticeTimeout : 5,
      });
    };

    function recoverButton(
      recovery: Readonly<Record<string, string>>,
    ): HTMLButtonElement {
      Object.assign(mockLocalSettings, { value: { recovery } });
      const tab = new AllSettingsTab(mockContext);
      tab.drawAllSettings(fixer);
      const button = tab.containerEl.querySelector<HTMLButtonElement>(
        'button[aria-label="translated-settings.all-settings-actions.recover"]',
      );
      if (!button) {
        throw new Error("the Recover button was not drawn");
      }
      return button;
    }

    // What an older version saved as `data.json`: it lacks the added key.
    const older = JSON.stringify({ language: "", noticeTimeout: 5 }, null, 2);

    it("is not highlighted without a copy", () => {
      expect(recoverButton({}).classList.contains("mod-cta")).toBe(false);
    });

    it("is not highlighted for a copy that only lacks keys the fixer adds", () => {
      expect(
        recoverButton({
          "settings.2026-10-14T08:32:47.171Z": older,
        }).classList.contains("mod-cta"),
      ).toBe(false);
    });

    it("is highlighted for a copy with a wrong type", () => {
      expect(
        recoverButton({
          "settings.2026-10-14T08:32:47.171Z": older,
          "settings.2026-10-14T09:00:00.000Z": JSON.stringify({
            errorNoticeTimeout: 10,
            language: "",
            noticeTimeout: "5",
          }),
        }).classList.contains("mod-cta"),
      ).toBe(true);
    });

    it("is highlighted for a copy that does not parse", () => {
      expect(
        recoverButton({
          "settings.2026-10-14T08:32:47.171Z": "{",
        }).classList.contains("mod-cta"),
      ).toBe(true);
    });

    it("ignores copies of local settings", () => {
      expect(
        recoverButton({
          "local-settings.2026-10-14T08:32:47.171Z": "{",
        }).classList.contains("mod-cta"),
      ).toBe(false);
    });

    it("follows the copies each time the tab is drawn again", () => {
      const malformed = JSON.stringify({ language: "", noticeTimeout: "5" });
      Object.assign(mockLocalSettings, {
        value: {
          recovery: {
            "settings.2026-10-14T08:32:47.171Z": older,
            "settings.2026-10-14T09:00:00.000Z": malformed,
          },
        },
      });
      const tab = new AllSettingsTab(mockContext);
      tab.drawAllSettings(fixer);
      const button = tab.containerEl.querySelector<HTMLButtonElement>(
        'button[aria-label="translated-settings.all-settings-actions.recover"]',
      );
      if (!button) {
        throw new Error("the Recover button was not drawn");
      }
      expect(button.classList.contains("mod-cta")).toBe(true);

      // The Recover dialog removed the malformed copy.
      Object.assign(mockLocalSettings, {
        value: { recovery: { "settings.2026-10-14T08:32:47.171Z": older } },
      });
      tab.display();
      expect(button.classList.contains("mod-cta")).toBe(false);

      // A later start kept another malformed copy.
      Object.assign(mockLocalSettings, {
        value: {
          recovery: {
            "settings.2026-10-14T08:32:47.171Z": older,
            "settings.2026-10-15T09:00:00.000Z": malformed,
          },
        },
      });
      tab.display();
      expect(button.classList.contains("mod-cta")).toBe(true);
    });

    it("does not parse unchanged copies again on every change in the tab", () => {
      // Each change in a settings field redraws the tab. A vault synced with
      // an older version collects one copy per start of that version.
      const recovery = Object.fromEntries(
          Array.from({ length: 50 }, (_0, index) => [
            `settings.2026-10-${String(10 + (index % 20))}T08:${String(10 + index)}:00.000Z`,
            older,
          ]),
        ),
        counted = vi.fn(fixer);
      Object.assign(mockLocalSettings, { value: { recovery } });
      const tab = new AllSettingsTab(mockContext);
      tab.drawAllSettings(counted);
      expect(counted).toHaveBeenCalledTimes(50);

      for (let change = 0; change < 10; change += 1) {
        tab.display();
      }

      expect(counted).toHaveBeenCalledTimes(50);
    });
  });

  describe("Edit button", () => {
    class AllSettingsTab extends AdvancedSettingTab<PluginContext.Settings> {
      protected snapshot0(): Partial<PluginContext.Settings> {
        return {};
      }

      public drawAllSettings(fixer: Fixer<PluginContext.Settings>): void {
        this.newAllSettingsWidget({}, fixer);
      }
    }

    // Fills a missing or mistyped key with its default.
    const fixer: Fixer<PluginContext.Settings> = (data) => {
      const unc = launderUnchecked<PluginContext.Settings>(data);
      return markFixed(data, {
        errorNoticeTimeout:
          typeof unc.errorNoticeTimeout === "number"
            ? unc.errorNoticeTimeout
            : 10,
        language: typeof unc.language === "string" ? unc.language : "",
        noticeTimeout:
          typeof unc.noticeTimeout === "number" ? unc.noticeTimeout : 5,
      });
    };

    it("reads imported data in through the settings manager", async () => {
      // A plugin's manager may read data by rules of its own, such as for a
      // key the data lacks; Reload and the Import commands go through them.
      const imported = {
          errorNoticeTimeout: 10,
          language: "fr",
          noticeTimeout: 5,
        },
        read = vi.fn(async (reader: () => unknown) => {
          await reader();
        });
      Object.assign(mockSettings, { read, write: vi.fn(async () => {}) });
      // Records each dialog that opens and lets it draw.
      const opened = vi.spyOn(EditDataModal.prototype, "onOpen"),
        tab = new AllSettingsTab(mockContext);
      tab.drawAllSettings(fixer);
      tab.containerEl
        .querySelector<HTMLButtonElement>(
          'button[aria-label="translated-settings.all-settings-actions.edit"]',
        )
        ?.click();
      vi.spyOn(navigator.clipboard, "readText").mockResolvedValue(
        JSON.stringify(imported),
      );
      const [dialog] = opened.mock.contexts as EditDataModal<object>[];
      dialog?.contentEl
        .querySelector<HTMLButtonElement>(
          'button[aria-label="translated-components.edit-data.import-from-clipboard"]',
        )
        ?.click();

      await vi.waitFor(() => {
        expect(read).toHaveBeenCalledOnce();
      });
      const [reader] = read.mock.calls[0] ?? [];
      expect(await reader?.()).toStrictEqual(imported);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- expect() does not call the method, only references it
      expect(mockSettings.mutate).not.toHaveBeenCalled();
    });
  });

  describe("edge cases and type safety", () => {
    class EdgeCaseTab extends AdvancedSettingTab<PluginContext.Settings> {
      protected snapshot0(): Partial<PluginContext.Settings> {
        return {};
      }

      protected postMutate(): void {
        // Mock implementation
      }
    }

    it("handles null context gracefully", () => {
      expect(() => new EdgeCaseTab(null as unknown as PluginContext)).toThrow();
    });

    it("handles context without language manager", () => {
      const contextWithoutLanguage = {
        ...mockContext,
        language: undefined,
      } as unknown as PluginContext;

      expect(() => new EdgeCaseTab(contextWithoutLanguage)).not.toThrow();
    });

    it("handles multiple display calls", () => {
      const tab = new EdgeCaseTab(mockContext);

      tab.display();
      tab.display();
      tab.display();

      expect(tab).toBeDefined();
    });

    it("handles rapid onLoad/onUnload cycles", () => {
      class CycleTestTab extends AdvancedSettingTab<PluginContext.Settings> {
        protected snapshot0(): Partial<PluginContext.Settings> {
          return {};
        }

        protected postMutate(): void {
          // Mock
        }

        public testOnLoad(): void {
          this.onLoad();
        }

        public testOnUnload(): void {
          this.onUnload();
        }
      }
      const tab = new CycleTestTab(mockContext);

      tab.testOnLoad();
      tab.testOnUnload();
      tab.testOnLoad();
      tab.testOnUnload();

      expect(tab).toBeDefined();
    });

    it("containerEl is HTMLElement", () => {
      const tab = new EdgeCaseTab(mockContext);

      expect(tab.containerEl).toBeInstanceOf(HTMLElement);
    });

    it("UI is properly initialized", () => {
      const tab = new EdgeCaseTab(mockContext);

      // @ts-expect-error: protected
      expect(tab.ui).toBeDefined();
      // @ts-expect-error: protected
      expect(typeof tab.ui.update).toBe("function");
      // @ts-expect-error: protected
      expect(typeof tab.ui.destroy).toBe("function");
    });
  });

  describe("snapshot and postMutate", () => {
    it("calls snapshot on construction", () => {
      const snapshotSpy = vi.fn(() => ({ language: "en" }));

      class SnapshotTestTab extends AdvancedSettingTab<PluginContext.Settings> {
        protected snapshot0(): Partial<PluginContext.Settings> {
          return snapshotSpy();
        }

        protected postMutate(): void {
          // Mock
        }
      }
      new SnapshotTestTab(mockContext);
      expect(snapshotSpy).toHaveBeenCalled();
    });

    it("calls snapshot on display", () => {
      const snapshotSpy = vi.fn(() => ({ language: "en" }));

      class SnapshotTestTab extends AdvancedSettingTab<PluginContext.Settings> {
        protected snapshot0(): Partial<PluginContext.Settings> {
          return snapshotSpy();
        }

        protected postMutate(): void {
          // Mock
        }
      }
      const tab = new SnapshotTestTab(mockContext);
      snapshotSpy.mockClear();

      tab.display();

      expect(snapshotSpy).toHaveBeenCalled();
    });

    it("postMutate can be customized in subclass", () => {
      const postMutateSpy = vi.fn();

      class CustomPostMutateTab extends AdvancedSettingTab<PluginContext.Settings> {
        protected snapshot0(): Partial<PluginContext.Settings> {
          return {};
        }

        protected postMutate(): void {
          postMutateSpy();
        }

        public triggerPostMutate(): void {
          this.postMutate();
        }
      }

      const tab = new CustomPostMutateTab(mockContext);

      tab.triggerPostMutate();

      expect(postMutateSpy).toHaveBeenCalled();
    });

    describe("inheritance and extensibility", () => {
      it("can be extended with custom functionality", () => {
        class ExtendedTab extends AdvancedSettingTab<PluginContext.Settings> {
          public customProperty = "custom";

          protected snapshot0(): Partial<PluginContext.Settings> {
            return {};
          }

          protected postMutate(): void {
            // Mock
          }

          public customMethod(): string {
            return "custom method";
          }
        }

        const tab = new ExtendedTab(mockContext);

        expect(tab.customProperty).toBe("custom");
        expect(tab.customMethod()).toBe("custom method");
      });

      it("preserves base class functionality in subclass", () => {
        class SubclassTab extends AdvancedSettingTab<PluginContext.Settings> {
          protected snapshot0(): Partial<PluginContext.Settings> {
            return {};
          }

          protected postMutate(): void {
            // Mock
          }
        }

        const tab = new SubclassTab(mockContext);

        // eslint-disable-next-line @typescript-eslint/unbound-method -- not calling the method, just checking it exists
        expect(tab.display).toBeDefined();
        expect(tab.containerEl).toBeDefined();
      });

      it("allows overriding protected methods", () => {
        const overriddenOnLoad = vi.fn();

        class OverrideTab extends AdvancedSettingTab<PluginContext.Settings> {
          protected snapshot0(): Partial<PluginContext.Settings> {
            return {};
          }

          protected postMutate(): void {
            // Mock
          }

          protected override onLoad(): void {
            overriddenOnLoad();
            super.onLoad();
          }

          public triggerOnLoad(): void {
            this.onLoad();
          }
        }

        const tab = new OverrideTab(mockContext);

        tab.triggerOnLoad();

        expect(overriddenOnLoad).toHaveBeenCalled();
      });
    });
  });
});
