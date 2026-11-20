import { cardBy } from "../lib/carry.mjs";
import { menuButton, menuFrames, menuNow } from "../lib/menu.mjs";

/**
 * E4, what the task menu's taps do (F113, F115, F116, F118, F128; the design's «Меню задачи», «Подтверждение Delete и
 * Won’t do», «Срок: выбор даты»): a level set and taken off by its tile, the card recoloured; Won't do and Delete ask in
 * place (Cancel puts the menu back, the confirming button and, on the Mac, Enter act), Today and Tomorrow and a picked day
 * put the task off, Remove due date takes its day; the Reminder page sets a timed task's kind. What is written is read from
 * the tasks file.
 */
export default {
	name: "e11-menu-flows",
	features: ["E4: the menu's flows (F113, F115, F116, F118, F128)"],
	cases: ["priority", "questions", "question in a small window", "pick a date", "reminder"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const press = async (words) => {
			const at = await menuButton(t, words);
			if (!t.expect(at !== null, `the menu shows «${words}»: ${JSON.stringify((await menuNow(t))?.words)}`)) return;
			await tap(at);
			await t.sleep(350);
		};
		const line = async (title) => (await t.file()).split("\n").find((l) => l.includes(title)) ?? "";
		await t.setStop("soon");
		const title = (await t.oracle.cards("day"))[3];
		const open = async (name = title, list = "day") => {
			await tap(await cardBy(t, name, list));
			await t.sleep(400);
		};
		if (item === "priority") {
			await open();
			await press("p2");
			await t.sleep(300);
			t.expect(/- \[.\] p2 /.test(await line(title)), `p2 written: ${await line(title)}`);
			const card = await t.cdp.eval(`[...document.querySelectorAll("[data-list=day] .tc-card")].find((c) => c.textContent.includes(${JSON.stringify(title)}))?.dataset.priority ?? null`);
			t.expect(card === "orange", `the card takes the level's colour: ${card}`);
			await open();
			const now = await menuNow(t);
			const on = await t.cdp.eval(`[...document.querySelectorAll(".tc-menu-layer .tc-menu-tile.is-on")].map((b) => b.textContent + (b.querySelector(".tc-menu-badge") ? "×" : ""))`);
			t.expect(JSON.stringify(on) === JSON.stringify(["p2×"]), `the level the task has is on, with its cross: ${JSON.stringify(on)} ${JSON.stringify(now?.words)}`);
			await t.shot("level-on");
			await press("p2");
			await t.sleep(300);
			t.expect(!/ p2 /.test(await line(title)), `a tap on the level it has takes it off: ${await line(title)}`);
		}
		if (item === "questions") {
			await open();
			await press("Won’t do");
			const asked = await menuNow(t);
			t.expect(asked?.question === `Won’t do “${title}”?`, `Won't do asks in place, naming the task: ${asked?.question}`);
			t.expect(asked && !asked.words.includes("Done") && asked.words.includes("Delete") && asked.words.includes("p1"), `the question takes the status tiles' place, the rest of the menu stays: ${JSON.stringify(asked?.words)}`);
			await t.shot("ask-wontdo");
			await press("Cancel");
			t.expect((await menuNow(t))?.words.includes("Done"), "Cancel puts the menu back as it was");
			const before = await t.file();
			t.expect(before.includes(title), "nothing was written");
			/** The verifier's find (2026-11-20): the question reshaped the menu, tiles hopping over the copy, the lower part scrolling with a scrollbar. */
			const parts = () => t.cdp.eval(`[...document.querySelectorAll(".tc-menu-layer .tc-panel")].map((p) => ({ above: p.classList.contains("is-above"), words: [...p.querySelectorAll(".tc-menu-tile-label, .tc-menu-label")].map((e) => e.textContent), bar: p.offsetWidth - p.clientWidth }))`);
			const beforeAsk = await parts();
			await press("Delete");
			const asked2 = await parts();
			const sideOf = (all, word) => all.find((p) => p.words.includes(word))?.above ?? null;
			t.expect(["Done", "p1", "Tomorrow", "Rename"].every((w) => sideOf(beforeAsk, w) === sideOf(asked2, w)), `the question keeps every group on its side of the copy: ${JSON.stringify(beforeAsk.map((p) => [p.above, p.words.slice(0, 3)]))} → ${JSON.stringify(asked2.map((p) => [p.above, p.words.slice(0, 3)]))}`);
			t.expect(asked2.every((p) => p.bar === 0), `no part shows a scrollbar: ${JSON.stringify(asked2.map((p) => p.bar))}`);
			const del = await menuNow(t);
			t.expect(del?.question === `Delete “${title}”?` && del.words.includes("Done"), `Delete asks in place of its row: ${del?.question}`);
			await t.shot("ask-delete");
			const red = await t.cdp.eval(`(() => { const b = [...document.querySelectorAll(".tc-menu-layer .tc-menu-ask-btn")].pop(); return getComputedStyle(b).backgroundColor; })()`);
			const danger = await t.cdp.eval(`getComputedStyle(document.body).getPropertyValue("--tc-danger").trim()`);
			t.expect(red.replace(/\s/g, "") !== "rgba(0,0,0,0)" && danger.length > 0, `Delete's button is the danger colour: ${red} (${danger})`);
			await press("Won’t do");
			const second = await menuNow(t);
			t.expect(second?.question?.startsWith("Won’t do") && second.words.includes("Delete") && !second.words.includes("Cancel Delete"), `one question at a time: the second puts back what the first replaced: ${JSON.stringify(second?.words)}`);
			if (t.platform === "desktop") {
				await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
				await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
			} else await press("Won’t do");
			await t.sleep(500);
			t.expect((await menuNow(t)) === null, "confirmed, the menu closes");
			t.expect((await line(title)).includes("- [-]"), `Won't do written (${t.platform === "desktop" ? "Enter" : "its button"}): ${await line(title)}`);
			t.expect(!(await t.oracle.cards("day")).includes(title), "and the card leaves the list");
			const next = (await t.oracle.cards("day"))[3];
			await open(next);
			await press("Delete");
			await press("Delete");
			await t.sleep(400);
			t.expect(!(await t.file()).includes(next), `Delete confirmed removes the task's line: ${next}`);
		}
		if (item === "question in a small window") {
			/** The verifier's window (2026-11-20): the desktop at 1024×824, the phone as it is; the card «Ответить Косте» of step 8. */
			if (t.platform === "desktop") await t.setViewport(1024, 824);
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-menu"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			await open("Ответить Косте", "day");
			const parts = () => t.cdp.eval(`[...document.querySelectorAll(".tc-menu-layer .tc-panel")].map((p) => ({ above: p.classList.contains("is-above"), words: [...p.querySelectorAll(".tc-menu-tile-label, .tc-menu-label")].map((e) => e.textContent), scrolls: p.scrollHeight > p.clientHeight + 1, hidden: getComputedStyle(p).scrollbarWidth === "none" }))`);
			const before = await parts();
			await press("Delete");
			await t.sleep(300);
			const after = await parts();
			const sideOf = (all, word) => all.find((p) => p.words.includes(word))?.above ?? null;
			t.expect(["Done", "p1", "Tomorrow", "Rename", "Open in Obsidian"].every((w) => sideOf(before, w) === sideOf(after, w)), `the question keeps every group on its side of the copy: ${JSON.stringify(before.map((p) => [p.above, p.words.slice(0, 2)]))} → ${JSON.stringify(after.map((p) => [p.above, p.words.slice(0, 2)]))}`);
			t.expect(after.every((p) => !p.scrolls || p.hidden), `a part that must scroll shows no scrollbar: ${JSON.stringify(after.map((p) => [p.scrolls, p.hidden]))}`);
			const ask = await t.cdp.eval(`(() => { const a = document.querySelector(".tc-menu-layer .tc-menu-ask"); const p = a.closest(".tc-panel"); const r = a.getBoundingClientRect(); const q = p.getBoundingClientRect(); return { inside: r.top >= q.top - 1 && r.bottom <= q.bottom + 1 }; })()`);
			t.expect(ask.inside, "the question shows whole in its part");
			await t.shot("ask-small-window");
		}
		if (item === "pick a date") {
			const inbox = (await t.oracle.cards("soon"))[0];
			await open(inbox, "soon");
			const frames = await menuFrames(t, () => press("Pick a date"), 300);
			const picker = await menuNow(t);
			const today = await t.cdp.eval(`(() => { const d = new Date(Date.now() - 5 * 3600e3); return d.toISOString().slice(0, 10).slice(0, 8) + String(d.getDate()).padStart(2, "0"); })()`);
			t.expect(picker && picker.panels.length === 1 && Math.abs(picker.panels[0].width - 300) <= 0.5, `Pick a date shows the month in the menu's place, 300 wide: ${JSON.stringify(picker?.panels)}`);
			t.expect(picker?.words.some((w) => /^[A-Z][a-z]+ \d{4}$/.test(w)), `its month's name on top: ${JSON.stringify(picker?.words)}`);
			const days = await t.cdp.eval(`[...document.querySelectorAll(".tc-menu-layer .tc-day")].length`);
			t.expect(days === 42, `six weeks of days: ${days}`);
			t.expect(!picker?.words.includes("Remove due date"), "no Remove due date for a task without one");
			t.expect(frames.every((f) => f.panels.length > 0), "the panel never leaves the screen between the pages");
			await t.shot("picker");
			const nextMonth = await t.cdp.eval(`document.querySelector(".tc-menu-layer .tc-picker-title").textContent`);
			await tap(await t.cdp.eval(`(() => { const r = document.querySelector(".tc-menu-layer .tc-picker-next").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
			await t.sleep(250);
			const shownMonth = await t.cdp.eval(`document.querySelector(".tc-menu-layer .tc-picker-title").textContent`);
			t.expect(shownMonth !== nextMonth, `the arrow turns to the next month: ${nextMonth} → ${shownMonth}`);
			const day = await t.cdp.eval(`(() => { const b = [...document.querySelectorAll(".tc-menu-layer .tc-day:not(.is-other)")][14]; return b.dataset.date; })()`);
			await press(day);
			await t.sleep(400);
			t.expect((await line(inbox)).includes(`📅 ${day}`), `the day picked is written: ${await line(inbox)} (${day}, today ${today})`);
			t.expect((await t.oracle.tasks("Soon")).some((task) => task.title === inbox && task.dated), "a later day puts it in Soon");
			const card = await t.cdp.eval(`(() => { const all = [...document.querySelectorAll(".tc-card")]; return all.some((c) => c.textContent.includes(${JSON.stringify(inbox)})); })()`);
			t.expect(!card, "dated, it leaves the undated Soon list on the screen");
		}
		if (item === "reminder") {
			await t.setClock("12:00");
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			const block = await t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-block]")].find((b) => b.textContent.includes("Обед")); const r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 12 }; })()`);
			await tap(block);
			await t.sleep(400);
			t.expect((await menuNow(t))?.words.includes("Reminder"), "a timed task's menu offers Reminder, last in When");
			await press("Reminder");
			const page = await menuNow(t);
			t.expect(page && JSON.stringify(page.words) === JSON.stringify(["Reminder", "Live Activity", "Notification", "Alarm", "Off"]), `its page: the way back and the kinds: ${JSON.stringify(page?.words)}`);
			const checked = await t.cdp.eval(`[...document.querySelectorAll(".tc-menu-layer .tc-menu-row.is-choice")].filter((r) => r.querySelector("svg")).map((r) => r.textContent)`);
			t.expect(JSON.stringify(checked) === JSON.stringify(["Live Activity"]), `the task's own kind checked: ${JSON.stringify(checked)}`);
			await t.shot("reminders");
			await press("Reminder");
			t.expect((await menuNow(t))?.words.includes("Done"), "the way back shows the menu again");
			await press("Reminder");
			await press("Alarm");
			await t.sleep(300);
			t.expect((await menuNow(t)) === null, "a pick closes the menu");
			await tap(block);
			await t.sleep(400);
			await press("Reminder");
			const after = await t.cdp.eval(`[...document.querySelectorAll(".tc-menu-layer .tc-menu-row.is-choice")].filter((r) => r.querySelector("svg")).map((r) => r.textContent)`);
			t.expect(JSON.stringify(after) === JSON.stringify(["Alarm"]), `the kind picked is the task's now: ${JSON.stringify(after)}`);
		}
	},
};
