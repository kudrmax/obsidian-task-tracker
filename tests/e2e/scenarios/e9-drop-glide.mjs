import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every row of a list and every section header, each frame, where it is drawn inside its list (its scroll counted), and the
 * moment the pointer or finger let go. Read from the DOM as it is painted. Besides, for reading a failure: the row's slot
 * (`.tc-list-item`) and the transform dnd-kit gives its wrapper.
 */
const SAMPLER = String.raw`(() => {
	const doc = document;
	const st = { frames: [], run: true, up: null, t0: performance.now() };
	const onUp = () => { if (st.up === null) st.up = performance.now() - st.t0; };
	doc.addEventListener("pointerup", onUp, true);
	const tick = () => {
		if (!st.run) return;
		const rows = [];
		for (const el of doc.querySelectorAll(".task-calendar .tc-list .tc-card[data-id], .task-calendar .tc-list .tc-group-head")) {
			const list = el.closest(".tc-list");
			const r = el.getBoundingClientRect();
			if (r.height < 1) continue;
			const box = list.getBoundingClientRect();
			if (r.bottom <= box.top || r.top >= box.bottom) continue;
			const slot = el.closest(".tc-list-item");
			const source = el.closest(".tc-drag-source");
			rows.push({
				k: (el.dataset.id ? "card:" + el.dataset.id : "head:" + el.textContent) + "@" + list.dataset.list,
				y: +(r.top - box.top + list.scrollTop).toFixed(1),
				x: +(r.left - box.left).toFixed(1),
				slot: slot ? +(slot.getBoundingClientRect().top - box.top + list.scrollTop).toFixed(1) : null,
				dnd: source ? getComputedStyle(source).transform : null,
			});
		}
		st.frames.push({ t: +(performance.now() - st.t0).toFixed(1), rows, lifted: (() => { try { return window.__tcStand.debug()[0]?.lifted ?? null; } catch { return null; } })() });
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	window.__dropGlide = { stop: () => { st.run = false; doc.removeEventListener("pointerup", onUp, true); return st; } };
	return 1;
})()`;

/** A frame may move a row this much further than the frame before or after it did: past it the row jumped, it did not glide. */
const JUMP_PX = 2;

/**
 * Frames from the release until everything rests: a row or a header (not the carried card) that moves more than `JUMP_PX`
 * beyond its own move in the neighbouring frames jumped. A glide speeds up and slows down by less than that each frame.
 */
function jumps({ frames, up }, carried) {
	const from = frames.findIndex((f) => f.t >= up);
	if (from < 1) return [`no release seen in ${frames.length} frames`];
	const out = [];
	const keys = new Set(frames.flatMap((f) => f.rows.map((r) => r.k)));
	for (const k of keys) {
		if (k.startsWith(`card:${carried}@`)) continue;
		const at = frames.map((f) => f.rows.find((r) => r.k === k) ?? null);
		const step = (i) => (at[i] && at[i - 1] ? Math.hypot(at[i].x - at[i - 1].x, at[i].y - at[i - 1].y) : null);
		for (let i = from; i < frames.length; i++) {
			const s = step(i);
			if (s === null || s <= JUMP_PX) continue;
			const around = Math.max(step(i - 1) ?? 0, step(i + 1) ?? 0);
			if (s > around + JUMP_PX)
				out.push(`${k} moved ${s.toFixed(1)} px in one frame at +${Math.round(frames[i].t - up)} ms after the release (neighbouring frames ${around.toFixed(1)} px; slot ${at[i - 1].slot}→${at[i].slot}, dnd-kit ${at[i - 1].dnd}→${at[i].dnd})`);
		}
	}
	return out;
}

const step = (t, id) => t.cdp.eval(`(async () => { window.__tcStand.step("${id}"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
const rowsOf = (t, list) =>
	t.cdp.eval(`(() => { const l = document.querySelector('[data-list="${list}"]'); const box = l.getBoundingClientRect(); return [...l.querySelectorAll(".tc-card[data-id], .tc-group-head")].map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.id ?? null, head: e.classList.contains("tc-group-head") ? e.textContent : null, x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top }; }).filter((r) => r.y > box.top && r.y < box.bottom).sort((a, b) => a.top - b.top); })()`);

/**
 * A quick drag, as a hand flicks a card to its place: pressed (held past the long press on the phone), carried in a few
 * frames and let go at once, while the rows it passed are still parting.
 */
async function flick(t, from, to, steps) {
	const phone = t.platform === "phone";
	const mouse = (type, p, buttons) => t.cdp.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons, clickCount: 1 });
	const touch = (type, p) => t.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 0 }] : [] });
	if (phone) {
		await touch("touchStart", from);
		await t.sleep(380);
	} else {
		await mouse("mouseMoved", from, 0);
		await mouse("mousePressed", from, 1);
	}
	for (let i = 1; i <= steps; i++) {
		const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
		if (phone) await touch("touchMove", p);
		else await mouse("mouseMoved", p, 1);
		await t.sleep(16);
	}
	if (phone) await touch("touchEnd", null);
	else await mouse("mouseReleased", to, 0);
}

/**
 * A card let go while the rows it passed are still parting (Max: «headers and sections jump»; the frame audit of
 * 2026-11-19): the rows glide on from wherever they are drawn at the release to where the drop puts them; none, a header
 * neither, snaps the rest of the way in one frame. Into a section's header, and down a list, each let go within a quarter
 * second of the last row parting.
 */
export default {
	name: "e9-drop-glide",
	features: ["A quick drop: the rows glide on from where they are, no jump"],
	cases: ["into a section", "within a list"],
	async run(t, item) {
		let carried;
		let gesture;
		if (item === "into a section") {
			await step(t, "step-sections");
			const rows = await rowsOf(t, "inbox");
			const card = rows.find((r) => r.id);
			const head = rows.find((r) => r.head === "Идеи");
			carried = card.id;
			gesture = () => flick(t, card, { x: head.x, y: head.y + 4 }, 10);
		} else {
			await step(t, "step-one-column");
			const rows = (await rowsOf(t, "inbox")).filter((r) => r.id);
			carried = rows[1].id;
			gesture = () => flick(t, rows[1], { x: rows[1].x, y: rows[5].top + 4 }, 8);
		}
		await t.cdp.eval(SAMPLER);
		await gesture();
		await t.sleep(1000);
		const record = await t.cdp.eval(`window.__dropGlide.stop()`);
		writeFileSync(join(t.out, `drop-glide-${item.replace(/ /g, "-")}.json`), JSON.stringify(record));
		for (const fault of jumps(record, carried)) t.expect(false, fault);
		const moved = await t.file();
		t.expect(!!moved, "the file is read after the drop");
	},
};
