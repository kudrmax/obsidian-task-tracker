/** The wheel's icons as a person sees them: each icon's name, whether it stands inside the window (the pill), and its centre. */
const wheelNow = (t) =>
	t.cdp.eval(`(() => {
		const wheel = document.querySelector(".task-calendar > .tc-seg");
		if (!wheel) return null;
		const pill = wheel.querySelector(".tc-seg-pill").getBoundingClientRect();
		const track = wheel.getBoundingClientRect();
		const icons = [...wheel.querySelectorAll(".tc-seg-view .tc-seg-icon")].map((e) => { const r = e.getBoundingClientRect(); return { name: e.getAttribute("aria-label"), x: r.left + r.width / 2, y: r.top + r.height / 2, seen: r.left + r.width / 2 > track.left && r.left + r.width / 2 < track.right, inWindow: r.left + r.width / 2 > pill.left && r.left + r.width / 2 < pill.right }; });
		return { window: icons.filter((i) => i.inWindow).map((i) => i.name), seen: icons.filter((i) => i.seen).map((i) => i.name), icons, track: { left: track.left, right: track.right, top: track.top, y: track.top + track.height / 2, x: track.left + track.width / 2 }, pillMid: pill.left + pill.width / 2 };
	})()`);

/** The ribbon's columns once it stands: what a person reads over them. */
const columns = async (t) => {
	await t.sleep(800);
	return JSON.stringify(await t.oracle.columns());
};

/**
 * The wheel (F28–F30; the design's «Колёсико»; `docs/plugin/screen.md` «Колёсико»): four icons, a window two wide in the
 * middle showing which two columns are on the screen, the track holding one neighbour either side where there is one; it
 * turns with the ribbon. A tap on an icon out of the window turns the ribbon to the nearest place showing it; a quick
 * swipe turns the wheel exactly one place however far the finger goes, a slow one freely to the nearest; the columns slide
 * once it is let go.
 */
export default {
	name: "e30-wheel",
	features: ["F28–F30: the wheel at the bottom centre"],
	cases: ["window and taps", "swipes", "follows the ribbon"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const iconOf = async (name) => (await wheelNow(t)).icons.find((i) => i.name === name);
		/** A finger or the mouse along the wheel by `dx` over `ms`. */
		const drag = async (dx, ms) => {
			const { track } = await wheelNow(t);
			const from = { x: track.x, y: track.y };
			const steps = Math.max(4, Math.round(ms / 16));
			if (t.platform === "phone") await t.input.swipe(from, { x: from.x + dx, y: from.y }, { steps, stepMs: ms / steps });
			else await t.input.drag(from, { x: from.x + dx, y: from.y }, { steps, stepMs: ms / steps });
		};
		await t.setStop("calendar");
		const view = await t.oracle.rect(".task-calendar");

		if (item === "window and taps") {
			const at = await wheelNow(t);
			t.expect(at && JSON.stringify(at.window) === JSON.stringify(["Now", "Calendar"]), `at the calendar the window holds Now and the calendar: ${JSON.stringify(at?.window)}`);
			t.expect(JSON.stringify(at.seen) === JSON.stringify(["Soon", "Now", "Calendar"]), `the track holds one neighbour, Soon, and nothing past the calendar: ${JSON.stringify(at.seen)}`);
			if (t.platform === "desktop") t.expect(Math.abs(at.pillMid - (view.left + view.width / 2)) <= 1, `the window stands in the middle of the screen: ${at.pillMid}`);
			await tap(await iconOf("Soon"));
			t.expect((await columns(t)) === JSON.stringify(["Soon", "Today"]), `a tap on Soon: Soon and the day's list: ${await columns(t)}`);
			const soon = await wheelNow(t);
			t.expect(JSON.stringify(soon.window) === JSON.stringify(["Soon", "Now"]) && JSON.stringify(soon.seen) === JSON.stringify(["Inbox", "Soon", "Now", "Calendar"]), `the window on Soon and Now, a neighbour either side: ${JSON.stringify(soon)}`);
			if (t.platform === "desktop") t.expect(Math.abs(soon.pillMid - at.pillMid) <= 1, "the window stood still while the icons rolled under it");
			await tap(await iconOf("Inbox"));
			t.expect((await columns(t)) === JSON.stringify(["Inbox", "Soon"]), `a tap on Inbox: Inbox and Soon: ${await columns(t)}`);
			await tap(await iconOf("Soon"));
			t.expect((await columns(t)) === JSON.stringify(["Inbox", "Soon"]), "a tap on an icon in the window changes nothing");
			t.expect(!(await wheelNow(t)).seen.includes("Calendar"), "at Inbox the calendar's icon is past the track's end");
			await tap(await iconOf("Now"));
			t.expect((await columns(t)) === JSON.stringify(["Soon", "Today"]), `a tap on Now from Inbox: the nearest place that shows it, Soon and the day: ${await columns(t)}`);
			await tap(await iconOf("Calendar"));
			t.expect((await columns(t)) === JSON.stringify(["Today"]) && JSON.stringify((await wheelNow(t)).window) === JSON.stringify(["Now", "Calendar"]), `a tap on the calendar: the day and its calendar: ${await columns(t)}`);
		}

		if (item === "swipes") {
			await drag(160, 90);
			t.expect((await columns(t)) === JSON.stringify(["Soon", "Today"]), `a quick swipe right, however far: one place back: ${await columns(t)}`);
			await drag(-160, 90);
			t.expect((await columns(t)) === JSON.stringify(["Today"]), `a quick swipe left: one place on: ${await columns(t)}`);
			await drag(2 * 38 + 8, 1600);
			t.expect((await columns(t)) === JSON.stringify(["Inbox", "Soon"]), `a slow drag over two icons: two places, settled on the nearest: ${await columns(t)}`);
			const settled = await wheelNow(t);
			t.expect(JSON.stringify(settled.window) === JSON.stringify(["Inbox", "Soon"]), `the wheel settles with the ribbon: ${JSON.stringify(settled.window)}`);
		}

		if (item === "follows the ribbon") {
			await t.setStop("inbox");
			await t.sleep(400);
			t.expect(JSON.stringify((await wheelNow(t)).window) === JSON.stringify(["Inbox", "Soon"]), "the ribbon turned elsewhere: the wheel turns with it");
			await t.setStop("soon");
			await t.sleep(400);
			t.expect(JSON.stringify((await wheelNow(t)).window) === JSON.stringify(["Soon", "Now"]), "and on");
		}
		await t.shot(`wheel-${item.replaceAll(" ", "-")}`);
	},
};
