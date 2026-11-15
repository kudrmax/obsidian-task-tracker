import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clusterFor, diffImages, type Rect, type Region } from "./diff";
import { type Cause, type Frame, judge, type Row, type StepLog } from "./frames";
import type { Platform, TestObsidian, Theme } from "./obsidian";
import { PAGE_SCRIPT } from "./page";
import { decodePng, encodePng } from "./png";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Point {
	readonly x: number;
	readonly y: number;
}

export interface StepOptions {
	readonly expectPlaces?: number;
	/** Row keys the step carries (exempt from the motion rules): each a whole key (`__e2e.keyAt`), never a cut title. */
	readonly carried?: readonly string[];
	readonly tolerated?: readonly string[];
	readonly expectMotion?: boolean;
	/** The rows the step may move (key prefixes): everything else must stand still. Default: every row. */
	readonly moves?: readonly string[] | "all";
	readonly maxStep?: number;
}

export interface ShotOptions {
	/** Selectors whose boxes are masked out. */
	readonly masks?: readonly string[];
	/** Regions by selector, each with its tolerance. */
	readonly regions?: readonly { readonly name: string; readonly selector: string; readonly channel: number; readonly share: number }[];
}

export interface Outcome {
	readonly combo: string;
	readonly name: string;
	readonly kind: "step" | "shot";
	readonly failures: readonly string[];
	readonly file?: string;
}

/**
 * The default tolerance of a shot: a channel may move by 5 of 255 (the GPU's rounding), on at most 0.2 % of the pixels
 * (anti-aliasing at glyph edges); a text one pixel off moves far more than that.
 */
export const REST = { channel: 5, share: 0.002 };

/** The pause before each step: a person's pace between two actions, never a gesture on the heels of the last one's settle. */
const HUMAN_PAUSE = 500;

/**
 * One platform and theme of the test Obsidian, driven as Max would: taps, swipes and drags through CDP's input (touch on
 * the phone view, the mouse and the trackpad's wheel on the desktop), each step recorded frame by frame and judged, each
 * resting screen shot and compared with its baseline.
 */
export class Driver {
	readonly outcomes: Outcome[] = [];
	private started: { name: string; type: string }[] = [];

	constructor(
		private readonly obsidian: TestObsidian,
		readonly platform: Platform,
		readonly theme: Theme,
		private readonly dirs: { readonly baselines: string; readonly run: string },
		private readonly update: boolean,
	) {
		obsidian.cdp.on("Animation.animationStarted", (p) => {
			const a = p.animation as { name?: string; type?: string };
			this.started.push({ name: a.name ?? "", type: a.type ?? "" });
		});
	}

	get combo(): string {
		return `${this.platform}-${this.theme}`;
	}

	private get cdp() {
		return this.obsidian.cdp;
	}

	async install(): Promise<void> {
		await this.cdp.call("Runtime.evaluate", { expression: PAGE_SCRIPT, returnByValue: true });
		await this.cdp.call("Animation.enable");
		await this.cdp.call("Emulation.setTouchEmulationEnabled", { enabled: this.platform === "phone", maxTouchPoints: 5 });
	}

	page<T>(body: string): Promise<T> {
		return this.cdp.eval<T>(body);
	}

	async center(selector: string, text?: string): Promise<Point & { w: number; h: number }> {
		const c = await this.page<(Point & { w: number; h: number }) | null>(`return __e2e.center(${JSON.stringify(selector)}, ${JSON.stringify(text ?? null)})`);
		if (!c) throw new Error(`nothing on the screen matches ${selector}${text ? ` «${text}»` : ""}`);
		return c;
	}

	// Input -----------------------------------------------------------------------------------------------------------

