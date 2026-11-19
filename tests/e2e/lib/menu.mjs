/**
 * A menu as a person sees it, read from the page apart from the code: its parts' boxes and how visible they are, its rows
 * and tiles by their words, and every frame of it while it opens and closes.
 */

/** The parts of the open menu: the copy over the backdrop, the panel's parts (over and under it), the backdrop. */
export function menuNow(t) {
	return t.cdp.eval(`(() => {
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
	return t.cdp.eval(`(() => {
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
 * What a person would see wrong as the menu opens: a part shown before it stands at its place (its left ever other than
 * where it settles, or its top further from there than the design's rise and its scale), a part fading back, the copy off
 * the pressed card, or parts not appearing together.
 */
export function openingFaults(frames, card, { rise = 8, scaleGap = 0.06 } = {}) {
	const faults = [];
	const last = frames[frames.length - 1];
	if (!last || !last.panels.length || !last.copy) return [`the menu never opened: ${JSON.stringify(last)}`];
	if (last.panels.some((p) => p.o < 0.99) || last.copy.o < 0.99 || last.backdrop < 0.99) faults.push(`not wholly shown at the end: ${JSON.stringify(last)}`);
	const settled = last.panels;
	let prev = null;
	for (const f of frames) {
		f.panels.forEach((p, i) => {
			const end = settled[i];
			if (!end || p.o < 0.005) return;
			/** Scaled from its edge by the copy (the design's transform-origin), a part's left grows by at most its width's share of the scale. */
			const slack = end.width * scaleGap;
			if (p.left < end.left - 1 || p.left > end.left + 1) faults.push(`t=${f.t} panel ${i} drawn sideways of its place: left ${p.left} vs ${end.left}`);
			const bottom = p.top + p.height;
			const endBottom = end.top + end.height;
			const off = end.above ? Math.abs(bottom - endBottom) : Math.abs(p.top - end.top);
			if (off > rise + 1) faults.push(`t=${f.t} panel ${i} drawn ${off}px from its edge by the copy (rise ${rise})`);
			if (p.width < end.width - slack - 1) faults.push(`t=${f.t} panel ${i} narrower than the design's scale: ${p.width} of ${end.width}`);
		});
		if (f.copy && f.copy.o > 0.005 && card && (Math.abs(f.copy.left - card.left) > 1 || Math.abs(f.copy.top - card.top) > 1)) faults.push(`t=${f.t} the copy off its card: ${f.copy.left},${f.copy.top} vs ${card.left},${card.top}`);
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
		const os = [f.backdrop ?? 0, f.copy?.o ?? 0, ...f.panels.map((p) => p.o)];
		if (f.panels.length && Math.max(...os) - Math.min(...os) > 0.35) faults.push(`t=${f.t} parts not going together: ${os.join(" ")}`);
		prev = f;
	}
	const last = frames[frames.length - 1];
	if (last.panels.length || last.copy || last.backdrop !== null) faults.push(`still there at the end: ${JSON.stringify(last)}`);
	return faults;
}
