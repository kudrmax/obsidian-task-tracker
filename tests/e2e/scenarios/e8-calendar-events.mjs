import { calendarTools } from "../lib/calendar.mjs";

/**
 * Overlapping events (Max, 2026-11-19, Decision 52), the clock at noon: the stand's dense evening, «Планирование квартала»
 * 19:00–20:30, «Звонок с клиентом» 19:30–20:00 and «Синк с Олей» 19:45–20:15, at the base zoom and the whole day. Read from
 * the screen: no title's text is under another event drawn over it; each event's bar begins on its start's line; where a
 * block was moved down under an earlier title, its bar runs up from the block to that line in one piece. A later block is
 * moved only as far as the earlier title's text and a 2 px micro gap need (Max, 2026-11-19, Decision 54: «после надписи
 * нам не нужен гигантский зазор. Микрозазора будет достаточно»); at 46 px an hour «Звонок с клиентом», 23 px under
 * «Планирование квартала», clears its 19 px of title and stands at its true start, where the whole line's 25 px pushed it.
 */
const DENSE = [
	["Планирование квартала", 14 * 60],
	["Звонок с клиентом", 14 * 60 + 30],
	["Синк с Олей", 14 * 60 + 45],
];

/** Each event's parts as drawn: its layer, its title's text box, its block, its bar inside the block and the stem over it. */
const PARTS = `(() => {
	const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
	return [...document.querySelectorAll(".tc-timeline .tc-items > .tc-event")].map((el) => {
		const title = el.querySelector(".tc-item-title");
		const range = document.createRange();
		range.selectNodeContents(title);
		const text = range.getBoundingClientRect();
		const shown = title.getBoundingClientRect();
		return {
			title: title.textContent,
			z: Number(el.style.getPropertyValue("--tc-stack-z")),
			text: { top: text.top, bottom: text.bottom, left: text.left, right: Math.min(text.right, shown.right) },
			line: shown.bottom,
			block: rect(el.querySelector(".tc-event-block")),
			bar: rect(el.querySelector(".tc-event-bar")),
			stem: rect(el.querySelector(".tc-event-stem")),
		};
	});
})()`;

const SLACK = 0.5;
const meets = (a, b) => a.left < b.right - SLACK && b.left < a.right - SLACK && a.top < b.bottom - SLACK && b.top < a.bottom - SLACK;

export default {
	name: "e8-calendar-events",
	features: ["E3: overlapping events in lanes, every title readable, each bar from its event's start (Decision 52), a micro gap under a title (Decision 54)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(() => { localStorage.clear(); return 1; })()`);
		await t.open();
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		await cal.scrollTo(13 * 60 + 30, 30);
		await t.sleep(300);
		await check(t, cal, "base zoom");
		await t.shot("events-base");

		const room = await t.cdp.eval(`(() => { const r = document.querySelector(".tc-timeline").getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()`);
		await zoomOut(t, room);
		const hour = Number(await t.cdp.eval(`document.querySelector(".tc-timeline").dataset.hourPx`));
		t.expect(hour < 40, `zoomed out to the whole day: ${hour} px an hour`);
		await check(t, cal, "whole day");
		await t.shot("events-whole-day");

		await t.cdp.eval(`(() => { localStorage.setItem("task-calendar-stand:device", JSON.stringify({ zoom: 46 })); return 1; })()`);
		await t.open();
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const at46 = Number(await t.cdp.eval(`document.querySelector(".tc-timeline").dataset.hourPx`));
		t.expect(at46 === 46, `opened at 46 px an hour: ${at46}`);
		await cal.scrollTo(13 * 60 + 30, 30);
		await t.sleep(300);
		await check(t, cal, "46 px an hour");
		const call = (await t.cdp.eval(PARTS)).find((p) => p.title === "Звонок с клиентом");
		const line = await cal.lineAt(DENSE[1][1]);
		t.expect(call && !call.stem && Math.abs(call.block.top - (line.y + 1)) <= 1, `46 px an hour: «Звонок с клиентом» clears the earlier title's text and stands at its true start: ${JSON.stringify(call?.block)} against ${line.y}`);
		await t.shot("events-46");
	},
};

