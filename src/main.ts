import { App, Plugin, PluginSettingTab, Setting, setIcon } from "obsidian";
import { JustAudioPlayerController, type PlayerCorner, type PlayerState } from "./mediaController";

interface JustAudioPlayerSettings {
	width: number;
	corner: PlayerCorner;
}

const DEFAULT_SETTINGS: JustAudioPlayerSettings = {
	width: 360,
	corner: "bottom-right",
};

const CORNER_OPTIONS: Record<PlayerCorner, string> = {
	"bottom-right": "Bottom right",
	"bottom-left": "Bottom left",
	"top-right": "Top right",
	"top-left": "Top left",
};

const MIN_WIDTH = 240;
const MAX_WIDTH = 720;
const TIMELINE_STEPS = 1000;

function clampWidth(width: number): number {
	if (!Number.isFinite(width)) {
		return DEFAULT_SETTINGS.width;
	}

	return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

export default class JustAudioPlayerPlugin extends Plugin {
	settings: JustAudioPlayerSettings = { ...DEFAULT_SETTINGS };

	private playerEl: HTMLElement | null = null;
	private playButtonEl: HTMLButtonElement | null = null;
	private currentTimeEl: HTMLElement | null = null;
	private durationEl: HTMLElement | null = null;
	private timelineEl: HTMLInputElement | null = null;
	private observer: MutationObserver | null = null;
	private readonly trackedMedia = new Map<HTMLMediaElement, () => void>();
	private readonly controller = new JustAudioPlayerController((state) => this.renderState(state));

	async onload(): Promise<void> {
		await this.loadSettings();
		this.createPlayer();
		this.addSettingTab(new JustAudioPlayerSettingTab(this.app, this));
		this.startTrackingAudioElements();
	}

	onunload(): void {
		this.stopTrackingAudioElements();
		this.controller.destroy();
		this.playerEl?.remove();
		this.playerEl = null;
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<JustAudioPlayerSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			width: clampWidth(loaded?.width ?? DEFAULT_SETTINGS.width),
			corner: this.normalizeCorner(loaded?.corner),
		};
	}

	async saveSettings(): Promise<void> {
		this.settings.width = clampWidth(this.settings.width);
		this.settings.corner = this.normalizeCorner(this.settings.corner);
		await this.saveData(this.settings);
		this.applyPlayerSettings();
	}

	private normalizeCorner(value: unknown): PlayerCorner {
		if (typeof value === "string" && value in CORNER_OPTIONS) {
			return value as PlayerCorner;
		}

		return DEFAULT_SETTINGS.corner;
	}

	private createPlayer(): void {
		const playerEl = document.createElement("div");
		playerEl.className = "just-audio-player is-hidden";
		playerEl.setAttribute("role", "region");
		playerEl.setAttribute("aria-label", "Active audio player");

		const playButtonEl = document.createElement("button");
		playButtonEl.className = "just-audio-player__button";
		playButtonEl.type = "button";
		playButtonEl.addEventListener("click", () => {
			void this.controller.togglePlayback().catch((error) => {
				console.error("Just Audio Player could not toggle playback", error);
			});
		});
		playerEl.appendChild(playButtonEl);

		const currentTimeEl = document.createElement("span");
		currentTimeEl.className = "just-audio-player__time";
		currentTimeEl.textContent = "0:00";
		playerEl.appendChild(currentTimeEl);

		const timelineEl = document.createElement("input");
		timelineEl.className = "just-audio-player__timeline";
		timelineEl.type = "range";
		timelineEl.min = "0";
		timelineEl.max = String(TIMELINE_STEPS);
		timelineEl.step = "1";
		timelineEl.value = "0";
		timelineEl.setAttribute("aria-label", "Audio timeline");
		timelineEl.addEventListener("input", () => {
			this.controller.seekToProgress(Number(timelineEl.value) / TIMELINE_STEPS);
		});
		playerEl.appendChild(timelineEl);

		const durationEl = document.createElement("span");
		durationEl.className = "just-audio-player__time";
		durationEl.textContent = "0:00";
		playerEl.appendChild(durationEl);

		document.body.appendChild(playerEl);

		this.playerEl = playerEl;
		this.playButtonEl = playButtonEl;
		this.currentTimeEl = currentTimeEl;
		this.durationEl = durationEl;
		this.timelineEl = timelineEl;
		this.applyPlayerSettings();
		this.renderState(this.controller.getState());
	}

	private applyPlayerSettings(): void {
		if (!this.playerEl) {
			return;
		}

		for (const corner of Object.keys(CORNER_OPTIONS) as PlayerCorner[]) {
			this.playerEl.classList.toggle(`is-${corner}`, corner === this.settings.corner);
		}

		this.playerEl.style.setProperty("--just-audio-player-width", `${clampWidth(this.settings.width)}px`);
	}

	private renderState(state: PlayerState): void {
		if (!this.playerEl || !this.playButtonEl || !this.currentTimeEl || !this.durationEl || !this.timelineEl) {
			return;
		}

		this.playerEl.classList.toggle("is-hidden", !state.visible);
		this.playButtonEl.replaceChildren();
		setIcon(this.playButtonEl, state.isPlaying ? "pause" : "play");
		this.playButtonEl.setAttribute("aria-label", state.isPlaying ? "Pause audio" : "Play audio");
		this.playButtonEl.setAttribute("title", state.isPlaying ? "Pause" : "Play");
		this.currentTimeEl.textContent = state.currentLabel;
		this.durationEl.textContent = state.durationLabel;
		this.timelineEl.disabled = !state.canSeek;
		this.timelineEl.value = String(Math.round(state.progress * TIMELINE_STEPS));
		this.timelineEl.setAttribute("aria-valuetext", `${state.currentLabel} of ${state.durationLabel}`);
	}

	private startTrackingAudioElements(): void {
		this.scanForAudioElements();
		this.registerEvent(this.app.workspace.on("layout-change", () => this.scanForAudioElements()));
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scanForAudioElements()));

		this.observer = new MutationObserver(() => {
			this.scanForAudioElements();
			this.removeDetachedAudioElements();
		});
		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
		this.register(() => this.stopTrackingAudioElements());
	}

	private stopTrackingAudioElements(): void {
		this.observer?.disconnect();
		this.observer = null;

		for (const cleanup of this.trackedMedia.values()) {
			cleanup();
		}
		this.trackedMedia.clear();
	}

	private scanForAudioElements(): void {
		for (const media of Array.from(document.querySelectorAll("audio"))) {
			this.trackAudioElement(media);
			if (!media.paused && !media.ended) {
				this.controller.setActiveMedia(media, true);
			}
		}
		this.removeDetachedAudioElements();
	}

	private trackAudioElement(media: HTMLAudioElement): void {
		if (this.trackedMedia.has(media)) {
			return;
		}

		const activate = () => this.controller.setActiveMedia(media, true);
		media.addEventListener("play", activate);
		media.addEventListener("playing", activate);

		this.trackedMedia.set(media, () => {
			media.removeEventListener("play", activate);
			media.removeEventListener("playing", activate);
		});
	}

	private removeDetachedAudioElements(): void {
		for (const [media, cleanup] of this.trackedMedia.entries()) {
			if (media.isConnected) {
				continue;
			}

			cleanup();
			this.trackedMedia.delete(media);
			this.controller.clearMedia(media);
		}
	}
}

class JustAudioPlayerSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: JustAudioPlayerPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.replaceChildren();

		new Setting(containerEl)
			.setName("Player width")
			.setDesc("Width of the floating player in pixels.")
			.addSlider((slider) => {
				slider
					.setLimits(MIN_WIDTH, MAX_WIDTH, 10)
					.setValue(this.plugin.settings.width)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.width = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Player corner")
			.setDesc("Application corner used to anchor the player.")
			.addDropdown((dropdown) => {
				dropdown.addOptions(CORNER_OPTIONS);
				dropdown.setValue(this.plugin.settings.corner);
				dropdown.onChange(async (value) => {
					this.plugin.settings.corner = value as PlayerCorner;
					await this.plugin.saveSettings();
				});
			});
	}
}
