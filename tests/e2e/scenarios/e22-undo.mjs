import { cardBy } from "../lib/carry.mjs";
import { frameFaults, stepsOf, trackOf } from "../lib/frames.mjs";
import { menuButton } from "../lib/menu.mjs";

/**
 * E2, Undo (F267, F268, F269; docs/plugin/tasks.md «Отмена»; the design's «Отмена»; Decision 132): the capsule opposite
 * the plus takes the screen's last action back, its icon dim while there is none. A task done comes back where it stood,
 * fading in as the cards under it glide aside; a task sent to another list glides back to its place; a task done on the
 * calendar fades back in where it stood. On the Mac ⌘Z does what the button does. An edit from outside is not the
 * screen's to take back. The tasks file says what happened.
 */
const SEEN = 0.1;
const WHOLE = 0.9;

export default {
	name: "e22-undo",
	features: ["E2: cards returning by Undo (F267, F268, F269)"],
	cases: ["done", "moved", "calendar", "outside"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const press = async (words) => {
			const at = await menuButton(t, words);
			if (t.expect(at !== null, `the menu shows «${words}»`)) await tap(at);
			await t.sleep(300);
		};
		const dim = () => t.cdp.eval(`document.querySelector(".task-calendar > .tc-capsule .tc-undo").classList.contains("is-off")`);
		/** Undo as a person reaches it: ⌘Z on the Mac, the button on the phone. */
		const undo = async () => {
			if (t.platform === "desktop") {
				await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 4 });
				await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 4 });
			} else await tap(await t.oracle.rect(".task-calendar > .tc-capsule .tc-undo"));
		};
		t.expect(await dim(), "Undo is dim while there is nothing to take back");

		if (item === "outside") {
			await t.stand(`addFromOutside("now", "Пришла со стороны")`);
			await t.sleep(400);
			t.expect(await dim(), "an edit from outside is not the screen's to take back");
			const button = await t.oracle.rect(".task-calendar > .tc-capsule .tc-undo");
			await tap(button);
			await t.sleep(500);
			t.expect((await t.oracle.cards("day"))[0] === "Пришла со стороны", "a tap on the dim Undo changes nothing");
			await tap(await t.oracle.rect(".task-calendar > button.tc-plus"));
			await t.sleep(500);
			t.expect(await t.cdp.eval(`!document.querySelector(".task-calendar > .tc-capsule").checkVisibility({ visibilityProperty: true })`), "the capsule hides with the plus while a task is typed");
			return;
		}

		if (item === "calendar") {
			const title = await t.cdp.eval(`[...document.querySelectorAll(".tc-block-card .tc-card-title")].map((e) => e.textContent).find((text) => text)`);
			const block = async () => t.cdp.eval(`(() => { const el = [...document.querySelectorAll(".tc-block-card")].find((b) => b.querySelector(".tc-card-title")?.textContent === ${JSON.stringify(title)}); if (!el) return null; const r = el.getBoundingClientRect(); return { id: el.dataset.block, x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 14), top: r.top, left: r.left }; })()`);
			const at = await block();
			await tap(at);
			await t.sleep(400);
			await press("Done");
			await t.sleep(600);
			t.expect((await block()) === null, "a task done leaves the calendar");
			const frames = await t.record(undo, { cast: "calendar-undo", settleMs: 900 });
			const back = await block();
			t.expect(back !== null && Math.abs(back.top - at.top) < 1 && Math.abs(back.left - at.left) < 1, `Undo puts it back where it stood: ${JSON.stringify(back)} for ${JSON.stringify(at)}`);
			const fades = trackOf(frames, at.id).filter(Boolean).map((b) => b.o);
			t.expect(fades.some((o) => o > SEEN && o < WHOLE), `it fades back in, never appearing in a frame: ${JSON.stringify(fades.slice(0, 12))}`);
			const faults = frameFaults(frames, { maxStep: 40 });
			t.expect(faults.length === 0, `frames of Undo on the calendar: ${JSON.stringify(faults.slice(0, 3))}`);
			return;
		}

		if (item === "done") {
			const [, leaving, under] = await t.oracle.cards("day");
			const leavingAt = await cardBy(t, leaving, "day");
			const underAt = await cardBy(t, under, "day");
			await tap(leavingAt);
			await t.sleep(400);
			await press("Done");
			await t.sleep(700);
			t.expect(!(await dim()), "Undo has a step to take back");
			const frames = await t.record(undo, { cast: "done-undo", settleMs: 900 });
			t.expect((await t.oracle.cards("day"))[1] === leaving, `Undo brings it back where it stood: ${JSON.stringify((await t.oracle.cards("day")).slice(0, 3))}`);
			t.expect((await t.file()).split("\n").some((l) => l.startsWith(`- [ ] ${leaving}`)), "the file has it open again");
			const fades = trackOf(frames, leavingAt.id).filter(Boolean).map((c) => c.o);
			t.expect(fades.some((o) => o > SEEN && o < WHOLE), `it fades back in, never appearing in a frame: ${JSON.stringify(fades.slice(0, 12))}`);
			const down = trackOf(frames, underAt.id).filter(Boolean).map((c) => c.y);
			t.expect(stepsOf(down, 1) >= 3 && Math.abs(down.at(-1) - underAt.top) < 1, `the card under it glides aside to its old place: ${JSON.stringify(down)}`);
			const faults = frameFaults(frames, { maxStep: 40 });
			t.expect(faults.length === 0, `frames of Undo: ${JSON.stringify(faults.slice(0, 3))}`);
			t.expect(await dim(), "nothing left to take back: Undo is dim again");
			return;
		}

		await t.stand(`step("step-two-columns")`);
		await t.sleep(600);
		const moving = (await t.oracle.cards("inbox"))[2];
		const movingAt = await cardBy(t, moving, "inbox");
		await tap(movingAt);
		await t.sleep(400);
		await press("Pick a date");
		await press("Soon");
		await t.sleep(700);
		t.expect((await t.oracle.cards("soon")).at(-1) === moving, `sent to Soon, it stands at Soon's end: ${JSON.stringify(await t.oracle.cards("soon"))}`);
		const frames = await t.record(undo, { cast: "moved-undo", settleMs: 900 });
		t.expect((await t.oracle.cards("inbox"))[2] === moving && !(await t.oracle.cards("soon")).includes(moving), `Undo takes it back to its place: ${JSON.stringify((await t.oracle.cards("inbox")).slice(0, 4))}`);
		const xs = trackOf(frames, movingAt.id).filter(Boolean).map((c) => c.x);
		t.expect(stepsOf(xs, -1) >= 3 && Math.abs(xs.at(-1) - movingAt.left) < 1, `it glides back from Soon, never vanishing: ${JSON.stringify(xs)}`);
		const faults = frameFaults(frames, { maxStep: 400 });
		t.expect(faults.length === 0, `frames of Undo of a move: ${JSON.stringify(faults.slice(0, 3))}`);
	},
};
