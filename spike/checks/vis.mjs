/** A per-frame sampler of what the eye sees of one task: its card (mounted, opacity up the tree, visibility, scale) and the drag overlay. */
export const VIS_SAMPLER = `
window.__vis = (id) => {
	const out = []; let run = true; const t0 = performance.now();
	const seen = (e) => { let o = 1, hidden = false, scale = 1; for (let n = e; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); o *= +cs.opacity; if (cs.visibility === "hidden" || cs.display === "none") hidden = true; const m = cs.transform; if (m && m !== "none") { const v = m.match(/matrix\\(([^)]+)\\)/); if (v) { const [a, b] = v[1].split(",").map(Number); scale *= Math.hypot(a, b); } } } const r = e.getBoundingClientRect(); return { o: +o.toFixed(2), hidden, scale: +scale.toFixed(3), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
	const tick = () => {
		if (!run) return;
		const s = window.tcSpike?.store.getState();
		out.push({ t: Math.round(performance.now() - t0), released: window.__released ? Math.round(performance.now() - window.__released) : null, cards: [...document.querySelectorAll('[data-id="' + id + '"], [data-block="' + id + '"]')].map(seen), overlay: [...document.querySelectorAll('[data-overlay="' + id + '"]')].map(seen), dragging: s?.dragging ?? null, shown: !!s?.shown, reads: s?.reads });
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	return () => { run = false; return out; };
};`;
/** Frames after the release where nothing of the task is visible, or its card shows partly faded or scaled once the overlay has gone. */
export function visibilityFaults(samples) {
	const faults = [];
	let overlayGone = false;
	for (const f of samples) {
		if (f.released === null || f.dragging !== null) continue;
		const card = f.cards.filter((c) => !c.hidden).reduce((m, c) => Math.max(m, c.o), 0);
		const over = f.overlay.filter((c) => !c.hidden).reduce((m, c) => Math.max(m, c.o), 0);
		if (f.overlay.length === 0) overlayGone = true;
		const visible = [...f.cards, ...f.overlay].filter((c) => !c.hidden && c.o > 0.05);
		const apart = visible.some((a) => visible.some((b) => Math.abs(a.x - b.x) > 4 || Math.abs(a.y - b.y) > 4));
		if (apart) faults.push({ at: f.released, what: "two visible copies apart", copies: visible.map((c) => [c.x, c.y, c.o]) });
		if (Math.max(card, over) < 0.95) faults.push({ at: f.released, what: "nothing visible", card, overlay: over, mounted: f.cards.length, reads: f.reads, shown: f.shown });
		else if (overlayGone && (card < 0.99 || f.cards.some((c) => Math.abs(c.scale - 1) > 0.01))) faults.push({ at: f.released, what: "card faded or scaled", card, scale: f.cards.map((c) => c.scale), reads: f.reads });
	}
	return faults;
}

/**
 * How the overlay hands over to the card: how long after the release it is gone, whether it changed size on the way,
 * and how far the card stands from the overlay's last frame (x, y, width, height), the card at full opacity.
 */
export function settleCheck(samples) {
	const after = samples.filter((f) => f.released !== null && f.dragging === null);
	const withOverlay = after.filter((f) => f.overlay.length);
	const last = withOverlay.at(-1);
	const firstWithout = after.find((f) => !f.overlay.length && f.released > (last?.released ?? -1));
	if (!last || !firstWithout) return { overlayGoneMs: last ? null : 0, note: last ? "overlay never left" : "no overlay after release" };
	const sizes = new Set(withOverlay.map((f) => `${f.overlay[0].w}x${f.overlay[0].h}`));
	const card = firstWithout.cards.filter((c) => !c.hidden).sort((a, b) => b.o - a.o)[0];
	const o = last.overlay[0];
	return { overlayGoneMs: firstWithout.released, overlaySizes: [...sizes], cardVsOverlay: card ? { dx: card.x - o.x, dy: card.y - o.y, dw: card.w - o.w, dh: card.h - o.h, cardOpacity: card.o } : null };
}
