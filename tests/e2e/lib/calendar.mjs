/**
 * The calendar as a person reads it, for the calendar's scenarios: its hour lines and the labels on them, a task's time in
 * the tasks file, its card on the calendar by the title on it, and where to put a carried card for its top to stand on
 * an hour. Read from the screen and the file, never from the code under test.
 */

const pad = (n) => String(n).padStart(2, "0");
/** A minute from 05:00, the day's start, as the clock writes it. */
export const clock = (minute) => `${pad(Math.floor((minute + 5 * 60) / 60) % 24)}:${pad((minute + 5 * 60) % 60)}`;
/** Minutes from 05:00, the day's start, of a clock time «HH:MM». */
export const minuteOf = (time) => {
	const [h, m] = time.split(":").map(Number);
	return ((h - 5 + 24) % 24) * 60 + m;
};

export function calendarTools(t) {
	const file = () => t.cdp.eval(`window.__tcStand.fileText()`);
	return {
		file,
		/** A task's time in the file, minutes from the day's start: its start and its end (null: no length), or null without a time. */
		async timeOf(title) {
			const line = (await file()).split("\n").find((l) => l.includes(`] ${title} `) || l.endsWith(`] ${title}`));
			const m = line && /📌 \S+ (\d\d:\d\d)(?:-(\d\d:\d\d))?/u.exec(line);
			return m ? { start: minuteOf(m[1]), end: m[2] ? minuteOf(m[2]) : null } : null;
		},
		/** A task's card on the calendar by its title: its box, its id and what its corner and its dashed place write. */
		blockBy: (title) =>
			t.cdp.eval(`(() => { const el = [...document.querySelectorAll(".tc-block-card")].find((b) => b.querySelector(".tc-card-title")?.textContent === ${JSON.stringify(title)}); if (!el) return null; const r = el.getBoundingClientRect(); const corner = el.querySelector(".tc-block-meta:not(.is-hidden)"); return { id: el.dataset.block, x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 14), top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, corner: corner ? [...corner.children].map((c) => c.textContent).join(":") : null }; })()`),
		/** The y of the hour line labelled `hh` (or the minor line labelled «:30» under the hour `hh`), as drawn now. */
		lineAt: (minute) =>
			t.cdp.eval(`(() => { const hh = ${JSON.stringify(clock(minute).slice(0, 2))}; const label = document.querySelector('.tc-timeline [data-hour="' + hh + '"]'); if (!label) return null; const r = label.parentElement.querySelector(".tc-hour-line").getBoundingClientRect(); const next = label.parentElement.nextElementSibling?.querySelector(".tc-hour-line")?.getBoundingClientRect(); const hour = next ? next.top - r.top : null; const room = document.querySelector(".tc-timeline").getBoundingClientRect(); return { y: r.top + (hour ?? 0) * ${(minute % 60) / 60}, hour, x: room.left + room.width / 2, room: { top: room.top, bottom: room.bottom, left: room.left, right: room.right } }; })()`),
		/** The calendar scrolled so the line of `minute` stands `below` px under its top, as a person scrolls to where they plan. */
		scrollTo: (minute, below = 40) =>
			t.cdp.eval(`(() => { const room = document.querySelector(".tc-timeline"); const label = document.querySelector('.tc-timeline [data-hour="${clock(minute).slice(0, 2)}"]'); room.scrollTop += label.parentElement.querySelector(".tc-hour-line").getBoundingClientRect().top - room.getBoundingClientRect().top - ${below}; return 1; })()`),
		/** Where the pointer goes for a carried task's top to stand on the hour line of `minute`: its grab offset under the line. */
		async onHour(minute, grabbed) {
			const line = await this.lineAt(minute);
			return { x: line.x, y: line.y + (grabbed.y - grabbed.top) + 3 };
		},
		/** A tap (the phone) or a click (the desktop) at a point. */
		async tap(p) {
			if (t.platform === "phone") {
				await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y, id: 0 }] });
				await t.sleep(60);
				await t.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			} else {
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "none", buttons: 0 });
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
				await t.sleep(60);
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
			}
		},
		async key(key, code, vk) {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
		},
		/** A finger or the mouse pressed at `from`, moved to `to` at a hand's pace, let go: held `holdMs` first on the phone. */
		async pull(from, to, { holdMs = 0, steps = 16, stepMs = 16 } = {}) {
			const phone = t.platform === "phone";
			const at = (p, type) => (phone ? t.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: p.x, y: p.y, id: 0 }] }) : t.cdp.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 }));
			if (!phone) await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, button: "none", buttons: 0 });
			await at(from, phone ? "touchStart" : "mousePressed");
			if (holdMs) await t.sleep(holdMs);
			for (let i = 1; i <= steps; i++) {
				await at({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }, phone ? "touchMove" : "mouseMoved");
				await t.sleep(stepMs);
			}
			await t.sleep(200);
			return async () => {
				await at(to, phone ? "touchEnd" : "mouseReleased");
				await t.sleep(400);
			};
		},
		/** The words written on the dashed place of the carried task on the calendar. */
		placeTime: () => t.cdp.eval(`(() => { const el = document.querySelector(".tc-items .tc-drag-source.is-lifted .tc-slot-time"); return el && getComputedStyle(el).display !== "none" ? el.textContent : null; })()`),
	};
}
