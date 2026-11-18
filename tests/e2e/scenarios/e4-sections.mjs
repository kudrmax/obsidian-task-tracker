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
 * Sections (the old plugin's F158; spec 2026-11-18): a section's header and an empty section's plate stand in the list
 * the cards part in. A card let go under a header goes into that section; under the last card of a section, to its end;
 * onto an empty section's «No tasks», into it.
 */
export default {
	name: "e4-sections",
	features: ["Sections: into a section, to its end, into an empty one"],
	async run(t) {
		await t.cdp.eval(`(async () => { app.commands.executeCommandById("task-calendar-stand:step-sections"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);

		const gift = await rowBy(t, "Купить подарок");
		await carry(t, gift, once(async () => {
			const last = await rowBy(t, "Записать идеи");
			return { x: last.x, y: last.bottom + last.height * 0.3 };
		}));
		await t.sleep(500);
		const soon = await listOf(t, "Soon");
		t.expect(soon.at(-1) === "Купить подарок" && soon.indexOf("### Поездка") < soon.indexOf("Купить подарок"), `under a section's last card: its end: ${JSON.stringify(soon)}`);

		const toIdeas = await rowBy(t, "Купить молоко");
		await carry(t, toIdeas, once(async () => {
			const head = await rowBy(t, "Идеи");
			return { x: head.x, y: head.y };
		}));
		await t.sleep(500);
		let inbox = await listOf(t, "Inbox");
		t.expect(inbox.indexOf("Купить молоко") > inbox.indexOf("### Идеи") && inbox.indexOf("Купить молоко") < inbox.indexOf("### Пустая секция"), `onto a section's header: into the section: ${JSON.stringify(inbox)}`);

		await t.cdp.eval(`(() => { const l = document.querySelector('[data-list="inbox"]'); l.scrollTop = l.scrollHeight; return 1; })()`);
		await t.sleep(400);
		const flowers = await rowBy(t, "Полить цветы");
		await carry(t, flowers, once(async () => {
			const plate = await rowBy(t, "No tasks");
			return { x: plate.x, y: plate.y };
		}));
		await t.sleep(500);
		inbox = await listOf(t, "Inbox");
		t.expect(inbox.at(-1) === "Полить цветы" && inbox.at(-2) === "### Пустая секция", `onto an empty section's plate: into it: ${JSON.stringify(inbox.slice(-4))}`);
		await t.cdp.eval(`(async () => { app.commands.executeCommandById("task-calendar-stand:whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
	},
};
