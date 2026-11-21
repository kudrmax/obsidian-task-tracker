import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sleep } from "./cdp.mjs";

/**
 * What every frame showed, sampled in the page on each animation frame: each card and timeline block in sight (where,
 * how visible, its text and whether the text is cut), the pointer or finger, and any selected text. Read from the DOM as
 * it is painted, never from the code under test's own numbers. While the day slides, the day is the one more in sight of
 * its column (two copies stand there: the day going out and the day coming in).
 */
const SAMPLER = String.raw`(() => {
	const doc = document;
	const state = { frames: [], run: true, pointer: null, t0: performance.now() };
	const onPointer = (e) => { state.pointer = { x: e.clientX, y: e.clientY, down: e.buttons > 0 || e.pointerType === "touch" }; };
	const onUp = () => { if (state.pointer) state.pointer = { ...state.pointer, down: false }; };
	doc.addEventListener("pointermove", onPointer, true);
	doc.addEventListener("pointerdown", onPointer, true);
	doc.addEventListener("pointerup", onUp, true);
	const W = innerWidth, H = innerHeight;
	const opacityOf = (el) => { let o = 1; for (let n = el; n && n !== doc.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === "hidden" || cs.display === "none") return 0; o *= +cs.opacity; } return +o.toFixed(2); };
	const clipOf = (el) => { let box = { l: 0, t: 0, r: W, b: H }; for (let n = el.parentElement; n && n !== doc.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.overflowX !== "visible" || cs.overflowY !== "visible") { const r = n.getBoundingClientRect(); box = { l: Math.max(box.l, r.left), t: Math.max(box.t, r.top), r: Math.min(box.r, r.right), b: Math.min(box.b, r.bottom) }; } } return box; };
	const tick = () => {
		if (!state.run) return;
		const items = [];
		for (const el of doc.querySelectorAll(".task-calendar [data-id], .task-calendar [data-block], [data-copy]")) {
			const r = el.getBoundingClientRect();
			const clip = clipOf(el);
			const shown = { l: Math.max(r.left, clip.l), t: Math.max(r.top, clip.t), r: Math.min(r.right, clip.r), b: Math.min(r.bottom, clip.b) };
			if (shown.r - shown.l < 2 || shown.b - shown.t < 2) continue;
			const title = el.querySelector(".tc-card-title");
			const tr = title ? title.getBoundingClientRect() : null;
			items.push({
				id: el.dataset.id ?? el.dataset.block ?? el.dataset.copy,
				kind: el.dataset.id ? "card" : el.dataset.block ? "block" : "copy",
				x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
				whole: shown.l <= r.left + 1 && shown.r >= r.right - 1 && shown.t <= r.top + 1 && shown.b >= r.bottom - 1,
				/** What a person sees of it: its title's visibility (a lifted block hides its insides, not itself). */
				o: opacityOf(title ?? el),
				text: title ? title.textContent.length : 0,
				cut: !!title && title.scrollHeight > title.clientHeight + 1,
				above: tr ? +(tr.top - r.top).toFixed(1) : 0,
				below: tr ? +(r.bottom - tr.bottom).toFixed(1) : 0,
			});
		}
		const sel = doc.getSelection();
		state.frames.push({ t: Math.round(performance.now() - state.t0), day: (() => { const titles = [...doc.querySelectorAll(".task-calendar .tc-day-title")]; if (titles.length < 2) return titles[0]?.textContent ?? null; const off = (el) => { const slide = el.closest(".tc-slide"); const col = el.closest(".tc-stage-col"); return slide && col ? Math.abs(slide.getBoundingClientRect().left - col.getBoundingClientRect().left) : 0; }; return titles.sort((a, b) => off(a) - off(b))[0].textContent; })(), items, pointer: state.pointer, selection: sel ? sel.toString().length : 0, track: (() => { const t = doc.querySelector(".tc-ribbon-track"); return t ? +t.getBoundingClientRect().left.toFixed(1) : null; })(), place: (() => { const t = doc.querySelector(".tc-ribbon-track"); const r = doc.querySelector(".tc-ribbon"); const cols = t ? t.querySelectorAll(":scope > .tc-stage-col") : []; if (!t || !r || cols.length < 2) return null; const step = cols[1].getBoundingClientRect().left - cols[0].getBoundingClientRect().left; return +((r.getBoundingClientRect().left - t.getBoundingClientRect().left) / step).toFixed(3); })() });
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	window.__tcFrames = { stop: () => { state.run = false; doc.removeEventListener("pointermove", onPointer, true); doc.removeEventListener("pointerdown", onPointer, true); doc.removeEventListener("pointerup", onUp, true); return state.frames; } };
	return 1;
})()`;

