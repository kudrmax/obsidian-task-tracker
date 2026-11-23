import { carry, cardBy } from "../lib/carry.mjs";

/**
 * Several picked tasks carried as a stack (F149, F169, F170; docs/plugin/tasks.md «Массовые действия»; the design's
 * «Массовые действия»): a picked card lifted carries the others along, its copy wearing their number, the others waiting
 * dashed in their places; let go in another list they all go there in one write; the calendar takes no stack; over the
 * plus's place, a ring with a cross, the stack goes back. On the Mac the cards are ⌘-clicked; on the phone picked in
 * Select tasks. The tasks file says where they went.
 */
export default {
	name: "e30-stack",
	features: ["Several picked tasks carried (F149, F169, F170)"],
	cases: ["to-soon", "calendar", "cancel"],
	async run(t, item) {
		/** The calendar's case picks in the day's list beside it; the others in Inbox. */
		const list = item === "calendar" ? "day" : "inbox";
		const fileList = item === "calendar" ? "Now" : "Inbox";
		await t.setStop(item === "calendar" ? "calendar" : "inbox");
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const shown = await t.oracle.cards(list);
		const [first, second] = (await t.oracle.tasks(fileList)).filter((task) => task.status === " " && !task.timed && shown.includes(task.title)).map((task) => task.title);
		if (t.platform === "phone") {
			await tap(await t.oracle.rect(".task-calendar > .tc-capsule:not(.tc-select-capsule) .tc-more-open"));
			await t.sleep(400);
			const select = await t.cdp.eval(`(() => { const b = [...document.querySelectorAll(".tc-panel.is-more button")].find((e) => e.textContent.trim() === "Select tasks"); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			await tap(select);
			await t.sleep(500);
			await tap(await cardBy(t, first, list));
			await tap(await cardBy(t, second, list));
		} else {
			for (const title of [first, second]) {
				const at = await cardBy(t, title, list);
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1, modifiers: 4 });
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1, modifiers: 4 });
				await t.sleep(250);
			}
		}
		await t.sleep(300);
		const seen = { count: null, waiting: false, cross: false };
		const watch = async () => {
			const now = await t.cdp.eval(`({ count: document.querySelector(".tc-carried .tc-float-count")?.textContent ?? null, waiting: !!document.querySelector(".tc-card.is-waiting"), cross: !!document.querySelector(".tc-plus-ring.is-cross") })`);
			seen.count ??= now.count;
			seen.waiting ||= now.waiting;
			seen.cross ||= now.cross;
		};
		const soonBefore = (await t.oracle.tasks("Soon")).length;
		const from = await cardBy(t, first, list);
		const target =
			item === "to-soon"
				? async () => {
						const list = await t.oracle.rect('.task-calendar [data-list="soon"]');
						return { x: list.x, y: list.top + 60 };
					}
				: item === "cancel"
					? () => t.oracle.rect(".tc-plus-ring.is-cross")
					: async () => {
							const grid = await t.oracle.rect(".task-calendar .tc-timeline");
							return { x: grid.x, y: grid.y };
						};
		await carry(t, from, target, { during: watch });
		await watch();
		await t.sleep(800);
		t.expect(seen.count === "2", `the carried copy wears the stack's number: ${seen.count}`);
		t.expect(seen.waiting, "the other picked card waits dashed in its place");
		t.expect(seen.cross, "the plus's place is a ring with a cross while the stack is carried");
		const soon = (await t.oracle.tasks("Soon")).map((task) => task.title);
		const inbox = (await t.oracle.tasks(fileList)).filter((task) => !task.timed).map((task) => task.title);
		if (item === "to-soon") {
			t.expect(soon.includes(first) && soon.includes(second) && !inbox.includes(first) && !inbox.includes(second), "both go to Soon in the file");
			t.expect(await t.cdp.eval(`document.querySelectorAll(".tc-card.is-selected").length === 0`), "a stack that landed lets the picks go");
		} else {
			t.expect(inbox.includes(first) && inbox.includes(second) && soon.length === soonBefore, `${item === "cancel" ? "over the cross" : "the calendar takes no stack"}: both stay where they were`);
		}
	},
};
