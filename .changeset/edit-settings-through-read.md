---
"@polyipseity/obsidian-plugin-library": patch
---

The Edit button of All settings reads the edited or imported settings in through `read` of the settings manager, as Reload does. A plugin that reads settings by rules of its own, for example for a key that older settings lack, now gets the same result from Edit as from Reload and the Import commands. (by [@janah01](https://github.com/janah01))
