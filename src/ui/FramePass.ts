/** The browser's animation frames, or a test's. */
export interface Frames {
	request(run: () => void): number;
	cancel(id: number): void;
}

const ANIMATION_FRAMES: Frames = { request: (run) => requestAnimationFrame(run), cancel: (id) => cancelAnimationFrame(id) };

/** A pass over the layout run once in the next frame however often it is asked for before it, or at once when asked to. */
export class FramePass {
	private frame: number | null = null;

	constructor(
		private readonly run: () => void,
		private readonly frames: Frames = ANIMATION_FRAMES,
	) {}

	ask(): void {
		if (this.frame !== null) return;
		this.frame = this.frames.request(() => {
			this.frame = null;
			this.run();
		});
	}

	/** At once, and the frame asked for goes. */
	now(): void {
		this.cancel();
		this.run();
	}

	cancel(): void {
		if (this.frame === null) return;
		this.frames.cancel(this.frame);
		this.frame = null;
	}
}
