# Find and Replace in Selection

Find and replace within the selected text in Obsidian.

## Usage

1. Select the text to search within. Multiple selections work too.
2. Run **Find and replace in selection** from the command palette, or assign it a hotkey.
3. Enter the text to find and its replacement. Matches inside the selection are highlighted in the note, and the dialog shows how many there are. Use the arrow buttons to jump between them.
4. Press **Enter** or click **Replace all**. One undo reverts every replacement.

Drag the dialog by its title to move it out of the way. It stays there for the rest of the session.

Matching is literal and ignores case, the same as Obsidian's built-in search.

The plugin uses only Obsidian's public API.

## Install with BRAT

1. Install [BRAT](https://tfthacker.com/BRAT) from Community plugins.
2. Run **BRAT: Add a beta plugin for testing** and enter `manojkarthick/obsidian-find-replace-selection`.
3. Turn on **Find and Replace in Selection** in Community plugins.

## Release

Update `version` in `manifest.json` and `package.json`, add the version to `versions.json`, then push a tag with the same name (for example `0.1.1`, with no `v` prefix). The workflow builds the plugin and attaches `main.js`, `manifest.json` and `styles.css` to a GitHub release.
