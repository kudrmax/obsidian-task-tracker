/**
 * What the harness runs inside the test Obsidian's page, installed as `window.__e2e` after every load: the screen's
 * rows and places as boxes, the frame sampler, the rest wait. It reads the DOM as a camera does and never changes the
 * plugin. Plain JavaScript in a string, so the page gets exactly this text.
 */
export const PAGE_SCRIPT = String.raw`
(() => {
	const ROWS = ".tc-card, .tc-quick-row";
	const COLUMNS = [["inbox", ".tc-inbox"], ["soon", ".tc-soon"], ["now", ".tc-left"], ["calendar", ".tc-right"]];
	const view = () => document.querySelector(".workspace-leaf.mod-active .task-calendar") ?? document.querySelector(".task-calendar");
	const box = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
	const visible = (r, within) => r.width > 0 && r.height > 0 && r.right > within.left + 1 && r.left < within.right - 1 && r.bottom > within.top + 1 && r.top < within.bottom - 1;
	const titleOf = (el) => (el.querySelector(".tc-card-title")?.textContent ?? el.textContent ?? "").trim().slice(0, 60);

	/**
	 * Every visible row of the screen: a key (its title and its count among equals, the same in every mode), its list, its box, the row before it in
	 * the DOM. A row's box takes in its own margin below: the room it claims under itself (a folded parent draws its fold
	 * there), so the gap to the next row is the list's card gap.
	 */
	const rows = () => {
		const root = view();
		if (!root) return [];
		const within = root.getBoundingClientRect();
		const lists = [...root.querySelectorAll(".tc-list, .tc-rows-stack, .tc-project-group")];
		const seen = new Map();
		const found = [];
		for (const el of root.querySelectorAll(ROWS)) {
			if (el.closest(".tc-float, .tc-panel")) continue;
			const r = el.getBoundingClientRect();
			if (!visible(r, within)) continue;
			const column = COLUMNS.find(([, sel]) => el.closest(sel));
			const container = el.parentElement;
			const list = (column ? column[0] : "list") + "#" + (lists.includes(container) ? lists.indexOf(container) : "p" + lists.length);
			const base = titleOf(el);
			const n = (seen.get(base) ?? 0) + 1;
			seen.set(base, n);
			const below = parseFloat(getComputedStyle(el).marginBottom) || 0;
			found.push({ el, row: { key: base + "/" + n, list, x: r.left, y: r.top, w: r.width, h: r.height + below } });
		}
		const keys = new Map(found.map(({ el, row }) => [el, row.key]));
		return found.map(({ el, row }) => ({ ...row, prev: (el.previousElementSibling && keys.get(el.previousElementSibling)) ?? null }));
	};

	/**
	 * The ribbon's place as Max sees it: the leftmost column showing (Inbox 0, Soon 1, the day's list 2) and, on the day's
	 * list, the shown day after today (Tomorrow 3…). Null where the screen shows no ribbon (Rows, By project).
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
		const day = root.querySelector(".tc-day-nav")?.textContent?.trim() ?? null;
		if (!best) return { column: null, index: null, day };
		const offset = best.name === "now" ? DAYS[day] : 0;
		return { column: best.name, index: offset === undefined ? null : best.index + offset, day };
	};

	const animations = () =>
		document.getAnimations().map((a) => ({
			name: a.animationName ?? a.transitionProperty ?? a.id ?? a.constructor.name,
			kind: a.constructor.name,
			state: a.playState,
			target: (() => {
				const t = a.effect?.target;
				return t ? t.tagName.toLowerCase() + (t.className && typeof t.className === "string" ? "." + t.className.split(" ").slice(0, 2).join(".") : "") : null;
			})(),
		}));

	/** Samples every frame (rAF) until stopped: time, the animations running, the rows' boxes. */
	const recorder = { frames: [], running: false, longTasks: [], rafs: 0, light: false };
	const sample = () => ({ t: performance.now(), animations: animations().filter((a) => a.state === "running"), rows: rows(), place: place() });
	const tick = () => {
		if (!recorder.running) return;
		if (!recorder.light) recorder.frames.push(sample());
		recorder.rafs++;
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
		rows: () => rows(),
		place,
		/** The center of the first element matching the selector (and holding the text, if given), in CSS pixels of the page. */
		center(selector, text) {
			const els = [...document.querySelectorAll(selector)].filter((e) => !text || e.textContent.trim() === text);
			const el = els.find((e) => e.getBoundingClientRect().width > 0);
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
		},
		rect(selector) {
			const el = selector === "view" ? view() : document.querySelector(selector);
			if (!el) return null;
			return box(el.getBoundingClientRect());
		},
		rects(selector) {
			return [...document.querySelectorAll(selector)].map((e) => box(e.getBoundingClientRect())).filter((r) => r.w > 0 && r.h > 0);
		},
		/** Resolves once nothing animates and the rows have stood still for three samples, or after timeoutMs. */
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
		/** Starts sampling every frame; \`light\` only counts the frames (the budget run, which must not pay for the sampling). */
		start(light = false) {
			recorder.light = light;
			recorder.frames = [];
			recorder.longTasks = [];
			recorder.rafs = 0;
			recorder.running = true;
			recorder.frames.push(sample());
			requestAnimationFrame(tick);
		},
		stop() {
			recorder.running = false;
			recorder.frames.push(sample());
			return { frames: recorder.frames, longTasks: recorder.longTasks, rafs: recorder.rafs };
		},
		cardGap() {
			const v = view();
			return v ? parseFloat(getComputedStyle(v).getPropertyValue("--tc-card-gap")) || 0 : 0;
		},
	};
	return true;
})()
`;
