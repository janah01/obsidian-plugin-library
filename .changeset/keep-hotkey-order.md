---
"@polyipseity/obsidian-plugin-library": patch
---

`newHotkeyListener` no longer changes the order of the user's hotkeys in Obsidian's hotkey table when it bakes. A key that the user gave to two commands runs the same command as before the listener was made, and the hotkeys file keeps its order. (by [@janah01](https://github.com/janah01))
