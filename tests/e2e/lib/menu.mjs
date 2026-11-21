/**
 * A menu as a person sees it, read from the page apart from the code: its parts' boxes and how visible they are, its rows
 * and tiles by their words, and every frame of it while it opens and closes.
 */

/** The parts of the open menu: the copy over the backdrop, the panel's parts (over and under it), the backdrop. */
export function menuNow(t) {
	return t.cdp.eval(`(async () => {
		/** As a person sees it once it stands: the menu's block lifts to its place first (Decision 120). */
		const t0 = performance.now();
		for (;;) {
			const block = document.querySelector(".tc-menu-block");
			const level = document.querySelector(".tc-level.tc-menu-layer");
			const moving = block && [block, ...block.querySelectorAll("*")].some((e) => e.getAnimations().some((a) => a.playState === "running"));
			const settled = block ? !moving && (level?.classList.contains("is-shown") || level?.classList.contains("is-closing")) : performance.now() - t0 > 300;
			if (settled || performance.now() - t0 > 1500) break;
			await new Promise((r) => setTimeout(r, 25));
		}
		const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
		const panels = [...document.querySelectorAll(".tc-menu-layer .tc-panel")];
		if (!panels.length) return null;
		const copy = document.querySelector(".tc-menu-over > .tc-lifted");
		const title = copy?.querySelector(".tc-card-title, .tc-item-title");
		return {
			copy: box(copy),
			copyText: copy?.textContent ?? "",
			titleCut: !!title && (title.scrollWidth > title.clientWidth + 1 || title.scrollHeight > title.clientHeight + 1),
			titleBox: box(title),
			panels: panels.map((p) => ({ ...box(p), above: p.classList.contains("is-above") })),
			words: panels.flatMap((p) => [...p.querySelectorAll(".tc-menu-tile-label, .tc-menu-label, .tc-menu-back, .tc-menu-ask-question, .tc-picker-title, .tc-menu-ask-btn")].map((e) => e.textContent.trim())),
			question: document.querySelector(".tc-menu-layer .tc-menu-ask-question")?.textContent ?? null,
			focused: document.activeElement?.textContent?.trim() ?? null,
		};
	})()`);
}

/** The centre of the menu's button or tile whose words are `words` (a tile's label, a row's label, a day's number by `data-date`). */
export function menuButton(t, words) {
	return t.cdp.eval(`(async () => {
		/** A person presses once the menu stands still: the block lifts to its place first (Decision 120). */
		for (let i = 0; i < 60; i++) {
			const block = document.querySelector(".tc-menu-block");
			const moving = block && [block, ...block.querySelectorAll("*")].some((e) => e.getAnimations().some((a) => a.playState === "running"));
			if (block && document.querySelector(".tc-level.tc-menu-layer.is-shown") && !moving) break;
			await new Promise((r) => setTimeout(r, 25));
		}
		const all = [...document.querySelectorAll(".tc-menu-layer button")];
		const el = all.find((b) => b.dataset.date === ${JSON.stringify(words)}) ?? all.find((b) => (b.querySelector(".tc-menu-tile-label, .tc-menu-label, .tc-btn-label")?.textContent ?? b.textContent).trim() === ${JSON.stringify(words)});
		if (!el) return null;
		/** A person scrolls a part of the menu that scrolls until the row shows. */
		el.scrollIntoView({ block: "nearest" });
		const r = el.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: el.disabled };
	})()`);
}

/**
 * Every frame of the menu while `gesture` runs and `ms` after: each part's box as drawn (its transform included), its
 * opacity as a person sees it (its own times its ancestors'), and the backdrop's. Sampled on the page's animation frames.
 */
export async function menuFrames(t, gesture, ms = 600) {
	await t.cdp.eval(`(() => {
		const state = { frames: [], run: true, t0: performance.now() };
		const seen = (el) => { let o = 1; for (let n = el; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === "hidden" || cs.display === "none") return 0; o *= +cs.opacity; } return +o.toFixed(3); };
		const part = (el) => { const r = el.getBoundingClientRect(); return { left: +r.left.toFixed(1), top: +r.top.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1), o: seen(el), above: el.classList.contains("is-above") }; };
		const tick = () => {
			if (!state.run) return;
			const backdrop = document.querySelector(".tc-backdrop.tc-menu-layer");
			const copy = document.querySelector(".tc-menu-over > .tc-lifted");
			state.frames.push({ t: Math.round(performance.now() - state.t0), backdrop: backdrop ? seen(backdrop) : null, copy: copy ? part(copy) : null, panels: [...document.querySelectorAll(".tc-menu-layer .tc-panel")].map(part) });
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
		window.__tcMenuFrames = () => { state.run = false; return state.frames; };
		return 1;
	})()`);
	await gesture();
	await t.sleep(ms);
	return t.cdp.eval(`window.__tcMenuFrames()`);
}

/**
 * What a person would see wrong as the menu opens (Decision 120, iOS's context menu): a part shown before it stands at
 * its place sideways; the copy shown off its card's left, or anywhere but on its way from the card to its place, or
 * turning back on that way; the panel parting from the copy (more than the design's rise off where it stands under it,
 * narrower than the design's scale); a part fading back; parts not appearing together.
 */
