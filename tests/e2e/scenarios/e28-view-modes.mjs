/**
 * View modes and the view button (docs/plugin/screen.md, «Режимы вида»; F10–F12, F16–F18, F22, F23, F38; Decisions 148,
 * 149). The round button wears the chosen mode's icon; a tap opens «View» with the modes the core offers (All columns on
 * the desktop only) and a check at the chosen one. Rows stacks Inbox, Backlog, Soon and the day under small labels with the
 * day's title and arrows over the calendar; a swipe there turns nothing; the arrows turn the day. All columns shows the
 * three lists side by side, as wide each, the calendar behind the divider. Another mode draws in place, and the device keeps it.
 */

const SHOWN_CARDS = `(() => { const out = {}; for (const el of document.querySelectorAll(".task-calendar [data-id]")) { const r = el.getBoundingClientRect(); if (r.width > 0) out[el.dataset.id] = [Math.round(r.left), Math.round(r.top)]; } return out; })()`;

export default {
	name: "e28-view-modes",
	features: ["F10", "F11", "F12", "F16", "F17", "F18", "F22", "F23", "F38"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		const press = async (selector) => {
			const r = await t.oracle.rect(selector);
			const x = r.left + r.width / 2;
			const y = r.top + r.height / 2;
			if (t.platform === "phone") await t.input.tap(x, y);
			else await t.input.click(x, y);
			await t.sleep(450);
		};
		const menuRows = () => t.cdp.eval(`[...document.querySelectorAll(".tc-panel.is-view .tc-menu-row")].map((el) => ({ label: el.textContent.trim(), checked: !!el.querySelector("svg") }))`);
		const pick = async (label) => {
			await press(".tc-view-btn");
			const rows = await menuRows();
			const at = rows.findIndex((row) => row.label === label);
			if (!t.expect(at >= 0, `«View» offers ${label}: ${JSON.stringify(rows)}`)) return;
			await press(`.tc-panel.is-view .tc-menu-row:nth-child(${at + 1})`);
			await t.sleep(400);
		};
		const titles = async () => (await t.oracle.columns()).filter((title) => title !== "");

		await press(".tc-view-btn");
		const offered = await menuRows();
		const want = t.platform === "phone" ? ["Columns", "Rows", "By project"] : ["Two columns", "All columns", "Rows", "By project"];
		t.expect(JSON.stringify(offered.map((row) => row.label)) === JSON.stringify(want), `«View» offers ${JSON.stringify(want)}: ${JSON.stringify(offered)}`);
		t.expect(offered[0]?.checked && offered.slice(1).every((row) => !row.checked), `the chosen mode alone is checked: ${JSON.stringify(offered)}`);
		t.expect(await t.cdp.eval(`!!document.querySelector(".tc-control-copy .tc-view-btn")`), "a copy of the button stands over the backdrop");
		await t.cdp.eval(`document.querySelector(".tc-backdrop")?.click(); 1`);
		await t.sleep(400);
		t.expect(!(await t.cdp.eval(`!!document.querySelector(".tc-panel.is-view")`)), "a click on the backdrop closes «View»");

		const before = await t.cdp.eval(SHOWN_CARDS);
		await press(".tc-view-btn");
		const rowsAt = (await menuRows()).findIndex((row) => row.label === "Rows");
		const r = await t.oracle.rect(`.tc-panel.is-view .tc-menu-row:nth-child(${rowsAt + 1})`);
		if (t.platform === "phone") await t.input.tap(r.left + r.width / 2, r.top + r.height / 2);
		else await t.input.click(r.left + r.width / 2, r.top + r.height / 2);
		await t.sleep(120);
		const early = await t.cdp.eval(SHOWN_CARDS);
		await t.sleep(600);
		const late = await t.cdp.eval(SHOWN_CARDS);
		const moved = Object.keys(late).filter((id) => early[id] && (early[id][0] !== late[id][0] || early[id][1] !== late[id][1]));
		t.expect(moved.length === 0, `another mode draws in place, no card glides (F23): ${moved.slice(0, 4).join(", ")}`);
		t.expect(JSON.stringify(before) !== JSON.stringify(late), "Rows is drawn");
		const labels = await t.cdp.eval(`[...document.querySelectorAll(".tc-rows-stack .tc-row-label")].filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.textContent.trim())`);
		t.expect(JSON.stringify(labels.slice(0, 4)) === JSON.stringify(["Inbox", "Backlog", "Soon", "Today"]), `Rows: Inbox, Backlog, Soon and the day under their labels (F17): ${JSON.stringify(labels)}`);
		t.expect(await t.cdp.eval(`!!document.querySelector(".tc-stage-col.is-timeline .tc-day-nav .tc-day-title")`), "Rows: the day's title with its arrows over the calendar (F17)");
		t.expect(await t.cdp.eval(`(() => { const s = document.querySelector(".tc-rows-stack").getBoundingClientRect(); return [...document.querySelectorAll(".tc-row")].every((row) => { const r = row.getBoundingClientRect(); return r.bottom <= s.bottom + 1; }); })()`), "Rows: every row ends inside the stack, above the bottom row (F18)");
		t.expect((await t.cdp.eval(`document.querySelector(".tc-view-btn svg path").getAttribute("d")`)).startsWith("M4.5 4.5h15"), "the view button wears Rows' icon (F11)");

		const strip = () => t.cdp.eval(`Math.round(document.querySelector(".tc-ribbon-track").getBoundingClientRect().left)`);
		const stripAt = await strip();
		const view = await t.oracle.rect(".tc-rows-stack");
		const y = view.top + view.height * 0.3;
		if (t.platform === "phone") await t.input.swipe({ x: view.left + view.width * 0.8, y }, { x: view.left + view.width * 0.1, y }, { steps: 8, stepMs: 14 });
		else for (let i = 0; i < 20; i++) await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: view.left + view.width / 2, y, deltaX: 30, deltaY: 0 });
		await t.sleep(700);
		t.expect((await strip()) === stripAt, "Rows: a swipe moves nothing, no rubber band (F22, F38)");
		t.expect(JSON.stringify((await titles()).slice(-1)) === JSON.stringify(["Today"]), `Rows: a swipe turns no day: ${JSON.stringify(await titles())}`);

		await press(`.tc-stage-col.is-timeline .tc-arrow[aria-label="Next day"]`);
		await t.sleep(400);
		const tomorrow = await t.cdp.eval(`[...document.querySelectorAll(".tc-row.is-day .tc-row-label")].map((el) => [el.textContent.trim(), Math.round(el.getBoundingClientRect().left)])`);
		const rowLeft = await t.cdp.eval(`Math.round(document.querySelector(".tc-row.is-day").getBoundingClientRect().left)`);
		t.expect(tomorrow.some(([label, left]) => label === "Tomorrow" && Math.abs(left - rowLeft) < 30), `Rows: the arrow over the calendar turns the day's row to tomorrow (F22): ${JSON.stringify(tomorrow)}`);
		t.expect(!(await t.cdp.eval(`!!document.querySelector(".tc-stage-col.is-timeline .tc-now")`)), "Rows: the calendar is tomorrow's too");
		await press(`.tc-stage-col.is-timeline .tc-day-title`);

		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		t.expect(await t.cdp.eval(`!!document.querySelector(".tc-rows-stack")`), "the mode is kept on the device: a screen opened again draws Rows (F10)");

		if (t.platform === "desktop") {
			await pick("All columns");
			const heads = await titles();
			t.expect(["Inbox", "Soon", "Today"].every((title) => heads.includes(title)) && (await t.cdp.eval(`!!document.querySelector(".tc-all-columns .tc-backlog-head")`)), `All columns: Inbox over Backlog, Soon and the day side by side (F16): ${JSON.stringify(heads)}`);
			const widths = () => t.cdp.eval(`[...document.querySelectorAll(".tc-all-columns > .tc-stage-col:not(.is-timeline)")].map((el) => Math.round(el.getBoundingClientRect().width))`);
			const even = await widths();
			t.expect(even.length === 3 && Math.max(...even) - Math.min(...even) <= 1, `All columns: the three lists as wide each: ${JSON.stringify(even)}`);
			const handle = await t.oracle.rect(".tc-all-columns .tc-divider-handle");
			await t.input.drag({ x: handle.left + handle.width / 2, y: handle.top + handle.height / 2 }, { x: handle.left + handle.width / 2 - 150, y: handle.top + handle.height / 2 }, { steps: 20, stepMs: 16 });
			await t.sleep(400);
			const narrow = await widths();
			t.expect(Math.max(...narrow) - Math.min(...narrow) <= 1 && Math.abs(even[0] - narrow[0] - 50) < 8, `All columns: the divider narrows the three lists alike, a third of its way each: ${JSON.stringify(even)} → ${JSON.stringify(narrow)}`);
			const strokeAt = await t.oracle.rect(".tc-all-columns");
			for (let i = 0; i < 20; i++) await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: strokeAt.left + strokeAt.width / 3, y: strokeAt.top + 300, deltaX: 30, deltaY: 0 });
			await t.sleep(600);
			t.expect((await titles()).includes("Today"), "All columns: a stroke turns no day (F38)");
		}

		await pick(t.platform === "phone" ? "Columns" : "Two columns");
		t.expect(await t.cdp.eval(`!!document.querySelector(".tc-ribbon.is-twoColumns")`), "back to the ribbon");
	},
};
