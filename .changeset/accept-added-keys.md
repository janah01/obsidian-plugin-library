---
"@polyipseity/obsidian-plugin-library": patch
---

`markFixed` no longer marks a value as invalid when the fixer only added keys that the value lacked. Settings saved before a setting existed now load without a "Malformed data" error and without a recovery copy. A changed, retyped or dropped value is still invalid. Import in `EditDataModal` accepts such data and gives the missing keys their defaults. Its data field still applies only text that has every key, so deleting a block while typing changes nothing. (by [@janah01](https://github.com/janah01))
