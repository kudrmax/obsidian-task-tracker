import { carry } from "../lib/carry.mjs";
import { menuButton, menuNow } from "../lib/menu.mjs";

/** A header's box by the name on it. */
const headBy = (t, name) =>
	t.cdp.eval(`(() => { const e = [...document.querySelectorAll(".tc-group-head")].find((h) => h.querySelector(".tc-group-name")?.textContent === ${JSON.stringify(name)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, height: r.height }; })()`);
/** The lines of `## list` in the file: its sections as «### name», its tasks by title. */
const linesOf = async (t, list) => {
	const lines = (await t.file()).split("\n");
	const at = lines.indexOf(`## ${list}`);
	const out = [];
	for (let i = at + 1; i < lines.length && !lines[i].startsWith("## "); i++) if (lines[i].trim() && !lines[i].startsWith("\t")) out.push(lines[i].replace(/^- \[.\] /, "").split(/ (?:📅|📌|📁)/u)[0].trim());
	return out;
};

/**
 * A section's header (F62, F63; the design's «Меню заголовка», «Поднятая секция»; `docs/plugin/tasks.md` «Секции»): a tap
 * opens its menu, Rename and Remove section; No section's opens none. Rename turns the header into its name's field at its
 * own height, nothing under it moving; Enter writes the name, Escape keeps the old one. Remove takes the heading away, its
 * tasks joining the tasks outside any. A long press lifts the whole section, its tasks folding under it, and it goes
 * between the other groups, written as a move of the section.
 */
