import { calendarTools } from "../lib/calendar.mjs";

/**
 * E3, a task's length by its dots (the design's «Выделение и длительность»; F102–F106), the clock at noon: a tap on a task
 * opens its menu and selects it, two dots on its edges, over the menu's backdrop; a dot pulled while the menu is open
 * closes the menu; the menu closed by its backdrop or Escape, the selection stays. The bottom dot pulled an hour down ends
 * it an hour later, the moving edge's time on a pill as it goes, by the snap step; shrunk to a card and its gap a task
 * loses its length. A task without a length: its top dot pulled down or up a little writes nothing, pulled up enough its
 * old start becomes its end. A task riding the now line keeps its start in the file and ends where let go. A pull the
 * browser cancels writes nothing. A long press on a task, unmoved, selects it with its menu (F106). A tap elsewhere lets
 * the selection go.
 */
export default {
	name: "e8-calendar-resize",
	features: ["E3: select a task, resize by the dots with the snap (F102–F106)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		const hourPx = Number(await t.cdp.eval(`document.querySelector(".tc-timeline").dataset.hourPx`));
		await cal.scrollTo(6 * 60, 20);
		await t.sleep(300);
		const grip = (edge) => t.cdp.eval(`(() => { const g = document.querySelector('.tc-pinned:not(.is-hidden) [data-grip="${edge}"]'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		const menu = () => t.cdp.eval(`!!document.querySelector(".tc-menu-layer .tc-panel:not(.is-closing)")`);
		/** Taps a task: its menu opens and its dots show. */
		const open = async (title) => {
			/** High on the calendar, so the menu's block stands right over the task and its dots stay (Decision 120: a lifted block's dots go). */
			await t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-block]")].find((b) => b.textContent.includes(${JSON.stringify(title)})); el.scrollIntoView({ block: "start" }); return 1; })()`);
			await t.sleep(300);
			const block = await cal.blockBy(title);
			await cal.tap({ x: block.x, y: block.y });
			await t.sleep(400);
			return menu();
		};
		/** Closes the menu only: Escape on the desktop, a tap on the backdrop on the phone. */
		const close = async () => {
			if (t.platform === "phone") await cal.tap({ x: 8, y: 8 });
			else await cal.key("Escape", "Escape", 27);
			await t.sleep(400);
		};

		t.expect(await open("Обед"), "a tap on a task on the calendar opens its menu");
		t.expect((await grip("start")) !== null && (await grip("end")) !== null, "with the menu open, the task's two dots show over its backdrop");
		await t.shot("selected");
		/** F103: a dot pulled while the menu is open closes the menu. */
		const end = await grip("end");
		const release = await cal.pull(end, { x: end.x, y: end.y + hourPx + 3 });
		const pill = await t.cdp.eval(`(() => { const p = document.querySelector(".tc-block.is-resizing .tc-block-pill"); return p && getComputedStyle(p).display !== "none" ? p.textContent : null; })()`);
		const menuWhilePulled = await menu();
		await t.shot("resizing");
		await release();
		const lunch = await cal.timeOf("Обед");
		t.expect(!menuWhilePulled, "a dot pulled closes the menu (F103)");
		t.expect(lunch?.start === 9 * 60 && lunch?.end === 11 * 60, `the bottom dot an hour down: it ends an hour later, its start kept: ${JSON.stringify(lunch)}`);
		t.expect(pill === "16:00", `while pulled, the moving edge's time on a pill: «${pill}»`);

		await open("Обед");
		await close();
		t.expect((await grip("end")) !== null && !(await menu()), `the menu closed by ${t.platform === "phone" ? "a tap on its backdrop" : "Escape"}, the task stays selected`);
		const shrink = await grip("end");
		const back = await cal.pull(shrink, { x: shrink.x, y: shrink.y - 1.5 * hourPx });
		await back();
		t.expect((await cal.timeOf("Обед"))?.end === null, `shrunk to a card and its gap, it loses its length: ${JSON.stringify(await cal.timeOf("Обед"))}`);

		/** Review 1: a task without a length, its top dot pulled down, or up short of the minimum, writes nothing. */
		await open("Позвонить в банк");
		await close();
		const unchanged = await cal.file();
		const down = await grip("start");
		await (await cal.pull(down, { x: down.x, y: down.y + 2 * hourPx }))();
		const little = await grip("start");
		await (await cal.pull(little, { x: little.x, y: little.y - hourPx / 4 - 2 }))();
		t.expect((await cal.file()) === unchanged, `a task without a length: its top dot pulled down, or up a little, writes nothing: ${JSON.stringify(await cal.timeOf("Позвонить в банк"))}`);
		const top = await grip("start");
		await (await cal.pull(top, { x: top.x, y: top.y - hourPx - 2 }))();
		const bank = await cal.timeOf("Позвонить в банк");
		t.expect(bank?.start === 8 * 60 + 30 && bank?.end === 9 * 60 + 30, `pulled up enough by its top dot: the start earlier, the old start its end: ${JSON.stringify(bank)}`);

		await open("Прошедшая по времени");
		await close();
		const lateEnd = await grip("end");
		await (await cal.pull(lateEnd, { x: lateEnd.x, y: lateEnd.y + hourPx + 3 }))();
		const late = await cal.timeOf("Прошедшая по времени");
		t.expect(late?.start === 6 * 60 + 15 && late.end !== null && late.end - late.start >= 80, `a task riding the now line pulled by its bottom dot: its start in the file kept, longer: ${JSON.stringify(late)}`);

		/** Review 3: a pull the browser cancels (a finger's touchcancel) writes nothing and puts the task back. */
		if (t.platform === "phone") {
			const before = await cal.file();
			const g = await grip("end");
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g.x, y: g.y, id: 0 }] });
			for (let i = 1; i <= 10; i++) {
				await t.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: g.x, y: g.y + i * 8, id: 0 }] });
				await t.sleep(16);
			}
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
			await t.sleep(500);
			const pills = await t.cdp.eval(`document.querySelectorAll(".tc-block.is-resizing").length`);
			t.expect((await cal.file()) === before && pills === 0, `a cancelled pull writes nothing and ends: ${pills} still resizing`);
		}

		const empty = await cal.lineAt(16 * 60);
		await cal.tap({ x: empty.room.left + 40, y: empty.y + 10 });
		await t.sleep(300);
		t.expect((await grip("start")) === null, "a tap elsewhere lets the selection go");

		/** F106: a long press on a task, let go unmoved, selects it with its menu; high on the calendar, so the menu's block stands over it and its dots stay (Decision 120). */
		await t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-block]")].find((b) => b.textContent.includes("Ревью дизайна")); el.scrollIntoView({ block: "start" }); return 1; })()`);
		await t.sleep(300);
		const review = await cal.blockBy("Ревью дизайна");
		if (t.platform === "phone") {
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: review.x, y: review.y, id: 0 }] });
			await t.sleep(450);
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		} else {
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: review.x, y: review.y, button: "none", buttons: 0 });
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: review.x, y: review.y, button: "left", buttons: 1, clickCount: 1 });
			await t.sleep(450);
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: review.x, y: review.y, button: "left", buttons: 0, clickCount: 1 });
		}
		await t.sleep(500);
		t.expect((await menu()) && (await grip("start")) !== null, "a long press on a task, unmoved, selects it with its menu (F106)");
	},
};