export function openingFaults(frames, card, { rise = 8, scaleGap = 0.06 } = {}) {
	const faults = [];
	const last = frames[frames.length - 1];
	if (!last || !last.panels.length || !last.copy) return [`the menu never opened: ${JSON.stringify(last)}`];
	if (last.panels.some((p) => p.o < 0.99) || last.copy.o < 0.99 || last.backdrop < 0.99) faults.push(`not wholly shown at the end: ${JSON.stringify(last)}`);
	const settled = last.panels;
	const endCopy = last.copy;
	let prev = null;
	let way = 0;
	for (const f of frames) {
		f.panels.forEach((p, i) => {
			const end = settled[i];
			if (!end || p.o < 0.005) return;
			const slack = end.width * scaleGap;
			if (p.left < end.left - 1 || p.left > end.left + 1) faults.push(`t=${f.t} panel ${i} drawn sideways of its place: left ${p.left} vs ${end.left}`);
			/** The panel rides with the copy, growing from the copy's bottom edge (a task's notes unfolding in the copy push it down): its top off its place under the copy by the rise at most. */
			const under = f.copy ? p.top - (f.copy.top + f.copy.height) : p.top;
			const endUnder = end.top - (endCopy.top + endCopy.height);
			if (Math.abs(under - endUnder) > rise + 1) faults.push(`t=${f.t} panel ${i} drawn ${(under - endUnder).toFixed(1)}px off its place under the copy (rise ${rise})`);
			if (p.width < end.width - slack - 1) faults.push(`t=${f.t} panel ${i} narrower than the design's scale: ${p.width} of ${end.width}`);
		});
		if (f.copy && f.copy.o > 0.005 && card) {
			const lo = Math.min(card.top, endCopy.top) - 1;
			const hi = Math.max(card.top, endCopy.top) + 1;
			if (Math.abs(f.copy.left - card.left) > 1 || f.copy.top < lo || f.copy.top > hi) faults.push(`t=${f.t} the copy off its way from its card: ${f.copy.left},${f.copy.top} vs card ${card.left},${card.top} and place ${endCopy.top}`);
		}
		if (prev?.copy && f.copy && f.copy.o > 0.005) {
			const d = Math.sign(f.copy.top - prev.copy.top);
			if (d && way && d !== way) faults.push(`t=${f.t} the copy turned back on its way`);
			if (d) way = d;
		}
		if (prev) {
			const fell = f.panels.some((p, i) => prev.panels[i] && p.o < prev.panels[i].o - 0.02);
			if (fell) faults.push(`t=${f.t} a panel faded back while opening`);
		}
		const os = [f.backdrop ?? 0, f.copy?.o ?? 0, ...f.panels.map((p) => p.o)];
		if (Math.max(...os) - Math.min(...os) > 0.35) faults.push(`t=${f.t} parts not appearing together: ${os.join(" ")}`);
		prev = f;
	}
	return faults;
}

/** What a person would see wrong as the menu closes: a part moving sideways, coming back, or parts not going together; and that it is gone. */
export function closingFaults(frames) {
	const faults = [];
	const first = frames.find((f) => f.panels.length);
	if (!first) return ["no menu to close"];
	let prev = null;
	for (const f of frames) {
		f.panels.forEach((p, i) => {
			if (first.panels[i] && p.o > 0.005 && Math.abs(p.left - first.panels[i].left) > 1) faults.push(`t=${f.t} panel ${i} moved sideways while closing: ${p.left} vs ${first.panels[i].left}`);
			if (prev?.panels[i] && p.o > prev.panels[i].o + 0.02) faults.push(`t=${f.t} panel ${i} came back while closing`);
		});
		/** Closing, the block goes straight back down into its task (Decision 120): never sideways, never turning back. */
		if (first.copy && f.copy && f.copy.o > 0.005 && Math.abs(f.copy.left - first.copy.left) > 1) faults.push(`t=${f.t} the copy moved sideways while closing: ${f.copy.left} vs ${first.copy.left}`);
		if (prev?.copy && f.copy && f.copy.o > 0.005 && f.copy.top < prev.copy.top - 1) faults.push(`t=${f.t} the copy went up while closing: ${f.copy.top} after ${prev.copy.top}`);
		if (prev?.copy && f.copy && f.copy.o > prev.copy.o + 0.02) faults.push(`t=${f.t} the copy came back while closing`);
		f.panels.forEach((p, i) => {
			/** Its edge by the copy stays within the design's rise as it shrinks towards it. */
			const was = first.panels[i];
			const off = was && f.copy && first.copy ? Math.abs(p.top - f.copy.top - (was.top - first.copy.top)) : 0;
			if (was && p.o > 0.005 && off > 9) faults.push(`t=${f.t} panel ${i} parted from the copy while closing: ${off.toFixed(1)} px off`);
		});
		const os = [f.backdrop ?? 0, f.copy?.o ?? 0, ...f.panels.map((p) => p.o)];
		if (f.panels.length && Math.max(...os) - Math.min(...os) > 0.35) faults.push(`t=${f.t} parts not going together: ${os.join(" ")}`);
		prev = f;
	}
	const last = frames[frames.length - 1];
	if (last.panels.length || last.copy || last.backdrop !== null) faults.push(`still there at the end: ${JSON.stringify(last)}`);
	return faults;
}

/** The centre of the first element `selector` finds, as a person aims at it; null while there is none. */
export function centreOf(t, selector) {
	return t.cdp.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
}