async function check(t, cal, label) {
	const parts = await t.cdp.eval(PARTS);
	const byTitle = (title) => parts.find((p) => p.title === title);
	const dense = DENSE.map(([title]) => byTitle(title));
	t.expect(
		dense.every((p) => p),
		`${label}: the dense evening is drawn: ${parts.map((p) => p.title).join(", ")}`,
	);
	if (!dense.every((p) => p)) return;
	for (const own of parts)
		for (const over of parts.filter((p) => p.z > own.z))
			for (const box of [over.block, over.stem].filter(Boolean))
				t.expect(!meets(own.text, box), `${label}: «${own.title}»'s title is not under «${over.title}»: ${JSON.stringify(own.text)} against ${JSON.stringify(box)}`);
	for (const [title, minute] of DENSE) {
		const p = byTitle(title);
		const line = await cal.lineAt(minute);
		const barTop = (p.stem ?? p.bar).top;
		t.expect(Math.abs(barTop - (line.y + 1)) <= 1, `${label}: «${title}»'s bar begins on its start's line: ${barTop} against ${line.y}`);
		t.expect(Math.abs(p.bar.top - p.block.top) <= SLACK && Math.abs(p.bar.bottom - p.block.bottom) <= SLACK, `${label}: «${title}»'s bar runs the block's height: ${JSON.stringify(p.bar)} in ${JSON.stringify(p.block)}`);
		if (p.stem)
			t.expect(Math.abs(p.stem.left - p.block.left) <= SLACK && Math.abs(p.stem.right - p.bar.right) <= SLACK && p.stem.bottom >= p.block.top - SLACK, `${label}: «${title}»'s bar runs up from its block in one piece: stem ${JSON.stringify(p.stem)}, block ${JSON.stringify(p.block)}`);
	}
	for (let i = 1; i < dense.length; i++) {
		const line = await cal.lineAt(DENSE[i][1]);
		const expected = Math.max(line.y + 1, dense[i - 1].line + 2);
		t.expect(Math.abs(dense[i].block.top - expected) <= 1, `${label}: «${DENSE[i][0]}»'s block starts at its start or 2 px under «${DENSE[i - 1][0]}»'s text, whichever is lower: ${dense[i].block.top} against ${expected}`);
	}
	const lefts = dense.map((p) => p.block.left);
	t.expect(Math.abs(lefts[1] - lefts[0] - 6) <= SLACK && Math.abs(lefts[2] - lefts[1] - 6) <= SLACK, `${label}: the cluster's lanes stand a bar and its gap apart: ${lefts}`);
	const textLefts = dense.map((p) => p.text.left);
	t.expect(Math.max(...textLefts) - Math.min(...textLefts) <= SLACK, `${label}: the cluster's titles start at one vertical: ${textLefts}`);
	t.expect(
		dense.some((p) => p.stem),
		`${label}: a block moved under an earlier title keeps its bar from its start (one of the evening is moved at this zoom)`,
	);
}

/** Zoomed out to the whole day: Ctrl + wheel on the desktop, a pinch on the phone, at the calendar's middle. */
async function zoomOut(t, p) {
	if (t.platform === "phone") {
		for (let round = 0; round < 4; round++) {
			const at = (d) => [{ x: p.x, y: p.y - d, id: 0 }, { x: p.x, y: p.y + d, id: 1 }];
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(120) });
			for (let i = 1; i <= 12; i++) {
				await t.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(120 - (90 * i) / 12) });
				await t.sleep(16);
			}
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			await t.sleep(300);
		}
	} else
		for (let i = 0; i < 30; i++) {
			await t.input.wheel(p.x, p.y, 0, 8, true);
			await t.sleep(16);
		}
	await t.sleep(700);
}
