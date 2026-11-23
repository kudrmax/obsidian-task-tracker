import { carry } from "../lib/carry.mjs";

const once = (find) => {
	let aim = null;
	return async () => (aim ??= await find());
};
/** A row's box by the words on it: a card's title, a section's name, an empty section's plate. */
const rowBy = (t, words) =>
	t.cdp.eval(`(() => { const e = [...document.querySelectorAll(".tc-card[data-id], .tc-group-head, .tc-group-empty")].find((e) => (e.querySelector(".tc-card-title, .tc-group-name")?.textContent ?? e.textContent) === ${JSON.stringify(words)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, height: r.height }; })()`);
/** A list of the file, its sections' names as «### …» among its tasks. */
const listOf = async (t, list) => {
	const lines = (await t.cdp.eval(`window.__tcStand.fileText()`)).split("\n");
	const at = lines.indexOf(`## ${list}`);
	const out = [];
	for (let i = at + 1; i < lines.length && !lines[i].startsWith("## "); i++) if (lines[i].trim()) out.push(lines[i].replace(/^\t*- \[.\] /, "").trim());
	return out;
};

/**
 * Sections (the old plugin's F158; spec 2026-11-18): a section's header stands in the list the cards part in; an empty
 * section is its header alone. A card let go under a header goes into that section; under the last card of a section, to
 * its end; under an empty section's header, into it.
 */
export default {
	name: "e4-sections",
	features: ["Sections: into a section, to its end, into an empty one"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-sections"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);

		const gift = await rowBy(t, "Купить подарок");
		await carry(t, gift, once(async () => {
			const last = await rowBy(t, "Записать идеи");
			return { x: last.x, y: last.bottom + last.height * 0.3 };
		}));
		await t.sleep(500);
		const soon = await listOf(t, "Soon");
		t.expect(soon.at(-1) === "Купить подарок" && soon.indexOf("### Поездка") < soon.indexOf("Купить подарок"), `under a section's last card: its end: ${JSON.stringify(soon)}`);

		/** Inbox is the upper half of its column (F27): the section «Идеи» is scrolled to its middle, the card above it in sight. */
		await t.cdp.eval(`(async () => { const l = document.querySelector('[data-list="inbox"]'); l.scrollTop = l.scrollHeight; await new Promise((r) => setTimeout(r, 300)); const head = [...l.querySelectorAll(".tc-group-head")].find((h) => h.textContent === "Идеи"); l.scrollTop += head.getBoundingClientRect().top - (l.getBoundingClientRect().top + l.clientHeight / 2); return 1; })()`);
		await t.sleep(400);
		const lines = await listOf(t, "Inbox");
		const mover = lines[lines.indexOf("### Идеи") - 1];
		const toIdeas = await rowBy(t, mover);
		await carry(t, toIdeas, once(async () => {
			const head = await rowBy(t, "Идеи");
			return { x: head.x, y: head.y };
		}));
		await t.sleep(500);
		let inbox = await listOf(t, "Inbox");
		t.expect(inbox.indexOf(mover) > inbox.indexOf("### Идеи") && inbox.indexOf(mover) < inbox.indexOf("### Пустая секция"), `onto a section's header: into the section: ${JSON.stringify(inbox)}`);

		await t.cdp.eval(`(() => { const l = document.querySelector('[data-list="inbox"]'); l.scrollTop = l.scrollHeight; return 1; })()`);
		await t.sleep(400);
		const flowers = await rowBy(t, "Полить цветы");
		let over = null;
		const headTop = `([...document.querySelectorAll(".tc-group-head")].find((h) => h.textContent === "Пустая секция")?.getBoundingClientRect().top ?? null)`;
		await carry(t, flowers, once(async () => {
			const head = await rowBy(t, "Пустая секция");
			return { x: head.x, y: head.bottom };
		}), {
			during: async () => {
				over = await t.cdp.eval(`(() => { const head = [...document.querySelectorAll(".tc-group-head")].find((h) => h.textContent === "Пустая секция").getBoundingClientRect(); const place = document.querySelector('[data-list="inbox"] .tc-drag-source.is-lifted .tc-card').getBoundingClientRect(); return { plate: !!document.querySelector(".tc-group-empty"), placeUnderHeader: place.top >= head.bottom - 1 && place.top - head.bottom < 30 }; })()`);
				await t.cdp.eval(`(() => { const held = ${headTop}; window.__headDrift = 0; const t0 = performance.now(); (function look() { const now = ${headTop}; if (now === null) return; window.__headDrift = Math.max(window.__headDrift, Math.abs(now - held)); if (performance.now() - t0 < 1500) requestAnimationFrame(look); })(); return 1; })()`);
			},
		});
		/** Max, 2026-11-18: an empty section is its header alone; under it the card's place opens as anywhere, no plate. */
		t.expect(over && over.plate === false && over.placeUnderHeader, `over an empty section only the card's place shows, right under its header: ${JSON.stringify(over)}`);
		await t.sleep(1600);
		/** Max, 2026-11-18: at the drop the empty section's header jumped and glided back. Nothing that stood still while held moves at the drop. */
		const drift = await t.cdp.eval(`window.__headDrift`);
		t.expect(drift <= 1, `the empty section's header stays where it stood while the card was held, through the drop: moved ${drift}px`);
		inbox = await listOf(t, "Inbox");
		t.expect(inbox.at(-1) === "Полить цветы" && inbox.at(-2) === "### Пустая секция", `under an empty section's header: into it: ${JSON.stringify(inbox.slice(-4))}`);
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
	},
};
