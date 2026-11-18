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
 * Subtasks (Max, 2026-11-18: by swipes, not by where the hand is): a card brought under a task and swiped right becomes
 * its subtask; a last subtask swiped left in place becomes a task; a task with subtasks carried into the other column
 * takes them along and stays a task there.
 */
export default {
	name: "e3-subtasks",
	features: ["Subtasks by a sideways move; a task carried with its subtasks"],
	async run(t) {
		await t.cdp.eval(`(async () => { app.commands.executeCommandById("task-calendar-stand:step-subtasks"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
		const file = () => t.cdp.eval(`window.__tcStand.fileText()`);

		/**
		 * Max, 2026-11-18: «a card moved right in place and one carried elsewhere feel like two logics; past half the card to
		 * make a subtask». A hand pushed far past the deepest level, then a short step back: a task again; pushed far left,
		 * then one step right: a subtask. Nothing builds up out of sight.
		 */
		const path = (...xs) => {
			let i = 0;
			return async () => xs[Math.min(i++, xs.length - 1)];
		};
		const bill = await cardBy(t, "Оплатить свет", "inbox");
		const far = Math.min(160, bill.width / 2 - 10);
		await carry(t, bill, path({ x: bill.x + far, y: bill.y + 2 }, { x: bill.x + far - 30, y: bill.y + 2 }));
		await t.sleep(500);
		let inbox = levels(await file(), "Inbox");
		t.expect(inbox.includes("Оплатить свет:0"), `far right, then a short step back: a task: ${JSON.stringify(inbox.slice(0, 4))}`);
		const bill2 = await cardBy(t, "Оплатить свет", "inbox");
		await carry(t, bill2, path({ x: bill2.x - far, y: bill2.y + 2 }, { x: bill2.x - far + 45, y: bill2.y + 2 }));
		await t.sleep(500);
		inbox = levels(await file(), "Inbox");
		t.expect(inbox.includes("Оплатить свет:1"), `far left, then one step right: a subtask: ${JSON.stringify(inbox.slice(0, 4))}`);

		const milk = await cardBy(t, "Купить молоко", "inbox");
		const mom = await cardBy(t, "Позвонить маме", "inbox");
		await carry(t, milk, path({ x: milk.x + 60, y: mom.y + mom.height * 0.2 }, { x: milk.x + 60 + 30, y: mom.y + mom.height * 0.2 }));
		await t.sleep(500);
		inbox = levels(await file(), "Inbox");
		t.expect(inbox[0] === "Позвонить маме:0" && inbox[1] === "Купить молоко:1", `under a task, a swipe right: its subtask (the hand far right on the way counts for nothing): ${JSON.stringify(inbox.slice(0, 3))}`);

		const hotel = await cardBy(t, "Забронировать отель", "inbox");
		await carry(t, hotel, once(async () => ({ x: hotel.x - 30, y: hotel.y + 2 })));
		await t.sleep(500);
		inbox = levels(await file(), "Inbox");
		t.expect(inbox.includes("Забронировать отель:0"), `the last subtask, a swipe left in place: a task: ${JSON.stringify(inbox.slice(2, 9))}`);

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
