# Just Audio Player

Just Audio Player is an Obsidian plugin that mirrors the currently active audio embed in a compact floating player.

The player stays hidden until the user starts playback from a normal Obsidian audio embed. After that, it shows play/pause, elapsed time, duration, and a seekable timeline anchored to the configured application corner.

## Features

- No UI is added before the first audio playback interaction.
- Mirrors native `<audio>` playback state through media events plus animation-frame updates while audio is playing.
- Play/pause and timeline seeking control the same native audio element Obsidian rendered in the note.
- Settings for floating player width and corner placement.

## Development

```bash
npm install
npm test
npm run build
```

`npm run build` writes the bundled Obsidian entrypoint to `main.js`.

## Manual Install

Copy `manifest.json`, `main.js`, and `styles.css` into:

```text
VaultFolder/.obsidian/plugins/just-audio-player/
```

Then enable the plugin in Obsidian's community plugin settings.
