import { carry } from "../lib/carry.mjs";

/** The headers a list draws, top to bottom, each with whether a person sees it. */
const headsOf = (t, list) =>
	t.cdp.eval(`(() => { const l = document.querySelector('[data-list="${list}"]'); if (!l) return null; return [...l.querySelectorAll(".tc-list-item")].map((item) => ({ item, head: item.querySelector(".tc-group-head") })).filter(({ head }) => head).map(({ item, head }) => ({ name: head.textContent, seen: getComputedStyle(item).visibility === "visible" && getComputedStyle(head).visibility === "visible" && parseFloat(getComputedStyle(item).opacity) > 0.5 })); })()`);
/** A header's box in a list by its name. */
const headIn = (t, list, name) =>
	t.cdp.eval(`(() => { const h = [...document.querySelectorAll('[data-list="${list}"] .tc-group-head')].find((e) => e.textContent === ${JSON.stringify(name)}); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom }; })()`);
/** The sections of `## list` in the file, in their order («No section» where tasks outside any stand first). */
const sectionsInFile = async (t, list) => {
	const lines = (await t.file()).split("\n");
	const at = lines.indexOf(`## ${list}`);
	const out = [];
	for (let i = at + 1; i < lines.length && !lines[i].startsWith("## "); i++) {
		if (lines[i].startsWith("### ")) out.push(lines[i].slice(4));
		else if (lines[i].startsWith("- [") && out.length === 0) out.push("(none)");
	}
	return out;
};
const toBottom = async (t, list) => {
	await t.cdp.eval(`(async () => { const l = document.querySelector('[data-list="${list}"]'); l.scrollTop = l.scrollHeight; await new Promise((r) => setTimeout(r, 300)); return 1; })()`);
	await t.sleep(200);
};

/**
 * A section's header as a row of its own list and day (Decision 151, the review of batch B): No section heads a group in
 * Inbox, Soon and the day's list at once, a Soon section in Soon and on every later day; each header shows, lifts and
 * lands in its own list. Inbox's «No section» lifted under «Идеи» moves the tasks outside any section below it; a
 * section lifted up goes before the header it is let go over.
 */
export default {
	name: "e33-section-rows",
	features: ["F58: each list's No section header shows", "F63: No section lifted; a section moved up"],
	cases: ["each header shows", "No section lifted", "a section moved up"],
	async run(t, item) {
		if (item === "each header shows") {
			await t.setStop("soon");
			for (const list of ["soon", "day"]) {
				const heads = await headsOf(t, list);
				t.expect(heads && heads.length > 0 && heads[0].seen, `${list}: the first header shows: ${JSON.stringify(heads?.slice(0, 2))}`);
				t.expect(heads.every((h) => h.seen), `${list}: every header in sight shows: ${JSON.stringify(heads)}`);
			}
			await t.setStop("calendar");
			const day = await headsOf(t, "day");
			t.expect(day && day[0]?.name === "No section" && day[0].seen, `the day's list at its calendar: its first header shows: ${JSON.stringify(day?.slice(0, 2))}`);
		}

		if (item === "No section lifted") {
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-sections"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
			const soonBefore = await sectionsInFile(t, "Soon");
			const from = await headIn(t, "inbox", "No section");
			if (!t.expect(from !== null, "Inbox's No section header is in sight")) return;
			/** Lifted, its tasks fold under it and «Идеи» comes up right under it. */
			await carry(t, from, async () => {
				const ideas = await headIn(t, "inbox", "Идеи");
				return { x: ideas.x, y: ideas.bottom + 40 };
			});
			await t.sleep(800);
			const file = await sectionsInFile(t, "Inbox");
			t.expect(file[0] === "Идеи", `Inbox's No section went under «Идеи»: the file's Inbox starts with it: ${JSON.stringify(file)}`);
			const top = await headsOf(t, "inbox");
			t.expect(top[0]?.name === "Идеи" && top[0].seen, `and the list draws «Идеи» first: ${JSON.stringify(top.slice(0, 2))}`);
			t.expect(JSON.stringify(await sectionsInFile(t, "Soon")) === JSON.stringify(soonBefore), "Soon's sections stand as they were");
			await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
		}

		if (item === "a section moved up") {
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-sections"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
			await toBottom(t, "inbox");
			const from = await headIn(t, "inbox", "Пустая секция");
			await carry(t, from, async () => {
				const ideas = await headIn(t, "inbox", "Идеи");
				return { x: ideas.x, y: ideas.y };
			});
			await t.sleep(800);
			const file = await sectionsInFile(t, "Inbox");
			t.expect(file.indexOf("Пустая секция") >= 0 && file.indexOf("Пустая секция") < file.indexOf("Идеи"), `carried up over «Идеи»: written before it: ${JSON.stringify(file)}`);
			const shown = (await headsOf(t, "inbox")).map((h) => h.name);
			t.expect(shown.indexOf("Пустая секция") < shown.indexOf("Идеи"), `and drawn there: ${JSON.stringify(shown)}`);
			await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
		}
	},
};
