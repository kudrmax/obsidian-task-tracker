import { carry, cardBy } from "../lib/carry.mjs";

const INDENT = 20;
const once = (find) => {
	let aim = null;
	return async () => (aim ??= await find());
};
/** Each task's level in a list of the file, as «title:level». */
const levels = (text, list) => {
	const out = [];
	let on = false;
	for (const line of text.split("\n")) {
		if (line.startsWith("## ")) on = line === `## ${list}`;
		else if (on) {
			const m = /^(\t*)- \[.\] (.*)$/.exec(line);
			if (m) out.push(`${m[2]}:${m[1].length}`);
		}
	}
	return out;
};

/**
 * Subtasks (spec 2026-11-18, «The depth of a subtask»: dnd-kit's sortable tree projection): a card carried an indent to
 * the right under a task becomes its subtask; a last subtask carried an indent to the left becomes a task; a task with
 * subtasks carried into the other column takes them along and stays a task there — the column's width is no indent.
 */
export default {
	name: "e3-subtasks",
	features: ["Subtasks by a sideways move; a task carried with its subtasks"],
	async run(t) {
		await t.cdp.eval(`(async () => { app.commands.executeCommandById("task-calendar-stand:step-subtasks"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
		const file = () => t.cdp.eval(`window.__tcStand.fileText()`);

		const milk = await cardBy(t, "Купить молоко", "inbox");
		await carry(t, milk, once(async () => {
			const mom = await cardBy(t, "Позвонить маме", "inbox");
			return { x: milk.x + INDENT * 2, y: mom.y + mom.height * 0.2 };
		}));
		await t.sleep(500);
		let inbox = levels(await file(), "Inbox");
		t.expect(inbox[0] === "Позвонить маме:0" && inbox[1] === "Купить молоко:1", `an indent right under a task: its subtask: ${JSON.stringify(inbox.slice(0, 3))}`);

		const hotel = await cardBy(t, "Забронировать отель", "inbox");
		await carry(t, hotel, once(async () => ({ x: hotel.x - INDENT * 2, y: hotel.y + 2 })));
		await t.sleep(500);
		inbox = levels(await file(), "Inbox");
		t.expect(inbox.includes("Забронировать отель:0"), `the last subtask an indent left: a task: ${JSON.stringify(inbox.slice(2, 9))}`);

		const trip = await cardBy(t, "Спланировать отпуск", "inbox");
		await carry(t, trip, once(async () => {
			const parcel = await cardBy(t, "Забрать посылку", "soon");
			return { x: parcel.x, y: parcel.top + 3 };
		}));
		await t.sleep(500);
		const soon = levels(await file(), "Soon");
		const at = soon.indexOf("Спланировать отпуск:0");
		t.expect(at >= 0 && soon[at + 1] === "Выбрать даты:1" && soon[at + 3] === "Сравнить цены:2", `carried into Soon with its subtasks, still a task: ${JSON.stringify(soon)}`);
		t.expect(!levels(await file(), "Inbox").some((x) => x.startsWith("Выбрать даты")), "its subtasks left Inbox with it");
		await t.cdp.eval(`(async () => { app.commands.executeCommandById("task-calendar-stand:whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
	},
};