export class FrameRecorder {
	/** @param {import("./cdp.mjs").Cdp} cdp */
	constructor(cdp) {
		this.cdp = cdp;
	}

	start() {
		return this.cdp.eval(SAMPLER);
	}

	stop() {
		return this.cdp.eval(`window.__tcFrames ? window.__tcFrames.stop() : []`);
	}
}

/**
 * The limits are measured by time, not per frame: `maxStep` and a card's closeness to its copy (`COPY_CLOSE_PX`) were tuned
 * on frames of a 120 Hz screen (the test Obsidian on Max's Mac, a frame every `TUNED_FRAME_MS`), so each frame's limit is
 * that one stretched by its own interval: a speed in px per ms. A browser drawing at 60 Hz (headless Chromium, a 60 Hz
 * monitor) moves the same motion twice as far between its frames; at 120 Hz the limits are the ones tuned. A frame longer
 * than a 60 Hz one (frames dropped) gets no more room than a 60 Hz frame: a jump there is a jump a person sees.
 */
const TUNED_FRAME_MS = 1000 / 120;
const LONGEST_FRAME_MS = 1000 / 60;
const COPY_CLOSE_PX = 2;
const perFrame = (limit, frames, i) => (i > 0 ? (limit * Math.min(LONGEST_FRAME_MS, Math.max(TUNED_FRAME_MS, frames[i].t - frames[i - 1].t))) / TUNED_FRAME_MS : limit);

/**
 * The checks every scenario's frames pass (spec, «How a feature is checked»): nothing visible vanishes for a frame and
 * comes back (flicker), no task shows twice, nothing moves faster than `maxStep` px a 120 Hz frame, nothing moves back the
 * way it came while `monotonic` holds, no text is selected, a card's title is never cut mid-line nor blank, and the
 * thing under the finger follows it (`follow`).
 */
export function frameFaults(frames, { maxStep = Infinity, monotonic = null, follow = null, ignoreBlankBelow = 0, carried = null } = {}) {
	const faults = [];
	const fault = (frame, kind, detail) => faults.push({ t: frame.t, kind, ...detail });
	const byId = (frame) => {
		const map = new Map();
		for (const item of frame.items) {
			if (item.o < 0.05) continue;
			map.set(item.id, [...(map.get(item.id) ?? []), item]);
		}
		return map;
	};
	const maps = frames.map(byId);
	frames.forEach((frame, i) => {
		if (frame.selection > 0) fault(frame, "selection", { chars: frame.selection });
		/** The carried task is seen every frame, as its card or its copy, from the lift until it has landed. */
		if (carried && frame.t >= carried.from && frame.t <= carried.until && !maps[i].has(carried.id)) fault(frame, "carried task unseen", { id: carried.id });
		for (const [id, copies] of maps[i]) {
			if (copies.filter((c) => c.kind === "card").length > 1) fault(frame, "double", { id, copies: copies.length });
			/** Its card and its copy in one frame are one card only where they lie on each other: the frame the copy lands. */
			const copy = copies.find((c) => c.kind === "copy");
			const card = copies.find((c) => c.kind === "card" || c.kind === "block");
			if (copy && card && Math.hypot(copy.x - card.x, copy.y - card.y) > perFrame(COPY_CLOSE_PX, frames, i)) fault(frame, "card and its copy apart", { id, dx: +(copy.x - card.x).toFixed(1), dy: +(copy.y - card.y).toFixed(1) });
			for (const item of copies) {
				if (item.whole && item.cut) fault(frame, "text cut", { id });
				if (item.whole && item.text === 0 && item.h > ignoreBlankBelow) fault(frame, "blank card", { id });
				if (item.whole && item.text > 0 && (item.above < -1 || item.below < -1)) fault(frame, "text out of its card", { id, above: item.above, below: item.below });
			}
		}
		if (i === 0 || i === frames.length - 1) return;
		for (const [id, copies] of maps[i - 1]) {
			const before = copies[0];
			const after = maps[i + 1].get(id)?.[0];
			if (!after || maps[i].has(id)) continue;
			const inside = (it) => it.whole;
			if (inside(before) && inside(after)) fault(frame, "flicker", { id });
		}
	});
	const tracks = new Map();
	frames.forEach((frame, i) => {
		for (const [id, copies] of maps[i]) {
			/** A card or a block is followed frame to frame; a carried copy moves with the finger, which its own check holds. */
			const at = copies.find((c) => c.kind !== "copy");
			if (!at) continue;
			const last = tracks.get(id);
			if (last && last.i === i - 1) {
				const dx = at.x - last.x;
				const dy = at.y - last.y;
				if (Math.hypot(dx, dy) > perFrame(maxStep, frames, i)) fault(frame, "jump", { id, dx: +dx.toFixed(1), dy: +dy.toFixed(1) });
				if (monotonic === "x" && last.dx !== 0 && dx !== 0 && Math.sign(dx) !== Math.sign(last.dx) && Math.abs(dx) > 0.5) fault(frame, "went back", { id, dx: +dx.toFixed(1) });
				tracks.set(id, { i, x: at.x, y: at.y, dx: dx !== 0 ? dx : last.dx });
			} else tracks.set(id, { i, x: at.x, y: at.y, dx: 0 });
		}
	});
	if (follow) {
		let start = null;
		for (const frame of frames) {
			const p = frame.pointer;
			if (!p?.down || frame.track === null) {
				start = null;
				continue;
			}
			/** The drag starts once the finger has gone past the swipe's threshold: from then on the screen is under the finger. */
			if (!start) {
				if (frame.track !== frames[frames.indexOf(frame) - 1]?.track) start = { px: p.x, track: frame.track };
				continue;
			}
			const off = frame.track - start.track - (p.x - start.px);
			if (Math.abs(off) > follow.tolerance && Math.abs(frame.track - start.track) < follow.until) fault(frame, "does not follow the finger", { off: +off.toFixed(1) });
		}
	}
	return faults;
}

