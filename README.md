# Find and Replace in Selection

Adds a **Find in selection** toggle to Obsidian's built-in find and replace bar, so you can limit find, replace and replace all to the selected text.

## Usage

- Select some text and open find (`Cmd/Ctrl+F`) or replace (`Cmd/Ctrl+H`). For a multi-line selection, or several selections, the toggle turns on by itself. The selected area is highlighted.
- Click the toggle in the find bar to turn it on or off. It uses the current editor selection.
- Use the **Find and replace in selection** command (you can assign a hotkey) to open replace with the toggle on.

In settings you can choose when the toggle turns on by itself: never, for multi-line selections (the default), or for any selection.

Matching is literal and ignores case, the same as Obsidian's built-in search.

## Install with BRAT

1. Install [BRAT](https://tfthacker.com/BRAT) from Community plugins.
2. Run **BRAT: Add a beta plugin for testing** and enter this repository's URL.
3. Turn on **Find and Replace in Selection** in Community plugins.

## Release

Update `version` in `manifest.json` and `package.json`, add the version to `versions.json`, then push a tag with the same name (for example `0.1.1`, with no `v` prefix). The workflow builds the plugin and attaches `main.js`, `manifest.json` and `styles.css` to a GitHub release.

## Note

The plugin patches Obsidian's internal find bar, which isn't part of the public API, so an Obsidian update could break it.
