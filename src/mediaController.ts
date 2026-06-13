export type PlayerCorner = "bottom-left" | "bottom-right" | "top-left" | "top-right";

export interface SyncableMedia extends EventTarget {
	currentTime: number;
	duration: number;
	innerHTML: string;
	paused: boolean;
	ended: boolean;
	muted: boolean;
	playbackRate: number;
	src: string;
	play(): Promise<void> | void;
	pause(): void;
}

export interface PlayerState {
	visible: boolean;
	isPlaying: boolean;
	currentTime: number;
	duration: number;
	progress: number;
	canSeek: boolean;
	currentLabel: string;
	durationLabel: string;
}

export interface AnimationScheduler {
	request(callback: FrameRequestCallback): number;
	cancel(id: number): void;
}

const MEDIA_EVENTS = [
	"play",
	"playing",
	"pause",
	"timeupdate",
	"durationchange",
	"loadedmetadata",
	"seeking",
	"seeked",
	"ended",
	"emptied",
	"abort",
] as const;

type MediaEventName = (typeof MEDIA_EVENTS)[number];

function areStatesEqual(left: PlayerState, right: PlayerState): boolean {
	return (
		left.visible === right.visible &&
		left.isPlaying === right.isPlaying &&
		left.currentTime === right.currentTime &&
		left.duration === right.duration &&
		left.progress === right.progress &&
		left.canSeek === right.canSeek &&
		left.currentLabel === right.currentLabel &&
		left.durationLabel === right.durationLabel
	);
}

export function formatMediaTime(value: number): string {
	if (!Number.isFinite(value) || value < 0) {
		return "0:00";
	}

	const totalSeconds = Math.floor(value);
	const seconds = totalSeconds % 60;
	const minutes = Math.floor(totalSeconds / 60) % 60;
	const hours = Math.floor(totalSeconds / 3600);

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function createDefaultScheduler(): AnimationScheduler {
	if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
		return {
			request: (callback) => window.requestAnimationFrame(callback),
			cancel: (id) => window.cancelAnimationFrame(id),
		};
	}

	const timeoutHandles = new Map<number, ReturnType<typeof setTimeout>>();
	let nextId = 1;

	return {
		request: (callback) => {
			const id = nextId;
			nextId += 1;
			const handle = globalThis.setTimeout(() => {
				timeoutHandles.delete(id);
				callback(Date.now());
			}, 100);
			timeoutHandles.set(id, handle);
			return id;
		},
		cancel: (id) => {
			const handle = timeoutHandles.get(id);
			if (handle) {
				globalThis.clearTimeout(handle);
				timeoutHandles.delete(id);
			}
		},
	};
}

function clampProgress(progress: number): number {
	if (!Number.isFinite(progress)) {
		return 0;
	}

	return Math.min(1, Math.max(0, progress));
}

function getSafeDuration(media: SyncableMedia | null): number {
	if (!media || !Number.isFinite(media.duration) || media.duration <= 0) {
		return 0;
	}

	return media.duration;
}

function getSafeCurrentTime(media: SyncableMedia | null): number {
	if (!media || !Number.isFinite(media.currentTime) || media.currentTime < 0) {
		return 0;
	}

	return media.currentTime;
}

export function shouldClearDetachedMedia(media: Pick<SyncableMedia, "paused" | "ended">): boolean {
	return media.paused || media.ended;
}

export function copyMediaPlaybackState(source: SyncableMedia, target: SyncableMedia): void {
	target.src = source.src;
	target.innerHTML = source.innerHTML;
	target.currentTime = source.currentTime;
	target.muted = source.muted;
	target.playbackRate = source.playbackRate;
}

export class JustAudioPlayerController {
	private media: SyncableMedia | null = null;
	private visible = false;
	private state: PlayerState = this.readState();
	private frameId: number | null = null;
	private readonly handleMediaEvent = (event: Event) => this.onMediaEvent(event.type as MediaEventName);

	constructor(
		private readonly onStateChange: (state: PlayerState) => void = () => undefined,
		private readonly scheduler: AnimationScheduler = createDefaultScheduler(),
	) {}

	setActiveMedia(media: SyncableMedia, reveal = true): void {
		if (this.media !== media) {
			this.unbindActiveMedia();
			this.media = media;
			for (const eventName of MEDIA_EVENTS) {
				media.addEventListener(eventName, this.handleMediaEvent);
			}
		}

		if (reveal) {
			this.visible = true;
		}

		this.publish();
		this.updateFrameLoop();
	}

	clearMedia(media?: SyncableMedia): void {
		if (media && this.media !== media) {
			return;
		}

		this.unbindActiveMedia();
		this.media = null;
		this.visible = false;
		this.publish();
	}

	isActiveMedia(media: SyncableMedia): boolean {
		return this.media === media;
	}

	async togglePlayback(): Promise<boolean> {
		if (!this.media) {
			return false;
		}

		if (this.media.paused || this.media.ended) {
			await this.media.play();
		} else {
			this.media.pause();
		}

		this.publish();
		this.updateFrameLoop();
		return true;
	}

	seekToProgress(progress: number): boolean {
		if (!this.media) {
			return false;
		}

		const duration = getSafeDuration(this.media);
		if (duration === 0) {
			return false;
		}

		this.media.currentTime = duration * clampProgress(progress);
		this.publish();
		return true;
	}

	getState(): PlayerState {
		return { ...this.state };
	}

	destroy(): void {
		this.stopFrameLoop();
		this.unbindActiveMedia();
	}

	private onMediaEvent(eventName: MediaEventName): void {
		if (eventName === "play" || eventName === "playing") {
			this.visible = true;
		}

		this.publish();
		this.updateFrameLoop();
	}

	private readState(): PlayerState {
		const duration = getSafeDuration(this.media);
		const currentTime = Math.min(getSafeCurrentTime(this.media), duration || Number.POSITIVE_INFINITY);
		const canSeek = duration > 0;
		const progress = canSeek ? clampProgress(currentTime / duration) : 0;
		const isPlaying = Boolean(this.media && !this.media.paused && !this.media.ended);

		return {
			visible: this.visible,
			isPlaying,
			currentTime,
			duration,
			progress,
			canSeek,
			currentLabel: formatMediaTime(currentTime),
			durationLabel: formatMediaTime(duration),
		};
	}

	private publish(): void {
		const nextState = this.readState();
		if (areStatesEqual(this.state, nextState)) {
			return;
		}

		this.state = nextState;
		this.onStateChange(this.getState());
	}

	private updateFrameLoop(): void {
		const shouldRun = Boolean(this.media && !this.media.paused && !this.media.ended);
		if (shouldRun && this.frameId === null) {
			this.frameId = this.scheduler.request(this.handleFrame);
		}

		if (!shouldRun) {
			this.stopFrameLoop();
		}
	}

	private readonly handleFrame = (): void => {
		this.frameId = null;
		this.publish();
		this.updateFrameLoop();
	};

	private stopFrameLoop(): void {
		if (this.frameId !== null) {
			this.scheduler.cancel(this.frameId);
			this.frameId = null;
		}
	}

	private unbindActiveMedia(): void {
		if (!this.media) {
			return;
		}

		for (const eventName of MEDIA_EVENTS) {
			this.media.removeEventListener(eventName, this.handleMediaEvent);
		}
	}
}