/** Where the card of task `id` stood in each frame (its box and how visible it was), null in a frame that showed none. */
export const trackOf = (frames, id) => frames.map((frame) => frame.items.find((item) => item.id === id && item.kind !== "copy") ?? null);

/** How many times a value of the track changed by more than half a pixel the same way (`sign`: 1 up, -1 down): it glided, not jumped. */
export const stepsOf = (values, sign) => values.filter((v, i) => i > 0 && (v - values[i - 1]) * sign > 0.5).length;

/** A CDP screencast of the page into `dir`, every frame as a JPEG; `stop` gives the files and draws a contact sheet. */
export class Screencast {
	/** @param {import("./cdp.mjs").Cdp} cdp */
	constructor(cdp, dir) {
		this.cdp = cdp;
		this.dir = dir;
		this.files = [];
		this.off = null;
	}

	async start() {
		mkdirSync(this.dir, { recursive: true });
		this.off = this.cdp.on("Page.screencastFrame", (p) => {
			const file = join(this.dir, `${String(this.files.length + 1).padStart(4, "0")}.jpg`);
			writeFileSync(file, Buffer.from(p.data, "base64"));
			this.files.push({ file, data: p.data, t: p.metadata?.timestamp ?? 0 });
			void this.cdp.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => undefined);
		});
		await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1, maxWidth: 800 });
	}

	async stop() {
		await sleep(150);
		await this.cdp.send("Page.stopScreencast").catch(() => undefined);
		this.off?.();
		if (this.files.length) await this.sheet();
		return this.files.map((f) => f.file);
	}

	/** The frames, at most 48 spread over the whole run, on one image in reading order: drawn by the page's own canvas. */
	async sheet() {
		const pick = this.files.length <= 48 ? this.files : Array.from({ length: 48 }, (_, i) => this.files[Math.round((i * (this.files.length - 1)) / 47)]);
		const png = await this.cdp.eval(`(async () => {
			const srcs = ${JSON.stringify(pick.map((f) => f.data))};
			const imgs = await Promise.all(srcs.map((s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = "data:image/jpeg;base64," + s; })));
			const cols = 8, w = 200, h = Math.round(w * imgs[0].height / imgs[0].width);
			const c = document.createElement("canvas"); c.width = cols * w; c.height = Math.ceil(imgs.length / cols) * (h + 14);
			const g = c.getContext("2d"); g.fillStyle = "#808080"; g.fillRect(0, 0, c.width, c.height); g.font = "11px sans-serif";
			imgs.forEach((img, k) => { const x = (k % cols) * w, y = Math.floor(k / cols) * (h + 14); g.drawImage(img, x, y + 14, w - 2, h - 2); g.fillStyle = "#000"; g.fillText(String(k + 1), x + 3, y + 11); g.fillStyle = "#808080"; });
			return c.toDataURL("image/png").split(",")[1];
		})()`);
		writeFileSync(join(this.dir, "sheet.png"), Buffer.from(png, "base64"));
	}
}

/** A screenshot of the window into `file`. */
export async function screenshot(cdp, file, clip) {
	const shot = await cdp.send("Page.captureScreenshot", clip ? { format: "png", clip: { scale: 3, ...clip } } : { format: "png" });
	writeFileSync(file, Buffer.from(shot.data, "base64"));
	return file;
}
