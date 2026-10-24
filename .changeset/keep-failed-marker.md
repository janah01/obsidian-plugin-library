---
"@polyipseity/obsidian-plugin-library": patch
---

`StorageSettingsManager.fix` keeps the `FAILED` symbol, so `StorageSettingsManager.hasFailed` is true for local settings that could not be read because the storage key was not found. A plugin fixer that spreads the value of `StorageSettingsManager.fix` keeps it too. (by [@janah01](https://github.com/janah01))
