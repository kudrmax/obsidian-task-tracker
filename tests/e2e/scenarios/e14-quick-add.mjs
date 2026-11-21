/**
 * E4, quick add (F174, F178–F182; the design's «Быстрый ввод»): a tap on the plus opens the field with the focus at the
 * port's place, the end of the day's list while it shows, else of Inbox, in its last section; the plus fades away while
 * typing. Enter writes the task there and opens an empty field right under it (batch typing); Tab makes the field a
 * subtask of the task above, Shift+Tab takes it back; Enter on an empty subtask field steps it out, on an empty one at the
 * top ends typing; Escape closes it writing nothing; a tap elsewhere writes what was typed. A `p1 ` prefix sets the level.
 * Every frame: nothing jumps or flickers as tasks come in.
 */
export default {
	name: "e14-quick-add",
	features: ["E4: quick add (F174, F178–F182)"],
	cases: ["day", "inbox", "levels", "escape and tap elsewhere", "slow click on the plus"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const key = async (k, code, vk, shift = false) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 });
		};
		const enter = () => key("Enter", "Enter", 13);
		const type = (text) => t.cdp.send("Input.insertText", { text });
		const field = () => t.cdp.eval(`(() => { const f = document.activeElement; if (!f?.isContentEditable) return null; const row = f.closest(".tc-quick-row"); const list = row.closest("[data-list]"); const r = row.getBoundingClientRect(); const items = [...list.querySelectorAll(".tc-list-item")].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); const at = items.findIndex((i) => i.contains(row)); const above = items[at - 1]; return { list: list.dataset.list, text: f.textContent, left: r.left, top: r.top, above: above ? (above.querySelector(".tc-card-title, .tc-group-name")?.textContent ?? "") : null, aboveLeft: above?.querySelector(".tc-card")?.getBoundingClientRect().left ?? null, last: at === items.length - 1 }; })()`);
		const plusShown = () => t.cdp.eval(`(() => { const p = document.querySelector(".task-calendar > button.tc-plus"); return p ? +getComputedStyle(p).opacity : 0; })()`);
		const openPlus = async () => {
			const plus = await t.oracle.rect(".task-calendar > button.tc-plus");
			await tap(plus);
			await t.sleep(400);
		};
		const lines = async () => (await t.file()).split("\n");

		if (item === "day") {
			await t.setStop("soon");
			await openPlus();
			const f = await field();
			t.expect(f && f.list === "day" && f.text === "", `the plus opens an empty field in today's list, the focus in it: ${JSON.stringify(f)}`);
			t.expect(f && f.last, `at the end of the list: ${JSON.stringify(f)}`);
			t.expect((await plusShown()) < 0.05, "the plus fades away while the field is open");
			await t.shot("field");
			await type("Купить хлеб");
			const frames = await t.frames(async () => {
				await enter();
				await t.sleep(300);
				await type("Позвонить сантехнику");
				await enter();
			}, { cast: "batch", settleMs: 700, maxStep: 60 });
			const file = await lines();
			const now = file.indexOf("## Now");
			const bread = file.findIndex((l) => l.endsWith("Купить хлеб 📅 " + file.find((x) => x.includes("📅"))?.split("📅 ")[1]?.slice(0, 10)) || l.includes("Купить хлеб"));
			const plumber = file.findIndex((l) => l.includes("Позвонить сантехнику"));
			const nextList = file.findIndex((l, i) => i > now && l.startsWith("## "));
			t.expect(bread > now && plumber === bread + 1 && plumber < nextList, `Enter writes each at the end of Now, one under another: ${file[bread]} | ${file[plumber]}`);
			t.expect(file[bread].includes("📅"), `due today: ${file[bread]}`);
			const next = await field();
			t.expect(next && next.text === "" && next.above === "Позвонить сантехнику", `an empty field opens right under the last one written: ${JSON.stringify(next)}`);
			t.expect(frames.length === 0, `frames as tasks come in: ${JSON.stringify(frames.slice(0, 4))}`);
			await enter();
			await t.sleep(400);
			t.expect((await field()) === null && (await t.cdp.eval(`!document.querySelector(".tc-entry")`)), "Enter on the empty field ends typing");
			t.expect((await plusShown()) > 0.95, "and the plus comes back");
		}
		if (item === "inbox") {
			await t.setStop("inbox");
			await openPlus();
			const f = await field();
			t.expect(f && f.list === "inbox" && f.last, `at Inbox–Soon the field opens at the end of Inbox: ${JSON.stringify(f)}`);
			await type("p1 Важное дело");
			await enter();
			await t.sleep(400);
			const file = await lines();
			const inbox = file.indexOf("## Inbox");
			const end = file.findIndex((l, i) => i > inbox && l.startsWith("## "));
			const ideas = file.findIndex((l, i) => i > inbox && l.startsWith("### Идеи"));
			const at = file.findIndex((l) => l.includes("Важное дело"));
			t.expect(at > ideas && at === end - 1 - file.slice(at + 1, end).filter((l) => !l.startsWith("- ")).length, `in Inbox's last section, last: ${file[at]}`);
			t.expect(/- \[ \] p1 Важное дело/.test(file[at] ?? ""), `the p1 prefix sets the level: ${file[at]}`);
			await key("Escape", "Escape", 27);
		}
		if (item === "levels") {
			await t.setStop("inbox");
			await openPlus();
			const top = await field();
			await key("Tab", "Tab", 9);
			await t.sleep(250);
			const deeper = await field();
			t.expect(deeper && top && Math.abs(deeper.left - top.left - 20) <= 1, `Tab moves the field a level in: ${top?.left} → ${deeper?.left}`);
			await key("Tab", "Tab", 9, true);
			await t.sleep(250);
			t.expect(Math.abs((await field()).left - top.left) <= 1, "Shift+Tab takes it back");
			await key("Tab", "Tab", 9);
			await t.sleep(200);
			await type("Подзадача");
			await enter();
			await t.sleep(400);
			const file = await lines();
			const at = file.findIndex((l) => l.includes("Подзадача"));
			t.expect(at > 0 && file[at].startsWith("\t- [ ] Подзадача") && file[at - 1].startsWith("- [ ]"), `written as a subtask of the task above: ${file[at - 1]} | ${file[at]}`);
			const after = await field();
			t.expect(after && Math.abs(after.left - deeper.left) <= 1, `the next field keeps the level: ${JSON.stringify(after)}`);
			await enter();
			await t.sleep(250);
			const out = await field();
			t.expect(out && Math.abs(out.left - top.left) <= 1, `Enter on an empty subtask field steps it out a level: ${JSON.stringify(out)}`);
			await enter();
			await t.sleep(300);
			t.expect((await field()) === null, "and Enter on it empty again ends typing");
		}
		if (item === "escape and tap elsewhere") {
			await t.setStop("soon");
			const before = await t.file();
			await openPlus();
			await type("Не записывать");
			await key("Escape", "Escape", 27);
			await t.sleep(300);
			t.expect((await field()) === null && (await t.file()) === before, "Escape closes the field and writes nothing");
			await openPlus();
			await type("Записать тапом мимо");
			const head = await t.oracle.rect(".tc-stage-head");
			await tap({ x: head.x, y: head.y });
			await t.sleep(400);
			t.expect((await t.file()).includes("Записать тапом мимо"), "a tap elsewhere writes what was typed");
			t.expect((await field()) === null, "and ends typing");
		}
		if (item === "slow click on the plus" && t.platform === "desktop") {
			/** A mouse held still on the plus is a click, as a finger's tap: it lifts the plus only once it moves (the loaded machine's 330–730 ms clicks opened nothing). */
			await t.setStop("soon");
			const plus = await t.oracle.rect(".task-calendar > button.tc-plus");
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: plus.x, y: plus.y, button: "left", buttons: 1, clickCount: 1 });
			await t.sleep(600);
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: plus.x, y: plus.y, button: "left", buttons: 0, clickCount: 1 });
			await t.sleep(400);
			t.expect((await field())?.text === "", `a slow click on the plus opens the new task's field: ${JSON.stringify(await field())}`);
		}
	},
};
