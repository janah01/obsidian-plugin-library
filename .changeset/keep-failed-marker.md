---
"@polyipseity/obsidian-plugin-library": patch
---

`StorageSettingsManager.fix` keeps the `FAILED` symbol, so `StorageSettingsManager.hasFailed` is true for local settings that could not be read because the storage key was not found. A plugin fixer that spreads the value of `StorageSettingsManager.fix` keeps it too. It also stays true after the local settings change, for example when `SettingsManager` keeps a copy of malformed data in them. (by [@janah01](https://github.com/janah01))
