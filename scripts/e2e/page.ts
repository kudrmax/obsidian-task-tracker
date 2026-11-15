/**
 * What the harness runs inside the test Obsidian's page, installed as `window.__e2e` after every load: the screen's
 * rows and places as boxes, the frame sampler, the rest wait. It reads the DOM as a camera does and never changes the
 * plugin. Plain JavaScript in a string, so the page gets exactly this text.
 *
 * The selectors at the top are today's screen's; the new screens (slices 3 and 4) bring theirs (`tc-n-…`) here.
 */
export const PAGE_SCRIPT = String.raw`
(() => {
	const ROWS = ".tc-card, .tc-quick-row";
	const COLUMNS = [["inbox", ".tc-inbox"], ["soon", ".tc-soon"], ["now", ".tc-left"], ["calendar", ".tc-right"]];
	const PANEL = ".tc-tree-panel";
	const DAY_TITLE = ".tc-day-nav";
	const view = () => document.querySelector(".workspace-leaf.mod-active .task-calendar") ?? document.querySelector(".task-calendar");
	const box = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
	const visible = (r, within) => r.width > 0 && r.height > 0 && r.right > within.left + 1 && r.left < within.right - 1 && r.bottom > within.top + 1 && r.top < within.bottom - 1;
	const titleOf = (el) => (el.querySelector(".tc-card-title")?.textContent ?? el.textContent ?? "").trim();

	/**
	 * A row's key, the same in every frame and every mode: the key the view gives it (\`data-row\`, the model's row key;
	 * the old screen's \`data-card\`, its task's id), or its whole title where it has neither, with a count among rows
	 * of the same base. An element keeps the key it was first given, so two rows of one title never swap numbers as they
	 * move; a key goes to another element only once its own left the DOM, so a row remounted keeps its key (and a
	 * remount that flashes shows as one row gone and back).
	 */
	const rowKeys = new WeakMap();
	const holders = new Map();
	const baseOf = (el) => el.dataset.row ?? el.dataset.card ?? titleOf(el);
	const keyFor = (el, taken) => {
		const base = baseOf(el);
		const kept = rowKeys.get(el);
		if (kept && kept.startsWith(base + "/") && !taken.has(kept)) return kept;
		const heldElsewhere = (key) => {
			const holder = holders.get(key)?.deref();
			return holder && holder !== el && holder.isConnected;
		};
		let n = 1;
		while (taken.has(base + "/" + n) || heldElsewhere(base + "/" + n)) n++;
		const key = base + "/" + n;
		rowKeys.set(el, key);
		holders.set(key, new WeakRef(el));
		return key;
	};

	/**
	 * Every visible row of the screen: its key (keyFor), its list, its box, the row before it in the DOM. A row's box
	 * takes in its own margin below: the room it claims under itself (a folded parent draws its fold there), so the gap
	 * to the next row is the list's card gap. Also the elements by key, so an animation is told to its row.
	 */
	const sampleRows = () => {
		const root = view();
		if (!root) return { rows: [], keyOf: new Map() };
		const within = root.getBoundingClientRect();
		const lists = [...root.querySelectorAll(".tc-list, .tc-rows-stack, .tc-project-group")];
		const taken = new Set();
		const found = [];
		for (const el of root.querySelectorAll(ROWS)) {
			if (el.closest(".tc-float, .tc-panel")) continue;
			const r = el.getBoundingClientRect();
			if (!visible(r, within)) continue;
			const column = COLUMNS.find(([, sel]) => el.closest(sel));
			const container = el.parentElement;
			const list = (column ? column[0] : "list") + "#" + (lists.includes(container) ? lists.indexOf(container) : "p" + lists.length);
			const key = keyFor(el, taken);
			taken.add(key);
			const below = parseFloat(getComputedStyle(el).marginBottom) || 0;
			found.push({ el, row: { key, list, x: r.left, y: r.top, w: r.width, h: r.height + below } });
		}
		const keyOf = new Map(found.map(({ el, row }) => [el, row.key]));
		return { rows: found.map(({ el, row }) => ({ ...row, prev: (el.previousElementSibling && keyOf.get(el.previousElementSibling)) ?? null })), keyOf };
	};
	const rows = () => sampleRows().rows;

	/**
	 * The ribbon's place as Max sees it: the leftmost column showing (Inbox 0, Soon 1, the day's list 2) and, on the day's
	 * list, the shown day after today (Tomorrow 3…); and how far that column stands from the stage's edge it should snap
	 * to (the view's left, or a docked panel's right). Null where the screen shows no ribbon (Rows, By project).
	 */
	const DAYS = { Yesterday: -1, Today: 0, Tomorrow: 1 };
	const place = () => {
		const root = view();
		if (!root) return null;
		const within = root.getBoundingClientRect();
		let best = null;
		COLUMNS.slice(0, 3).forEach(([name, sel], index) => {
			const el = root.querySelector(sel);
			if (!el) return;
			const r = el.getBoundingClientRect();
			if (!visible(r, within)) return;
			if (!best || r.left < best.left) best = { left: r.left, name, index };
		});
		const day = root.querySelector(DAY_TITLE)?.textContent?.trim() ?? null;
		if (!best) return { column: null, index: null, day, snapOff: null };
		const edges = [within.left];
		const panel = root.querySelector(PANEL)?.getBoundingClientRect();
		if (panel && panel.width > 0 && visible(panel, within)) edges.push(panel.right);
		const snapOff = Math.min(...edges.map((edge) => Math.abs(best.left - edge)));
		const offset = best.name === "now" ? DAYS[day] : 0;
		return { column: best.name, index: offset === undefined ? null : best.index + offset, day, snapOff };
	};

	/** The animations running, each told to the row its target is in (null for anything else). */
	const animations = (keyOf) =>
		document
			.getAnimations()
			.filter((a) => a.playState === "running")
			.map((a) => {
				const t = a.effect?.target ?? null;
				const rowEl = t && t.closest ? t.closest(ROWS) : null;
				return {
					name: a.animationName ?? a.transitionProperty ?? a.id ?? a.constructor.name,
					kind: a.constructor.name,
					state: a.playState,
					target: t ? t.tagName.toLowerCase() + (typeof t.className === "string" && t.className ? "." + t.className.split(" ").slice(0, 2).join(".") : "") : null,
					row: rowEl ? (keyOf.get(rowEl) ?? rowKeys.get(rowEl) ?? baseOf(rowEl)) : null,
				};
			});

	/** Samples every frame (rAF) until stopped: time, the animations running, the rows' boxes. Light: frame times only (the budget run). */
	const recorder = { frames: [], times: [], running: false, longTasks: [], light: false };
	const sample = () => {
		const { rows, keyOf } = sampleRows();
		return { t: performance.now(), animations: animations(keyOf), rows, place: place() };
	};
	/** Named so the budget's trace leaves the sampler's own script out (frames.ts, HARNESS.sampler). */
	const tick = function __e2eTick(t) {
		if (!recorder.running) return;
		recorder.times.push(t);
		if (!recorder.light) recorder.frames.push(sample());
		requestAnimationFrame(tick);
	};
	try {
		new PerformanceObserver((list) => {
			for (const e of list.getEntries()) recorder.longTasks.push({ t: e.startTime, ms: e.duration });
		}).observe({ type: "longtask", buffered: false });
	} catch {}

	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const same = (a, b) => a.length === b.length && a.every((r, i) => r.key === b[i].key && Math.abs(r.x - b[i].x) < 0.01 && Math.abs(r.y - b[i].y) < 0.01 && Math.abs(r.w - b[i].w) < 0.01 && Math.abs(r.h - b[i].h) < 0.01);

	window.__e2e = {
		view: () => !!view(),
		rows,
		place,
		/** The center of the first element matching the selector (and holding the text, if given), in CSS pixels of the page. */
		center(selector, text) {
			const els = [...document.querySelectorAll(selector)].filter((e) => !text || e.textContent.trim() === text);
			const el = els.find((e) => e.getBoundingClientRect().width > 0);
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
		},
		/** The key of the first row matching the selector that shows (the one a step carries), as the frames will name it. */
		keyAt(selector) {
			const el = [...document.querySelectorAll(selector)].find((e) => e.getBoundingClientRect().width > 0);
			if (!el) return null;
			const shown = new Set(sampleRows().rows.map((r) => r.key));
			return rowKeys.get(el) ?? keyFor(el, shown);
		},
		/** The texts of the elements matching a selector that show. */
		texts(selector) {
			return [...document.querySelectorAll(selector)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent.trim());
		},
		rect(selector) {
			const el = selector === "view" ? view() : document.querySelector(selector);
			if (!el) return null;
			return box(el.getBoundingClientRect());
		},
		rects(selector) {
			return [...document.querySelectorAll(selector)].map((e) => box(e.getBoundingClientRect())).filter((r) => r.w > 0 && r.h > 0);
		},
		/** Resolves true once nothing animates and the rows have stood still for three samples; false if that never came within timeoutMs. */
		async rest(timeoutMs = 6000) {
			const until = performance.now() + timeoutMs;
			let last = rows();
			let still = 0;
			while (performance.now() < until) {
				await sleep(80);
				const now = rows();
				const moving = document.getAnimations().some((a) => a.playState === "running");
				still = !moving && same(last, now) ? still + 1 : 0;
				last = now;
				if (still >= 3) return true;
			}
			return false;
		},
		/** Starts sampling every frame; light only keeps the frames' times (the budget run, which must not pay for the sampling). */
		start(light = false) {
			recorder.light = light;
			recorder.frames = [];
			recorder.times = [];
			recorder.longTasks = [];
			recorder.running = true;
			if (!light) recorder.frames.push(sample());
			requestAnimationFrame(tick);
		},
		stop() {
			recorder.running = false;
			if (!recorder.light) recorder.frames.push(sample());
			return { frames: recorder.frames, times: recorder.times, longTasks: recorder.longTasks };
		},
		cardGap() {
			const v = view();
			return v ? parseFloat(getComputedStyle(v).getPropertyValue("--tc-card-gap")) || 0 : 0;
		},
	};
	return true;
})()
`;
