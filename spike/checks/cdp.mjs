import { writeFileSync } from "node:fs";
export const PORT = 9446;
export const SHOTS = new URL("../shots/", import.meta.url).pathname;
export async function connect(match = process.env.TARGET === "popout" ? (t) => t.title.startsWith("Stack spike") : (t) => t.url.startsWith("app://obsidian.md/index.html")) {
	const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
	const target = list.find((t) => t.type === "page" && match(t));
	if (!target) throw new Error("no target: " + JSON.stringify(list.map((t) => [t.type, t.title, t.url])));
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
	let id = 0;
	const pending = new Map();
	const listeners = new Map();
	ws.onmessage = (m) => {
		const msg = JSON.parse(m.data);
		if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
		else if (msg.method) (listeners.get(msg.method) ?? []).forEach((f) => f(msg.params));
	};
	const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
	const evaluate = async (expression) => {
		const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
		if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
		return r.result.value;
	};
	const on = (method, f) => listeners.set(method, [...(listeners.get(method) ?? []), f]);
	const off = (method) => listeners.delete(method);
	const shot = async (name, clip) => {
		const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
		writeFileSync(SHOTS + name + ".png", Buffer.from(r.data, "base64"));
		return SHOTS + name + ".png";
	};
	if (process.env.TARGET === "popout") await evaluate(`window.tcSpike = window.opener.tcSpike; 1`);
	return { send, evaluate, on, off, shot, target, close: () => ws.close() };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function mouseDrag(c, from, to, { steps = 20, stepMs = 16, holdMs = 0 } = {}) {
	await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
	await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
	if (holdMs) await sleep(holdMs);
	for (let i = 1; i <= steps; i++) {
		const x = from.x + ((to.x - from.x) * i) / steps, y = from.y + ((to.y - from.y) * i) / steps;
		await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
		await sleep(stepMs);
	}
	await sleep(150);
	await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0, clickCount: 1 });
}
/** Starts a per-frame sampler of the given card ids in the page: how many elements each has, where and how visible. */
export const SAMPLER = `
window.__sample = (ids, sel = (id) => '[data-id="' + id + '"]') => {
	const out = []; const t0 = performance.now(); let run = true;
	const tick = () => {
		if (!run) return;
		const row = { t: Math.round(performance.now() - t0) };
		for (const id of ids) {
			const els = [...document.querySelectorAll(sel(id))];
			row[id + "@"] = [...document.querySelectorAll('[data-overlay="' + id + '"]')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), 1]; });
			row["tr" + id] = els[0] ? els[0].style.transform + "|" + els[0].style.transition : "";
			row[id] = els.map((e) => { const r = e.getBoundingClientRect(); let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) o *= +getComputedStyle(n).opacity; return [Math.round(r.left), Math.round(r.top), +o.toFixed(2)]; });
		}
		row.overlay = !!document.querySelector('.tcs-card.is-overlay');
		out.push(row); requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	return () => { run = false; return out; };
};`;
/** Runs `fn` under a CDP trace and gives the main thread's tasks longer than 2 ms, longest first. */
export async function traceTasks(c, fn) {
	const events = [];
	c.off("Tracing.dataCollected"); c.off("Tracing.tracingComplete");
	c.on("Tracing.dataCollected", (p) => events.push(...p.value));
	const done = new Promise((r) => c.on("Tracing.tracingComplete", r));
	await c.send("Tracing.start", { categories: "toplevel,devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing", transferMode: "ReportEvents" });
	await fn();
	await c.send("Tracing.end");
	await done;
	const main = events.find((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain" && events.some((x) => x.pid === e.pid && x.name === "RunTask"));
	const tasks = events.filter((e) => e.name === "RunTask" && e.ph === "X" && main && e.pid === main.pid && e.tid === main.tid).map((e) => +(e.dur / 1000).toFixed(1)).sort((a, b) => b - a);
	const runs = events.filter((e) => e.name === "RunTask" && e.ph === "X" && main && e.pid === main.pid && e.tid === main.tid).sort((a, b) => b.dur - a.dur).slice(0, 3);
	const inside = events.filter((e) => main && e.pid === main.pid && e.tid === main.tid && e.ph === "X" && e.name !== "RunTask");
	const breakdown = runs.map((r) => {
		const parts = {};
		for (const e of inside) if (e.ts >= r.ts && e.ts + e.dur <= r.ts + r.dur && ["Layout", "UpdateLayoutTree", "RecalculateStyles", "Paint", "PrePaint", "Layerize", "FunctionCall", "EventDispatch", "TimerFire", "FireAnimationFrame", "RunMicrotasks", "v8.callFunction", "ParseHTML", "HitTest"].includes(e.name)) parts[e.name] = +((parts[e.name] ?? 0) + e.dur / 1000).toFixed(1);
		return { ms: +(r.dur / 1000).toFixed(1), parts };
	});
	return { count: tasks.length, over16: tasks.filter((d) => d > 16).length, top: tasks.slice(0, 8), breakdown };
}
/** A CPU profile of `fn`: total time per function (self + children, by the deepest frame being under it), top entries. */
export async function profile(c, fn, top = 25) {
	await c.send("Profiler.enable");
	await c.send("Profiler.setSamplingInterval", { interval: 100 });
	await c.send("Profiler.start");
	await fn();
	const { profile: p } = await c.send("Profiler.stop");
	const byId = new Map(p.nodes.map((n) => [n.id, n]));
	const parent = new Map();
	for (const n of p.nodes) for (const ch of n.children ?? []) parent.set(ch, n.id);
	const dt = new Map();
	p.samples.forEach((s, i) => dt.set(s, (dt.get(s) ?? 0) + (p.timeDeltas[i + 1] ?? 0)));
	const self = {}, total = {};
	for (const [id, t] of dt) {
		const n = byId.get(id);
		const name = (n2) => `${n2.callFrame.functionName || "(anon)"}@${n2.callFrame.url.split("/").pop()}:${n2.callFrame.lineNumber}:${n2.callFrame.columnNumber}`;
		self[name(n)] = (self[name(n)] ?? 0) + t;
		const seen = new Set();
		for (let cur = id; cur !== undefined; cur = parent.get(cur)) { const k = name(byId.get(cur)); if (!seen.has(k)) { seen.add(k); total[k] = (total[k] ?? 0) + t; } }
	}
	const fmt = (o) => Object.entries(o).filter(([k]) => !k.startsWith("(root)") && !k.startsWith("(program)") && !k.startsWith("(idle)")).sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => `${(v / 1000).toFixed(1)}ms ${k}`);
	return { self: fmt(self), total: fmt(total) };
}
export async function click(c, p) {
	await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
	await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
	await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
}
export async function key(c, k, code, keyCode) {
	await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: keyCode });
	await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: keyCode });
}
