# Issue 1 Case Study: Just Audio Player

## Request

Issue: https://github.com/Jhon-Crow/obsidian-just-audio-player/issues/1

Opened: 2026-06-12

The issue asks for an Obsidian plugin that leaves the UI untouched until a user interacts with embedded audio. Once playback starts, a player should appear in the lower Obsidian UI with play/pause and timeline controls. Those controls must reflect the native audio state accurately and act on the same media element as Obsidian's default audio embed. Plugin settings must allow changing player width and the application corner used as the anchor.

The issue also requested research, data collection, possible solution analysis, and implementation.

## Collected Evidence

- Issue screenshot: `assets/default-obsidian-audio-player.png`
- Implementation preview screenshot: `assets/floating-player-preview.png`
- PNG signature validated locally from the first 8 bytes: `89 50 4e 47 0d 0a 1a 0a`
- Screenshot dimensions from the issue: 230 x 63
- Repository state before implementation: only `README.md` and `examples/manifest.json` existed, so the work was a new plugin implementation rather than a patch to existing runtime code.

## External Research

| Source | Relevant fact |
| --- | --- |
| Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin | The standard plugin development loop compiles TypeScript to `main.js`; manual install copies `main.js`, `styles.css`, and `manifest.json` to the vault plugin directory. |
| Obsidian releases repository: https://github.com/obsidianmd/obsidian-releases | Obsidian fetches `manifest.json`, `main.js`, and `styles.css` from release assets for community plugin installation. |
| Obsidian API package: https://github.com/obsidianmd/obsidian-api | The current typings expose `Plugin`, `PluginSettingTab`, `Setting`, DOM event cleanup helpers, and `setIcon`; `setIcon` supports Lucide icon IDs. |
| MDN `timeupdate`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/timeupdate_event | `timeupdate` fires when `currentTime` changes, but browser frequency depends on load and can vary roughly from 4Hz to 66Hz. |
| MDN `pause`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/pause_event | `pause` fires after `pause()` returns and `paused` becomes true. |
| WHATWG HTML media events: https://html.spec.whatwg.org/multipage/media.html | Media events cover play, pause, duration changes, time updates, ended state, and related playback transitions. |
| Existing Obsidian Audio Player plugin: https://github.com/noonesimg/obsidian-audio-player | A broader plugin uses a single audio instance, waveform visualization, and bookmarks; useful as a reference for the problem space but heavier than this issue requires. |
| Obsidian audio plugin index: https://www.obsidianstats.com/tags/audio | Existing audio plugins often replace or enhance embeds; this issue asks for a compact mirror/control surface instead. |
| WaveSurfer.js: https://wavesurfer.xyz/ | WaveSurfer is a strong option for waveform visualization, but it would add a custom playback/rendering layer that is unnecessary for mirroring Obsidian's native player. |

## Possible Solutions

### 1. Mirror Native Audio Elements

Listen for native `<audio>` elements rendered by Obsidian, make the floating player visible only after a play/playing event, and keep controls wired to the active `HTMLAudioElement`.

Benefits:

- Preserves Obsidian's default embed behavior.
- No custom decoder, renderer, or audio source resolver.
- Play/pause and seek operate on the exact media element shown in the note.
- Small dependency footprint.

Tradeoffs:

- The plugin depends on Obsidian rendering audio embeds as DOM audio elements.
- If Obsidian changes embed internals, DOM discovery may need adjustment.

Chosen for implementation.

### 2. Replace Audio Embeds With A Custom Player

Register a Markdown post processor or custom renderer and replace audio embeds with plugin-owned UI.

Benefits:

- Full control over layout and metadata.
- Easier to add waveforms, bookmarks, and playlists later.

Tradeoffs:

- Higher risk of breaking default Obsidian behavior.
- More code to resolve files, manage lifecycle, and preserve compatibility.
- Does not match the issue requirement to behave as if the default player was used.

### 3. Use WaveSurfer.js Or Similar

Embed a library for waveform/timeline UI.

Benefits:

- Strong waveform visualization and seek UX.
- Good future path for advanced audio analysis.

Tradeoffs:

- Larger dependency and build output.
- Not necessary for the requested play/pause plus timeline mirror.
- Could create a second playback surface instead of controlling the native player.

### 4. Use Media Session API

Integrate with OS/browser media controls.

Benefits:

- Future enhancement for hardware keys and system media overlays.

Tradeoffs:

- Does not create the requested Obsidian UI.
- Browser support and Electron behavior should be validated separately.

## Implemented Design

The plugin uses solution 1.

- `src/mediaController.ts` contains the testable playback state machine.
- `src/main.ts` scans for Obsidian-rendered `audio` elements, tracks play/playing events, and attaches the floating player to the active element.
- `styles.css` defines a compact fixed-position player using Obsidian CSS variables.
- Settings expose width and corner placement through Obsidian's `PluginSettingTab`.
- The timeline uses the active media element duration and writes directly to `currentTime`.
- State updates are driven by media events and an animation-frame loop while playing, so the UI is not limited to the throttled `timeupdate` cadence.

## Verification

- Reproducing unit test: `src/mediaController.test.ts`
- Local command: `npm test`
- Local command: `npm run build`
- Visual preview captured with Playwright: `assets/floating-player-preview.png`
- CI workflow added: `.github/workflows/ci.yml`

## Future Enhancements

- Optional keyboard shortcuts for play/pause and seek.
- Optional hide-on-ended behavior if users prefer a transient player.
- Optional Media Session API integration after validating Electron/Obsidian behavior.
- Optional waveform mode using WaveSurfer.js if the project scope expands beyond mirroring native embeds.
