import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { calendarTools } from "../lib/calendar.mjs";

/** The cards drawn on the calendar now: each one's title, its rounded card's box, how high it is drawn and whether it holds shades. */
const CARDS = `[...document.querySelectorAll(".tc-items > .tc-block:not(.is-new-slot)")].map((b) => { const c = b.querySelector(".tc-block-card"); const r = c.getBoundingClientRect(); return { title: c.querySelector(".tc-card-title")?.textContent ?? null, left: r.left, top: r.top, right: r.right, bottom: r.bottom, z: Number(getComputedStyle(b).zIndex), shadow: getComputedStyle(c).boxShadow, shades: [...b.querySelectorAll(":scope > .tc-shades")].map((s) => { const q = s.getBoundingClientRect(); return { left: q.left, top: q.top, right: q.right, bottom: q.bottom, overflow: getComputedStyle(s).overflow, radius: getComputedStyle(s).borderRadius, card: getComputedStyle(c).borderRadius, n: s.children.length }; }) }; })`;
const crosses = (a, b) => a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right;

/**
 * The darkening the shades add in a region (CSS px), read from the screen as drawn with and without them: grey levels
 * of 255 at each CSS pixel (the mean of R, G and B, the device's pixels of it averaged).
 */
async function darkening(t, clip) {
	const take = async () => (await t.cdp.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } })).data;
	const withShades = await take();
	await t.cdp.eval(`(() => { const s = document.createElement("style"); s.id = "no-shades"; s.textContent = ".tc-shades { display: none !important; }"; document.head.append(s); return 1; })()`);
	await t.sleep(120);
	const flat = await take();
	await t.cdp.eval(`(() => { document.getElementById("no-shades").remove(); return 1; })()`);
	await t.sleep(120);
	return t.cdp.eval(`(async () => {
		const grey = async (data) => { const img = new Image(); img.src = "data:image/png;base64," + data; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return { w: img.width, h: img.height, px: g.getImageData(0, 0, img.width, img.height).data }; };
		const a = await grey(${JSON.stringify(withShades)}); const b = await grey(${JSON.stringify(flat)});
		const k = a.w / ${clip.width}; const W = ${Math.floor(clip.width)}; const H = Math.floor(a.h / k);
		const out = [];
		for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0;
			for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const i = ((Math.floor(y * k) + dy) * a.w + Math.floor(x * k) + dx) * 4; s += (b.px[i] + b.px[i + 1] + b.px[i + 2] - a.px[i] - a.px[i + 1] - a.px[i + 2]) / 3; n++; }
			out.push(Math.round(s / n)); }
		return { w: W, h: H, d: out };
	})()`);
}

/**
 * The shade a calendar task casts on the card under it (Max, 2026-11-19, Decision 60: «снизу под ней чуть темнее…
 * достаточно широкая тень, но незаметная»): only a card lying on another card casts one, and only on that card, clipped
 * to its rounded shape; every card keeps its flat look and its crisp edge against the ground everywhere, as a list's
 * card; the ground and the events take nothing. Measured from the screen with and without the shades: not one pixel
 * outside the card under changes; on it, along the upper card's top and left edges, a soft darkening fading from the
 * edge, never a line.
 */
