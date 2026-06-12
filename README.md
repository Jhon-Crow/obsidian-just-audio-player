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

Obsidian does not load TypeScript plugin source files directly. `src/*.ts` is development source, and `npm run build` compiles it into the `main.js` file that Obsidian loads.

## Manual Verification

1. Put `manifest.json`, `main.js`, and `styles.css` in `VaultFolder/.obsidian/plugins/just-audio-player/`.
2. Restart Obsidian or reload plugins, then enable Just Audio Player in community plugin settings.
3. Open a note with a normal Obsidian audio embed and confirm the floating player is hidden before playback.
4. Click play on the native Obsidian audio embed.
5. Confirm Obsidian stays responsive and the floating player appears.
6. Use the floating play/pause button and timeline, then confirm they control the same native audio embed.
