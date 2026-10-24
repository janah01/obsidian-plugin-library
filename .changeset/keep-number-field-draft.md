---
"@polyipseity/obsidian-plugin-library": patch
---

`linkSetting` no longer stores or overwrites an unfinished number in a focused number field. While the field reports bad input, such as `14.` or `1e`, a change typed into it stores nothing and the text stays. While its text already stands for the stored number, such as `0400` for 400, the value is not written back. In every other case `linkSetting` still sets the value on each call, so the field shows the stored value again at the first refresh after it loses focus. (by [@janah01](https://github.com/janah01))
