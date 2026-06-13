import { describe, expect, it } from "vitest";
import {
	JustAudioPlayerController,
	type AnimationScheduler,
	type SyncableMedia,
	copyMediaPlaybackState,
	formatMediaTime,
	shouldClearDetachedMedia,
} from "./mediaController";

class FakeMedia extends EventTarget implements SyncableMedia {
	currentTime = 0;
	duration = 120;
	innerHTML = "";
	paused = true;
	ended = false;
	muted = false;
	playbackRate = 1;
	src = "";
	playCalls = 0;
	pauseCalls = 0;

	async play(): Promise<void> {
		this.playCalls += 1;
		this.paused = false;
		this.ended = false;
		this.dispatchEvent(new Event("play"));
		this.dispatchEvent(new Event("playing"));
	}

	pause(): void {
		this.pauseCalls += 1;
		this.paused = true;
		this.dispatchEvent(new Event("pause"));
	}
}

class ManualScheduler implements AnimationScheduler {
	private callbacks = new Map<number, FrameRequestCallback>();
	private nextId = 1;

	request(callback: FrameRequestCallback): number {
		const id = this.nextId;
		this.nextId += 1;
		this.callbacks.set(id, callback);
		return id;
	}

	cancel(id: number): void {
		this.callbacks.delete(id);
	}

	flush(): void {
		const callbacks = Array.from(this.callbacks.entries());
		this.callbacks.clear();
		for (const [, callback] of callbacks) {
			callback(0);
		}
	}
}

describe("JustAudioPlayerController", () => {
	it("stays hidden until an audio element is activated, then mirrors and controls playback", async () => {
		const scheduler = new ManualScheduler();
		const updates: ReturnType<JustAudioPlayerController["getState"]>[] = [];
		const controller = new JustAudioPlayerController((state) => updates.push(state), scheduler);
		const media = new FakeMedia();

		expect(controller.getState().visible).toBe(false);

		controller.setActiveMedia(media, true);
		expect(controller.getState()).toMatchObject({
			visible: true,
			isPlaying: false,
			currentTime: 0,
			duration: 120,
			progress: 0,
		});

		await controller.togglePlayback();
		expect(media.playCalls).toBe(1);
		expect(controller.getState().isPlaying).toBe(true);

		media.currentTime = 30;
		media.dispatchEvent(new Event("timeupdate"));
		expect(controller.getState()).toMatchObject({
			currentTime: 30,
			progress: 0.25,
			currentLabel: "0:30",
			durationLabel: "2:00",
		});

		expect(controller.seekToProgress(0.5)).toBe(true);
		expect(media.currentTime).toBe(60);
		expect(controller.getState().progress).toBe(0.5);

		await controller.togglePlayback();
		expect(media.pauseCalls).toBe(1);
		expect(controller.getState().isPlaying).toBe(false);

		media.currentTime = 75;
		await controller.togglePlayback();
		scheduler.flush();
		expect(updates.at(-1)).toMatchObject({
			currentTime: 75,
			progress: 0.625,
		});
	});

	it("formats media times predictably", () => {
		expect(formatMediaTime(0)).toBe("0:00");
		expect(formatMediaTime(65)).toBe("1:05");
		expect(formatMediaTime(3661)).toBe("1:01:01");
		expect(formatMediaTime(Number.NaN)).toBe("0:00");
	});

	it("keeps detached active audio available while it is still playing", () => {
		expect(shouldClearDetachedMedia({ paused: false, ended: false })).toBe(false);
		expect(shouldClearDetachedMedia({ paused: true, ended: false })).toBe(true);
		expect(shouldClearDetachedMedia({ paused: false, ended: true })).toBe(true);
	});

	it("copies playback state before moving detached audio into the plugin player", () => {
		const source = new FakeMedia();
		const target = new FakeMedia();
		source.src = "app://vault/audio.mp3";
		source.innerHTML = '<source src="nested.mp3" type="audio/mpeg">';
		source.currentTime = 42;
		source.muted = true;
		source.playbackRate = 1.5;

		copyMediaPlaybackState(source, target);

		expect(target).toMatchObject({
			src: source.src,
			innerHTML: source.innerHTML,
			currentTime: source.currentTime,
			muted: source.muted,
			playbackRate: source.playbackRate,
		});
	});

	it("does not publish duplicate states for repeated media events or unchanged frames", () => {
		const scheduler = new ManualScheduler();
		const updates: ReturnType<JustAudioPlayerController["getState"]>[] = [];
		const controller = new JustAudioPlayerController((state) => updates.push(state), scheduler);
		const media = new FakeMedia();

		controller.setActiveMedia(media, true);
		expect(updates).toHaveLength(1);

		controller.setActiveMedia(media, true);
		media.dispatchEvent(new Event("play"));
		expect(updates).toHaveLength(1);

		media.paused = false;
		media.dispatchEvent(new Event("playing"));
		expect(updates).toHaveLength(2);

		media.dispatchEvent(new Event("playing"));
		scheduler.flush();
		expect(updates).toHaveLength(2);

		media.currentTime = 1;
		scheduler.flush();
		expect(updates.at(-1)).toMatchObject({ currentTime: 1 });
		expect(updates).toHaveLength(3);
	});
});