export default {
	name: "e28-section-head",
	features: ["F62: a section header's menu, Rename, Remove section", "F63: a section lifted among the sections"],
	cases: ["menu", "rename", "remove", "lift"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const key = async (name, code, keyCode) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, windowsVirtualKeyCode: keyCode });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: keyCode });
			await t.sleep(400);
		};
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-sections"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
		/** Inbox is the upper half of its column (F27): its sections, at its end, are scrolled into sight. */
		await t.cdp.eval(`(() => { const l = document.querySelector('[data-list="inbox"]'); l.scrollTop = l.scrollHeight; return 1; })()`);
		await t.sleep(400);

		if (item === "menu") {
			await tap(await headBy(t, "Идеи"));
			const menu = await menuNow(t);
			t.expect(menu && JSON.stringify(menu.words) === JSON.stringify(["Rename", "Remove section"]), `the header's menu: Rename and Remove section: ${JSON.stringify(menu?.words)}`);
			t.expect(menu && menu.copyText === "Идеи", `the header stands over the backdrop: ${menu?.copyText}`);
			await key("Escape", "Escape", 27);
			const lines = await linesOf(t, "Inbox");
			await tap(await headBy(t, "Идеи"));
			await menuNow(t);
			const away = await t.cdp.eval(`(() => { const b = document.querySelector(".tc-backdrop"); const r = b.getBoundingClientRect(); return { x: r.left + 8, y: r.bottom - 8 }; })()`);
			await tap(away);
			await t.sleep(500);
			t.expect((await menuNow(t)) === null, "a tap beside it closes it");
			t.expect(JSON.stringify(await linesOf(t, "Inbox")) === JSON.stringify(lines), "and writes nothing");
			const none = await headBy(t, "No section");
			if (t.expect(none !== null, "the tasks outside any section have their header")) {
				await tap(none);
				await t.sleep(400);
				t.expect((await menuNow(t)) === null, "a tap on No section opens no menu");
			}
		}

		if (item === "rename") {
			const head = await headBy(t, "Идеи");
			const next = await t.oracle.rect(".tc-list-item:has(.tc-group-head) + .tc-list-item .tc-card");
			await tap(head);
			await tap(await menuButton(t, "Rename"));
			await t.sleep(400);
			const field = await t.oracle.rect(".tc-group-slot.is-rename");
			t.expect(field && Math.abs(field.height - head.height) <= 1 && Math.abs(field.top - head.top) <= 1, `the field takes the header's place and height: ${JSON.stringify(field)} / ${JSON.stringify(head)}`);
			const nextNow = await t.oracle.rect(".tc-list-item:has(.tc-group-slot) + .tc-list-item .tc-card");
			t.expect(next && nextNow && Math.abs(nextNow.top - next.top) <= 1, `nothing under it moves: ${next?.top} → ${nextNow?.top}`);
			const focused = await t.cdp.eval(`!!document.activeElement?.closest(".tc-group-slot")`);
			t.expect(focused, "the caret is in the field");
			await t.cdp.send("Input.insertText", { text: " и планы" });
			await key("Enter", "Enter", 13);
			t.expect((await linesOf(t, "Inbox")).includes("### Идеи и планы"), `Enter writes the name: ${JSON.stringify(await linesOf(t, "Inbox"))}`);
			t.expect((await headBy(t, "Идеи и планы")) !== null, "the header shows it");
			await tap(await headBy(t, "Идеи и планы"));
			await tap(await menuButton(t, "Rename"));
			await t.sleep(400);
			await t.cdp.send("Input.insertText", { text: " ещё" });
			await key("Escape", "Escape", 27);
			t.expect((await linesOf(t, "Inbox")).includes("### Идеи и планы") && (await headBy(t, "Идеи и планы")) !== null, "Escape keeps the old name");
		}

		if (item === "remove") {
			const before = await linesOf(t, "Inbox");
			const tasks = before.slice(before.indexOf("### Идеи") + 1, before.indexOf("### Пустая секция"));
			await tap(await headBy(t, "Идеи"));
			await tap(await menuButton(t, "Remove section"));
			await t.sleep(700);
			const after = await linesOf(t, "Inbox");
			t.expect(!after.includes("### Идеи"), `the heading goes: ${JSON.stringify(after)}`);
			t.expect(tasks.every((task) => after.indexOf(task) >= 0 && after.indexOf(task) < after.indexOf("### Пустая секция")), `its tasks join the tasks outside any section: ${JSON.stringify(after)}`);
			t.expect((await headBy(t, "Идеи")) === null, "its header is gone from the screen");
		}

		if (item === "lift") {
			const before = await linesOf(t, "Inbox");
			const ideas = before.slice(before.indexOf("### Идеи") + 1, before.indexOf("### Пустая секция"));
			const from = await headBy(t, "Идеи");
			let during = null;
			const faults = await t.frames(
				() =>
					carry(
						t,
						from,
						async () => {
							const empty = await headBy(t, "Пустая секция");
							return { x: empty.x, y: empty.bottom + 30 };
						},
						{
							during: async () => {
								during = await t.cdp.eval(`(() => ({ plate: document.querySelector(".tc-overlay .tc-section-plate")?.textContent ?? null, folded: ${JSON.stringify(ideas)}.every((title) => ![...document.querySelectorAll('[data-list="inbox"] .tc-card-title')].some((e) => e.textContent === title)) }))()`);
							},
						},
					),
				{ maxStep: 80 },
			);
			await t.sleep(700);
			t.expect(during?.plate?.startsWith("Идеи"), `the header is carried as a plate with its name and count: ${JSON.stringify(during)}`);
			t.expect(during?.folded === true, "its tasks fold under it while it is carried");
			const after = await linesOf(t, "Inbox");
			t.expect(after.indexOf("### Пустая секция") < after.indexOf("### Идеи"), `let go under the next section: written after it: ${JSON.stringify(after)}`);
			t.expect(JSON.stringify(after.slice(after.indexOf("### Идеи") + 1, after.indexOf("### Идеи") + 1 + ideas.length)) === JSON.stringify(ideas), "its tasks with it, in their order");
			const shown = await t.cdp.eval(`[...document.querySelectorAll('[data-list="inbox"] .tc-group-name')].map((e) => e.textContent)`);
			t.expect(shown.indexOf("Пустая секция") < shown.indexOf("Идеи"), `the screen shows it there: ${JSON.stringify(shown)}`);
			t.expect(faults.length === 0, `frames: ${JSON.stringify(faults.slice(0, 4))}`);
		}
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
	},
};
