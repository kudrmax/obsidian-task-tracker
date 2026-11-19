import { calendarTools } from "../lib/calendar.mjs";

/**
 * E3, a task's length by its dots (the design's «Выделение и длительность»; F102–F105), the clock at noon: a tap on a task
 * opens its menu and selects it, two dots on its edges; the menu closed, the selection stays; the bottom dot pulled an hour
 * down ends it an hour later, the moving edge's time on a pill as it goes, by the snap step; the top dot of a task
 * without a length pulled up gives it one, its old start its end; shrunk to the minimum a task loses its length; a task
 * riding the now line keeps its start in the file and ends where let go; a tap elsewhere lets the selection go.
 */
export default {
	name: "e8-calendar-resize",
	features: ["E3: select a task, resize by the dots with the snap (F102–F105)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		const hourPx = Number(await t.cdp.eval(`document.querySelector(".tc-timeline").dataset.hourPx`));
		await cal.scrollTo(6 * 60, 20);
		await t.sleep(300);
		const grip = (edge) => t.cdp.eval(`(() => { const g = document.querySelector('.tc-grips [data-grip="${edge}"]'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		/** Selects a task: a tap opens its menu and shows its dots; Escape (the desktop) or a tap on the backdrop (the phone) closes the menu only. */
		const select = async (title) => {
			const block = await cal.blockBy(title);
			await cal.tap({ x: block.x, y: block.y });
			await t.sleep(400);
			const menu = await t.cdp.eval(`!!document.querySelector(".tc-floating-menu")`);
			if (t.platform === "phone") await cal.tap({ x: 8, y: 8 });
			else await cal.key("Escape", "Escape", 27);
			await t.sleep(400);
			return menu;
		};

		t.expect(await select("Обед"), "a tap on a task on the calendar opens its menu");
		t.expect((await grip("start")) !== null && (await grip("end")) !== null, "the menu closed, the task stays selected: its two dots show");
		await t.shot("selected");
		const end = await grip("end");
		const release = await cal.pull(end, { x: end.x, y: end.y + hourPx + 3 });
		const pill = await t.cdp.eval(`(() => { const p = document.querySelector(".tc-block.is-resizing .tc-block-pill"); return p && getComputedStyle(p).display !== "none" ? p.textContent : null; })()`);
		await t.shot("resizing");
		await release();
		const lunch = await cal.timeOf("Обед");
		t.expect(lunch?.start === 9 * 60 && lunch?.end === 11 * 60, `the bottom dot an hour down: it ends an hour later, its start kept: ${JSON.stringify(lunch)}`);
		t.expect(pill === "16:00", `while pulled, the moving edge's time on a pill: «${pill}»`);

		const shrink = await grip("end");
		const back = await cal.pull(shrink, { x: shrink.x, y: shrink.y - 2 * hourPx + 10 });
		await back();
		t.expect((await cal.timeOf("Обед"))?.end === null, `shrunk to the minimum, it loses its length: ${JSON.stringify(await cal.timeOf("Обед"))}`);

		await select("Позвонить в банк");
		const top = await grip("start");
		const up = await cal.pull(top, { x: top.x, y: top.y - hourPx - 2 });
		await up();
		const bank = await cal.timeOf("Позвонить в банк");
		t.expect(bank?.start === 8 * 60 + 30 && bank?.end === 9 * 60 + 30, `a task without a length pulled up by its top dot: the start earlier, the old start its end: ${JSON.stringify(bank)}`);

		await select("Прошедшая по времени");
		const lateEnd = await grip("end");
		const longer = await cal.pull(lateEnd, { x: lateEnd.x, y: lateEnd.y + hourPx + 3 });
		await longer();
		const late = await cal.timeOf("Прошедшая по времени");
		t.expect(late?.start === 6 * 60 + 15 && late.end !== null && late.end - late.start >= 80, `a task riding the now line pulled by its bottom dot: its start in the file kept, longer: ${JSON.stringify(late)}`);

		const empty = await cal.lineAt(16 * 60);
		await cal.tap({ x: empty.room.left + 40, y: empty.y + 10 });
		await t.sleep(300);
		t.expect((await grip("start")) === null, "a tap elsewhere lets the selection go");
	},
};
