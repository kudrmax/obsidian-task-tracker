import { calendarTools } from "../lib/calendar.mjs";

/**
 * E3, a new task on the calendar (F101, F175, F190), the clock at noon: a long press on empty time (on the desktop, the
 * mouse held still too) lifts the new task's place there, its start written on it; moved, it follows by the snap step;
 * let go, the field opens at that time, and what is typed is written today at that time without a length. The plus
 * carried onto the calendar does the same where it is let go.
 */
export default {
	name: "e8-calendar-new",
	features: ["E3: a long press on empty time, the plus onto the calendar: a field at that time, no length (F101, F175, F190)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		await cal.scrollTo(12 * 60, 120);
		await t.sleep(300);
		const placeTime = () => t.cdp.eval(`document.querySelector(".tc-block.is-new-slot .tc-slot-time")?.textContent ?? null`);
		const field = () => t.cdp.eval(`!!document.activeElement?.closest(".tc-calendar-entry")`);

		const empty = await cal.lineAt(16 * 60);
		const from = { x: empty.room.left + (empty.room.right - empty.room.left) * 0.6, y: empty.y + 4 };
		const to = { x: from.x, y: from.y + empty.hour / 2 };
		const release = await cal.pull(from, to, { holdMs: 400 });
		const shown = await placeTime();
		await t.shot("new-place");
		await release();
		t.expect(shown === "21:30", `a long press on empty time lifts the new task's place, moved half an hour it writes 21:30: «${shown}»`);
		t.expect(await field(), "let go, the field opens on the calendar, typing into it at once");
		await t.shot("new-field");
		await t.cdp.send("Input.insertText", { text: "Вечерняя прогулка" });
		await cal.key("Enter", "Enter", 13);
		await t.sleep(500);
		const walk = await cal.timeOf("Вечерняя прогулка");
		const now = await t.oracle.tasks("Now");
		t.expect(walk?.start === 16 * 60 + 30 && walk.end === null && now.some((task) => task.title === "Вечерняя прогулка" && (task.dated || (t.port === "core" && task.timed))), `written today at 21:30 without a length: ${JSON.stringify(walk)}`);
		t.expect((await cal.blockBy("Вечерняя прогулка")) !== null && !(await field()), "it stands on the calendar, the field closed");

		/** Review 12: the plus onto the calendar takes its own top as the start (the pointer less where it took the button), as a card does. */
		const plus = await t.cdp.eval(`(() => { const r = document.querySelector(".task-calendar button.tc-plus").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top }; })()`);
		const at = await cal.lineAt(17 * 60);
		const carried = await cal.pull(plus, { x: from.x, y: at.y + (plus.y - plus.top) + 3 });
		const plusShown = await placeTime();
		await carried();
		t.expect(plusShown === "22:00", `the plus over the calendar: its place there with its start, its top on 22:00: «${plusShown}»`);
		t.expect(await field(), "the plus let go on the calendar: the field opens at that time");
		await t.cdp.send("Input.insertText", { text: "Почитать" });
		await cal.key("Enter", "Enter", 13);
		await t.sleep(500);
		const read = await cal.timeOf("Почитать");
		t.expect(read?.start === 17 * 60 && read.end === null, `the plus onto the calendar: written at that time without a length: ${JSON.stringify(read)}`);

		/** Review 10: a press held still on empty time (a finger, or the mouse as the plugin's long tap), let go unmoved, opens the field there. */
		const still = await cal.lineAt(18 * 60);
		const p = { x: from.x, y: still.y + 4 };
		if (t.platform === "phone") {
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y, id: 0 }] });
			await t.sleep(450);
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		} else {
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "none", buttons: 0 });
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
			await t.sleep(450);
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
		}
		await t.sleep(500);
		t.expect(await field(), "a press held still on empty time opens the field there");
		await t.cdp.send("Input.insertText", { text: "Позвонить бабушке" });
		await cal.key("Enter", "Enter", 13);
		await t.sleep(500);
		const call = await cal.timeOf("Позвонить бабушке");
		t.expect(call?.start === 18 * 60 && call.end === null, `held still on empty time: written at that time: ${JSON.stringify(call)}`);
	},
};