export default {
	name: "e8-calendar-shadow",
	features: ["E3: a card lying on a card shades that card alone, softly; the ground, the events and the lists' cards take nothing (Decision 60)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		const base = (await cal.timeOf("Созвон с командой")).start - 60;
		await cal.scrollTo(base + 60, 20);
		await t.sleep(400);

		const cards = await t.cdp.eval(CARDS);
		t.expect(cards.length > 5, `the stand's calendar shows its tasks: ${cards.length}`);
		t.expect(cards.every((c) => c.shadow === "none"), `no task on the calendar casts a shadow of its own: ${JSON.stringify(cards.map((c) => [c.title, c.shadow]))}`);
		const lists = await t.cdp.eval(`[...document.querySelectorAll(".tc-list .tc-card")].map((c) => getComputedStyle(c).boxShadow)`);
		t.expect(lists.length > 0 && lists.every((s) => s === "none"), `a list's card casts none: ${JSON.stringify(lists)}`);
		const events = await t.cdp.eval(`[...document.querySelectorAll(".tc-items > .tc-event, .tc-event-block")].map((e) => [getComputedStyle(e).boxShadow, e.querySelectorAll(".tc-shade").length])`);
		t.expect(events.every(([shadow, shades]) => shadow === "none" && shades === 0), `events take none: ${JSON.stringify(events)}`);
		for (const card of cards) {
			const over = cards.filter((o) => o !== card && o.z > card.z && crosses(o, card));
			t.expect(card.shades.length === (over.length > 0 ? 1 : 0) && (card.shades[0]?.n ?? 0) === over.length, `«${card.title}» holds a shade for each card lying on it, none when none does: ${over.map((o) => o.title)} against ${JSON.stringify(card.shades)}`);
			for (const s of card.shades)
				t.expect(Math.abs(s.left - card.left) < 0.5 && Math.abs(s.top - card.top) < 0.5 && Math.abs(s.right - card.right) < 0.5 && Math.abs(s.bottom - card.bottom) < 0.5 && s.overflow === "hidden" && s.radius === s.card, `«${card.title}»'s shades are clipped to its own rounded box: ${JSON.stringify(s)} against ${JSON.stringify(card)}`);
		}
		t.expect(cards.some((c) => c.shades.length > 0), "a card lies on another on the stand's calendar");
		const pairs = [
			["Ревью дизайна", "Звонок врачу"],
			["Обед", "Позвонить в банк"],
		];
		const measures = {};
		for (const [lowerTitle, upperTitle] of pairs) {
			const lower = cards.find((c) => c.title === lowerTitle);
			const upper = cards.find((c) => c.title === upperTitle);
			if (!lower || !upper || !crosses(lower, upper)) {
				measures[`${upperTitle} on ${lowerTitle}`] = "not lying on it at this zoom";
				continue;
			}
			t.expect(upper.z > lower.z, `«${upperTitle}» is drawn over «${lowerTitle}»`);
			const room = await t.cdp.eval(`(() => { const r = document.querySelector(".tc-timeline").getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })()`);
			const clip = { x: Math.max(room.left, lower.left - 24), y: Math.max(room.top, Math.min(lower.top, upper.top) - 24), width: 0, height: 0 };
			clip.width = Math.min(room.right, lower.right + 24) - clip.x;
			clip.height = Math.min(room.bottom, Math.max(lower.bottom, upper.bottom) + 24) - clip.y;
			const { w, h, d } = await darkening(t, clip);
			const at = (x, y) => d[Math.floor(y - clip.y) * w + Math.floor(x - clip.x)];
			const inside = (box, x, y, edge = 0) => x >= box.left - edge && x < box.right + edge && y >= box.top - edge && y < box.bottom + edge;
			let outside = 0;
			for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!inside(lower, clip.x + x + 0.5, clip.y + y + 0.5)) outside = Math.max(outside, Math.abs(d[y * w + x]));
			const mid = upper.left + (upper.right - upper.left) / 2;
			const above = Array.from({ length: Math.min(16, Math.floor(upper.top - lower.top) - 2) }, (_, i) => at(mid, upper.top - 2 - i));
			const across = (Math.max(upper.top, lower.top) + Math.min(upper.bottom, lower.bottom)) / 2;
			const left = Array.from({ length: Math.min(16, Math.floor(upper.left - lower.left) - 2) }, (_, i) => at(upper.left - 2 - i, across));
			const below = Array.from({ length: Math.max(0, Math.min(16, Math.floor(lower.bottom - upper.bottom) - 1)) }, (_, i) => at(mid, upper.bottom + 1 + i));
			measures[`${upperTitle} on ${lowerTitle}`] = { outside, above, left, below };
			t.expect(outside === 0, `not one pixel outside «${lowerTitle}» changes (${outside})`);
			const soft = (profile, name) => {
				if (profile.length === 0) return;
				t.expect(profile[0] >= 2 && profile[0] <= 40, `«${lowerTitle}» darkens ${name} «${upperTitle}»'s edge, faintly: ${profile}`);
				t.expect(profile.every((v, i) => i === 0 || v <= profile[i - 1] + 1), `the shade ${name} fades from the edge, never a line: ${profile}`);
				t.expect(profile.at(-1) <= Math.max(1, profile[0] / 4), `it fades within ${profile.length} px: ${profile}`);
			};
			soft(above, "above");
			soft(left, "left of");
			soft(below, "below");
		}
		for (const title of ["Созвон с командой", "Тренировка"]) {
			const card = cards.find((c) => c.title === title);
			if (!card) continue;
			const clip = { x: card.left - 20, y: card.top - 20, width: card.right - card.left + 40, height: Math.min(card.bottom - card.top + 40, 400) };
			const { d } = await darkening(t, clip);
			const most = d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
			measures[title] = { changed: most };
			t.expect(most === 0, `«${title}» and the ground or event round it look exactly as flat (${most})`);
		}
		writeFileSync(join(t.out, "measures.json"), JSON.stringify(measures, null, 2));

		await t.shot("column");
		for (const [title, name] of [
			["Звонок врачу", "doctor-on-review"],
			["Позвонить в банк", "bank-on-lunch"],
			["Созвон с командой", "lone-on-ground"],
			["Тренировка", "over-event"],
		]) {
			const card = cards.find((c) => c.title === title);
			if (!card) continue;
			const lower = cards.find((c) => c.shades.length > 0 && crosses(c, card) && c !== card) ?? card;
			const top = Math.min(card.top, lower.top) - 24;
			await t.shot(name, { x: Math.min(card.left, lower.left) - 24, y: top, width: Math.max(card.right, lower.right) - Math.min(card.left, lower.left) + 48, height: Math.max(card.bottom, lower.bottom) - top + 24 });
		}

		const review = await cal.blockBy("Ревью дизайна");
		await cal.tap({ x: review.left + 40, y: review.top + 10 });
		await t.sleep(500);
		const raised = await t.cdp.eval(CARDS);
		const shadedBy = (title) => raised.find((c) => c.title === title)?.shades[0]?.n ?? 0;
		t.expect(shadedBy("Ревью дизайна") === 0 && shadedBy("Звонок врачу") === 1, `selected, «Ревью дизайна» lies over «Звонок врачу» and shades it instead: ${JSON.stringify(raised.map((c) => [c.title, c.z, c.shades.length]))}`);
	},
};