	private touch(type: string, points: readonly Point[]) {
		return this.cdp.call("Input.dispatchTouchEvent", { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 })) });
	}

	private mouse(type: string, p: Point, buttons = 0) {
		return this.cdp.call("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: type === "mouseMoved" ? (buttons ? "left" : "none") : "left", buttons, clickCount: type === "mouseMoved" ? 0 : 1 });
	}

	async tap(at: Point): Promise<void> {
		if (this.platform === "phone") {
			await this.touch("touchStart", [at]);
			await sleep(40);
			await this.touch("touchEnd", []);
		} else {
			await this.mouse("mouseMoved", at);
			await this.mouse("mousePressed", at, 1);
			await sleep(40);
			await this.mouse("mouseReleased", at);
		}
	}

	async tapOn(selector: string, text?: string): Promise<void> {
		await this.tap(await this.center(selector, text));
	}

	/** A finger (or the mouse) pressed at `from`, held `holdMs`, moved to `to` in `steps` frames, let go. */
	async drag(from: Point, to: Point, holdMs: number, steps: number, stepMs = 16): Promise<void> {
		const phone = this.platform === "phone";
		const at = (i: number) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
		if (phone) await this.touch("touchStart", [from]);
		else {
			await this.mouse("mouseMoved", from);
			await this.mouse("mousePressed", from, 1);
		}
		await sleep(holdMs);
		for (let i = 1; i <= steps; i++) {
			if (phone) await this.touch("touchMove", [at(i)]);
			else await this.mouse("mouseMoved", at(i), 1);
			await sleep(stepMs);
		}
		await sleep(stepMs);
		if (phone) await this.touch("touchEnd", []);
		else await this.mouse("mouseReleased", to);
	}

	/**
	 * A card lifted and held still, then let go where it was taken: the finger holds it (and on), the mouse lifts it by a
	 * small move (its hold would open the menu) and comes back before letting go.
	 */
	async liftAndHold(at: Point, holdMs: number): Promise<void> {
		if (this.platform === "phone") {
			await this.touch("touchStart", [at]);
			await sleep(450 + holdMs);
			await this.touch("touchEnd", []);
			return;
		}
		await this.mouse("mouseMoved", at);
		await this.mouse("mousePressed", at, 1);
		const off = { x: at.x, y: at.y + 8 };
		for (let i = 1; i <= 4; i++) {
			await this.mouse("mouseMoved", { x: at.x, y: at.y + 2 * i }, 1);
			await sleep(16);
		}
		await sleep(holdMs);
		for (let i = 3; i >= 0; i--) {
			await this.mouse("mouseMoved", { x: off.x, y: at.y + 2 * i }, 1);
			await sleep(16);
		}
		await this.mouse("mouseReleased", at);
	}

	/** One swipe of the screen: a finger flicked on the phone, two fingers on the trackpad (a wheel along x) on the desktop. */
	async swipe(at: Point, dx: number): Promise<void> {
		if (this.platform === "phone") return this.drag(at, { x: at.x + dx, y: at.y }, 0, 8, 12);
		/** A trackpad's pace: a delta every 8 ms, a few dozen px each, so the content following it moves as under a real hand. */
		const ticks = 30;
		for (let i = 0; i < ticks; i++) {
			await this.cdp.call("Input.dispatchMouseEvent", { type: "mouseWheel", x: at.x, y: at.y, deltaX: -dx / ticks, deltaY: 0 });
			await sleep(8);
		}
	}

	// Recording -------------------------------------------------------------------------------------------------------

	/** Runs `act`, recording every frame until the screen rests, and judges the step by the frame rules. */
	async step(name: string, cause: Cause, act: () => Promise<void>, options: StepOptions = {}): Promise<StepLog> {
		await this.page("return __e2e.rest()");
		await sleep(HUMAN_PAUSE);
		this.started = [];
		await this.page("__e2e.start(); return true");
		await act();
		const settled = await this.page<boolean>("return __e2e.rest(8000)");
		const { frames } = await this.page<{ frames: Frame[] }>("return __e2e.stop()");
		await sleep(400);
		const rest = await this.page<Row[]>("return __e2e.rows()");
		const gap = await this.page<number>("return __e2e.cardGap()");
		const carried = options.carried ? [...new Set(frames.flatMap((f) => f.rows.map((r) => r.key)))].filter((k) => options.carried!.includes(k)) : undefined;
		const log: StepLog = { name, cause, frames, started: [...this.started], rest, settled, gap, expectPlaces: options.expectPlaces, carried, tolerated: options.tolerated, expectMotion: options.expectMotion, moves: options.moves, maxStep: options.maxStep };
		const failures = judge(log);
		const file = join(this.dirs.run, this.combo, `${name}.frames.json`);
		mkdirSync(join(this.dirs.run, this.combo), { recursive: true });
		writeFileSync(file, JSON.stringify({ ...log, failures }, null, 1));
		this.outcomes.push({ combo: this.combo, name, kind: "step", failures, file });
		return log;
	}

	/** The view at rest, shot and compared with its baseline (recorded instead with `--update` or when there is none). */
	async shot(name: string, options: ShotOptions = {}): Promise<void> {
		await this.page("return __e2e.rest()");
		const view = await this.page<{ x: number; y: number; w: number; h: number } | null>(`return __e2e.rect("view")`);
		if (!view) throw new Error("no view to shoot");
		const shot = await this.cdp.call<{ data: string }>("Page.captureScreenshot", { format: "png", clip: { x: view.x, y: view.y, width: view.w, height: view.h, scale: 1 }, captureBeyondViewport: false });
		const png = Buffer.from(shot.data, "base64");
		const image = decodePng(png);
		const dpr = image.width / view.w;
		const toImage = (r: { x: number; y: number; w: number; h: number }): Rect => ({ x: Math.floor((r.x - view.x) * dpr), y: Math.floor((r.y - view.y) * dpr), w: Math.ceil(r.w * dpr), h: Math.ceil(r.h * dpr) });
		const masks = (await Promise.all((options.masks ?? []).map((s) => this.page<Rect[]>(`return __e2e.rects(${JSON.stringify(s)})`)))).flat().map(toImage);
		const regions: Region[] = [];
		for (const r of options.regions ?? []) {
			const rect = await this.page<Rect | null>(`return __e2e.rect(${JSON.stringify(r.selector)})`);
			if (rect) regions.push({ name: r.name, rect: toImage(rect), channel: r.channel, share: r.share });
		}
		const dir = join(this.dirs.run, this.combo);
		mkdirSync(dir, { recursive: true });
		const file = join(dir, `${name}.png`);
		writeFileSync(file, png);
		const baselineFile = join(this.dirs.baselines, this.combo, `${name}.png`);
		const sidecar = `${baselineFile}.json`;
		if (!this.update && !existsSync(baselineFile)) {
			this.outcomes.push({ combo: this.combo, name, kind: "shot", failures: [`no baseline at ${baselineFile}: record it with --update`], file });
			return;
		}
		if (this.update) {
			mkdirSync(join(this.dirs.baselines, this.combo), { recursive: true });
			writeFileSync(baselineFile, png);
			writeFileSync(sidecar, JSON.stringify({ masks, regions }, null, 1));
			this.outcomes.push({ combo: this.combo, name, kind: "shot", failures: [], file: `${file} (recorded as the baseline)` });
			return;
		}
		const kept = JSON.parse(readFileSync(sidecar, "utf8")) as { masks: Rect[]; regions: Region[] };
		const cluster = clusterFor(dpr);
		const result = diffImages(decodePng(readFileSync(baselineFile)), image, { regions: kept.regions.length ? kept.regions : regions, rest: REST, masks: [...kept.masks, ...masks], cluster });
		const failures = result.sizeDiffers
			? [`the shot is ${image.width}×${image.height}, the baseline another size`]
			: [
					...result.regions.filter((r) => r.failed).map((r) => `${r.name}: ${r.differing} of ${r.pixels} pixels differ`),
					...(result.largestCluster && result.largestCluster.pixels > cluster ? [`${result.largestCluster.pixels} differing pixels lie together at ${result.largestCluster.x},${result.largestCluster.y} (at most ${cluster}): something drawn moved`] : []),
				];
		if (result.picture && result.failed) writeFileSync(join(dir, `${name}.diff.png`), encodePng(result.picture));
		this.outcomes.push({ combo: this.combo, name, kind: "shot", failures, file });
	}
}
