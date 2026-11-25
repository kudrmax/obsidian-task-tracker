/** The sources window as a person sees it: its rows' names, lines, times and tones, the caption, and where it stands. */
const windowNow = (t) =>
	t.cdp.eval(`(() => {
		const panel = document.querySelector(".tc-panel.is-sources");
		if (!panel) return null;
		const r = panel.getBoundingClientRect();
		const copy = document.querySelector(".tc-control-copy .tc-seg")?.getBoundingClientRect() ?? null;
		const rows = [...panel.querySelectorAll(".tc-source-row")].map((row) => ({ name: row.querySelector(".tc-source-name").textContent, sub: row.querySelector(".tc-source-sub").textContent, tone: [...row.classList].find((c) => c.startsWith("is-")) }));
		return { rows, caption: panel.querySelector(".tc-source-caption")?.textContent ?? null, refresh: !!panel.querySelector(".tc-source-refresh"), shown: getComputedStyle(panel).opacity === "1", mid: r.left + r.width / 2, bottom: r.bottom, copy: copy && { mid: copy.left + copy.width / 2, top: copy.top } };
	})()`);

/** The wheel as it stands on the screen. */
const wheelAt = (t) =>
	t.cdp.eval(`(() => { const r = document.querySelector(".task-calendar > .tc-seg").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top }; })()`);

const key = async (t, name, code) => {
	await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, windowsVirtualKeyCode: code === "Escape" ? 27 : 0 });
	await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: code === "Escape" ? 27 : 0 });
};

/**
 * The calendar sources window (F32, F273–F277; `docs/plugin/calendars.md` «Окно источников», the design's «Источники
 * календарей»): the wheel held still while the calendar shows opens it over the wheel, the wheel's copy standing over the
 * backdrop, the panel centred over it; a row per calendar file as the core words and tones it, the spare ones under
 * «Not in use»; Refresh now closes it. Held elsewhere, or let go before the long press, the wheel does what it always does.
 */
export default {
	name: "e33-sources",
	features: ["F32: long press on the wheel at the calendar", "F273–F277: the calendar sources window"],
	cases: ["long press at the calendar", "nowhere else", "refresh now"],
	async run(t, item) {
		/** The wheel held still, a finger or the mouse, then let go. */
		const hold = async (p, ms = 600) => {
			if (t.platform === "phone") await t.input.swipe(p, p, { steps: 1, holdMs: ms });
			else await t.input.drag(p, p, { steps: 1, holdMs: ms });
		};
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		await t.setStop("calendar");
		await t.sleep(600);

		if (item === "long press at the calendar") {
			const wheel = await wheelAt(t);
			/** Held on Soon's icon, the neighbour out of the window: a tap there would turn the ribbon, a long press must not. */
			const soon = await t.cdp.eval(`(() => { const e = [...document.querySelectorAll(".task-calendar > .tc-seg .tc-seg-view .tc-seg-icon")].find((e) => e.getAttribute("aria-label") === "Soon"); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			await hold(soon);
			const open = await t.waitFor(async () => {
				const w = await windowNow(t);
				return w?.shown ? w : null;
			});
			t.expect(!!open, "held still at the calendar, the wheel opens the sources window, and it stays open once let go");
			if (!open) return;
			t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Today"]), `the press turned nothing: ${JSON.stringify(await t.oracle.columns())}`);
			const names = open.rows.map((row) => row.name);
			t.expect(names.includes("Google Calendar") && names.includes("Work calendar") && names.includes("iPhone calendars"), `a row per calendar file: ${JSON.stringify(names)}`);
			t.expect(open.caption === "Not in use" && open.rows.filter((row) => row.tone === "is-spare").length >= 1, `the spare files under «Not in use»: ${JSON.stringify(open)}`);
			t.expect(open.refresh, "Refresh now at its foot");
			t.expect(open.copy !== null && Math.abs(open.copy.mid - wheel.x) <= 1 && Math.abs(open.copy.top - wheel.top) <= 1, `the wheel's copy stands where the wheel does: ${JSON.stringify(open.copy)} against ${JSON.stringify(wheel)}`);
			t.expect(Math.abs(open.mid - wheel.x) <= 1, `the panel stands over the wheel, centred on it as the window allows: ${open.mid} against ${wheel.x}`);
			t.expect(open.bottom <= wheel.top, `the panel is over the wheel: ${open.bottom} over ${wheel.top}`);
			await t.sleep(700);
			t.expect((await windowNow(t))?.shown === true, "it is still open a moment after the press was let go");
			await t.shot("sources");
			if (t.platform === "desktop") {
				await key(t, "Escape", "Escape");
				t.expect(await t.waitFor(async () => (await windowNow(t)) === null, 1500), "Escape closes it");
			} else {
				await tap({ x: 20, y: 80 });
				t.expect(await t.waitFor(async () => (await windowNow(t)) === null, 1500), "a tap on the backdrop closes it");
			}
			await tap(soon);
			t.expect(JSON.stringify(await t.waitFor(async () => JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Soon", "Today"]) || null, 2000)) === "true", "after the window, a tap on Soon turns the ribbon again");
		}

		if (item === "nowhere else") {
			await t.setStop("soon");
			await t.sleep(400);
			await hold(await wheelAt(t));
			await t.sleep(300);
			t.expect((await windowNow(t)) === null, "held at Soon: no window");
			await t.setStop("calendar");
			await t.sleep(400);
			const wheel = await wheelAt(t);
			await tap(wheel);
			await t.sleep(400);
			t.expect((await windowNow(t)) === null, "a tap is no long press: no window");
		}

		if (item === "refresh now") {
			await hold(await wheelAt(t));
			t.expect(!!(await t.waitFor(async () => (await windowNow(t))?.shown, 2000)), "the window opened");
			const refresh = await t.oracle.rect(".tc-panel.is-sources .tc-source-refresh");
			await tap({ x: refresh.left + refresh.width / 2, y: refresh.top + refresh.height / 2 });
			t.expect(await t.waitFor(async () => (await windowNow(t)) === null, 1500), "Refresh now closes the window");
			t.expect((await t.stand("notices()")).length === 0, `and shows no failure: ${JSON.stringify(await t.stand("notices()"))}`);
		}
	},
};
