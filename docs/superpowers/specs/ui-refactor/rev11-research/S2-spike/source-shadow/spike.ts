// Throwaway performance spike (S2): not part of the harness.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openBlock } from "./block";
import { traced } from "./budget";
import { Driver } from "./driver";
import type { Fixture } from "./fixture";
import type { Platform, TestObsidian } from "./obsidian";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Ev = { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: { name?: string; data?: { message?: string } } };

const GROUPS: Record<string, string[]> = {
	script: ["FunctionCall", "EvaluateScript", "RunMicrotasks", "TimerFire", "FireAnimationFrame", "EventDispatch"],
	style: ["UpdateLayoutTree", "RecalculateStyles", "ParseAuthorStyleSheet"],
	layout: ["Layout"],
	paint: ["PrePaint", "Paint", "Layerize", "PaintImage", "UpdateLayer", "UpdateLayerTree"],
	commit: ["Commit"],
	gc: ["MinorGC", "MajorGC", "V8.GC_SCAVENGER", "V8.GC_MARK_COMPACTOR", "BlinkGC.AtomicPhase"],
};

function union(spans: [number, number][]): number {
	const s = spans.sort((a, b) => a[0] - b[0]);
	let total = 0;
	let cur: [number, number] | null = null;
	for (const x of s) {
		if (!cur || x[0] > cur[1]) {
			if (cur) total += cur[1] - cur[0];
			cur = [x[0], x[1]];
		} else cur[1] = Math.max(cur[1], x[1]);
	}
	if (cur) total += cur[1] - cur[0];
	return total;
}

export interface TaskBreak {
	at: number;
	ms: number;
	script: number;
	style: number;
	layout: number;
	paint: number;
	commit: number;
	gc: number;
}

export function analyze(events: readonly Ev[], mark: string): { tasks: TaskBreak[]; longest: number; toPaint: number | null } {
	const mains = events.filter((e) => e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain").map((e) => `${e.pid}:${e.tid}`);
	const busiest = mains.map((id) => ({ id, n: events.filter((e) => `${e.pid}:${e.tid}` === id && e.ph === "X").length })).sort((a, b) => b.n - a.n)[0]?.id;
	const main = events.filter((e) => `${e.pid}:${e.tid}` === busiest && e.ph === "X" && e.dur !== undefined);
	const markEv = events.find((e) => e.name === "TimeStamp" && e.args?.data?.message === `sp:${mark}`);
	if (!markEv) return { tasks: [], longest: -1, toPaint: null };
	const t0 = markEv.ts;
	const runs = main.filter((e) => (e.name === "RunTask" || e.name === "ThreadControllerImpl::RunTask") && e.ts + e.dur! >= t0 && e.ts < t0 + 3_000_000);
	const top = runs.filter((e) => !runs.some((o) => o !== e && o.ts <= e.ts && o.ts + o.dur! >= e.ts + e.dur! && o.dur! > e.dur!));
	const tasks: TaskBreak[] = top
		.filter((t) => t.dur! >= 1000)
		.map((t) => {
			const within = main.filter((e) => e.ts >= t.ts && e.ts + e.dur! <= t.ts + t.dur!);
			const g = (names: string[]) => union(within.filter((e) => names.includes(e.name)).map((e) => [e.ts, e.ts + e.dur!] as [number, number])) / 1000;
			const style = g(GROUPS.style);
			const layout = g(GROUPS.layout);
			const scriptAll = g(GROUPS.script);
			const forced = union(within.filter((e) => [...GROUPS.style, ...GROUPS.layout].includes(e.name) && within.some((s) => GROUPS.script.includes(s.name) && s.ts <= e.ts && s.ts + s.dur! >= e.ts + e.dur!)).map((e) => [e.ts, e.ts + e.dur!] as [number, number])) / 1000;
			const r = (x: number) => +x.toFixed(2);
			return { at: r((t.ts - t0) / 1000), ms: r(t.dur! / 1000), script: r(scriptAll - forced), style: r(style), layout: r(layout), paint: r(g(GROUPS.paint)), commit: r(g(GROUPS.commit)), gc: r(g(GROUPS.gc)) };
		});
	const commit = main.filter((e) => e.name === "Commit" && e.ts >= t0).sort((a, b) => a.ts - b.ts)[0];
	return { tasks, longest: Math.max(0, ...tasks.map((t) => t.ms)), toPaint: commit ? +((commit.ts + commit.dur! - t0) / 1000).toFixed(2) : null };
}

const part2Name = (f: string) => (process.env.SPIKE_PART ? `part${process.env.SPIKE_PART}-${f}` : f);

export async function spike(obsidian: TestObsidian, fx: Fixture, run: string, out: string, root: string): Promise<void> {
	const ev = <T = unknown>(body: string, ms = 60_000) => obsidian.cdp.eval<T>(body, ms);
	const lines: string[] = [];
	const raw: Record<string, unknown> = {};
	const say = (s: string) => {
		console.log(s);
		lines.push(s);
	};
	const page = readFileSync(join(root, "scripts", "e2e", "spikePage.js"), "utf8");
	for (const platform of ["desktop", "phone"] as Platform[]) {
		await obsidian.reset(platform, "dark", { path: fx.tasksFile, text: fx.tasks });
		const d = new Driver(obsidian, platform, "dark", { baselines: join(run, "unused"), run }, false);
		await d.install();
		await openBlock(d, true);
		await ev(`${page}\nreturn true`);
		say(`\n## ${platform}`);
		say(`saved rows: ${JSON.stringify(await ev("return __sp.save('rows')"))}`);
		await d.tapOn(".tc-n-block .tc-n-view-btn");
		await sleep(500);
		await d.tapOn(".tc-n-panel .tc-n-menu-label", "By project");
		await sleep(800);
		await ev("return __e2e.rest()");
		say(`saved byProject: ${JSON.stringify(await ev("return __sp.save('byProject')"))}`);
		await ev("return __sp.host()");
		const cdp = obsidian.cdp;
		const measure = async (label: string, mark: string, expr: string) => {
			let result: unknown;
			const events = (await traced(obsidian, async () => {
				result = await ev(`return await ${expr}`, 60_000);
				await sleep(400);
			})) as Ev[];
			const a = analyze(events, mark);
			raw[`${platform}/${label}`] = { result, ...a };
			const big = a.tasks.filter((t) => t.ms >= 2).map((t) => `[+${t.at} ${t.ms}ms s${t.script} st${t.style} l${t.layout} p${t.paint} c${t.commit} gc${t.gc}]`).join(" ");
			say(`${label}: longest ${a.longest} ms, event→commit ${a.toPaint} ms; in-page ${JSON.stringify(result)}\n    tasks≥2ms: ${big}`);
			return a;
		};
		const shot = async (name: string) => {
			const s = await cdp.call<{ data: string }>("Page.captureScreenshot", { format: "png" });
			mkdirSync(join(out, "shots"), { recursive: true });
			writeFileSync(join(out, "shots", part2Name(`${platform}-${name}.png`)), Buffer.from(s.data, "base64"));
		};
		say(`geometry: ${JSON.stringify(await ev("await __sp.cold('byProject','warm'); return __sp.cardsInView()"))}`);
		await shot("cold-byProject");
		await cdp.call("Emulation.setCPUThrottlingRate", { rate: 4 });
		const part2 = process.env.SPIKE_PART === "2";
		const part3 = process.env.SPIKE_PART === "3";
		try {
			if (process.env.SPIKE_PART === "3") {
				say("### 7. a day swipe: the neighbour already drawn beside, the ribbon slid by transform over 300 ms");
				for (const [label, cards, pane] of [["plain", false, false], ["cv:auto cards", true, false], ["cv:auto panes", false, true], ["cv:auto cards+panes", true, true]] as const) {
					await ev(`return __sp.cardCV(${cards}, 35)`);
					for (let i = 0; i < 2; i++) {
						await ev(`return await __sp.prepSwipe(${pane})`);
						await measure(`swipe ${label} #${i}`, `sw-${label}-${i}`, `__sp.swipe(300,'sw-${label}-${i}')`);
					}
				}
				await ev("return __sp.cardCV(false)");
			}
			if (part2) {
				say(`stylesheets: ${JSON.stringify(await ev("return __sp.styleRules()"))}`);
				say("### 6a. cold render, host without the plugin class (Obsidian rules only)");
				await ev("return __sp.bare(true)");
				for (let i = 0; i < 2; i++) await measure(`bare cold byProject #${i}`, `bare-${i}`, `__sp.cold('byProject','bare-${i}')`);
				await ev("return __sp.bare(false)");
				say("### 6b. content-visibility:auto on each card");
				await ev("return __sp.cardCV(true, 35)");
				for (let i = 0; i < 3; i++) await measure(`cvauto cold byProject #${i}`, `cva-${i}`, `__sp.cold('byProject','cva-${i}')`);
				for (let i = 0; i < 3; i++) {
					await ev("return await __sp.prepReveal('rows','byProject','cv',true)");
					await measure(`cvauto reveal cv shownBefore #${i}`, `cvar-${i}`, `__sp.reveal('cv','cvar-${i}')`);
				}
				for (let i = 0; i < 3; i++) {
					await ev("return await __sp.prepReveal('rows','byProject','none',true)");
					await measure(`cvauto reveal none #${i}`, `cvan-${i}`, `__sp.reveal('none','cvan-${i}')`);
				}
				for (let i = 0; i < 3; i++) {
					await ev("return await __sp.prepReveal('rows','byProject','cv',false)");
					await measure(`cvauto reveal cv never shown #${i}`, `cvaf-${i}`, `__sp.reveal('cv','cvaf-${i}')`);
				}
				for (const [first, chunk] of [[20, 20], [20, 40], [20, 60]]) for (let i = 0; i < 2; i++) await measure(`cvauto chunked first=${first} chunk=${chunk} #${i}`, `cvac-${first}-${chunk}-${i}`, `__sp.chunked('byProject',${first},${chunk},'cvac-${first}-${chunk}-${i}')`);
				await ev("return __sp.cardCV(false)");
			}
			if (!part2 && !part3) {
			say("### 1. cold render");
			for (const name of ["byProject", "rows"]) for (let i = 0; i < 3; i++) await measure(`cold ${name} #${i}`, `cold-${name}-${i}`, `__sp.cold('${name}','cold-${name}-${i}')`);

			say("### 2. reveal of a mounted hidden subtree (hide Rows, show By project)");
			for (const how of ["cv", "none"])
				for (const before of [false, true])
					for (let i = 0; i < 3; i++) {
						await ev(`return await __sp.prepReveal('rows','byProject','${how}',${before})`, 60_000);
						await measure(`reveal ${how} shownBefore=${before} #${i}`, `rev-${how}-${before}-${i}`, `__sp.reveal('${how}','rev-${how}-${before}-${i}')`);
					}

			say("### 3. mounted subtrees: memory and a write");
			for (const how of ["cv", "none"])
				for (const k of [1, 2, 3, 4]) {
					const m = await ev(`return await __sp.mountMany(${k},'${how}')`, 60_000);
					await cdp.call("HeapProfiler.enable");
					await cdp.call("HeapProfiler.collectGarbage");
					const heap = await cdp.call<{ usedSize: number }>("Runtime.getHeapUsage");
					const dom = await cdp.call<{ documents: number; nodes: number; jsEventListeners: number }>("Memory.getDOMCounters");
					say(`mounted ${k} (${how}): ${JSON.stringify(m)} heap ${(heap.usedSize / 1e6).toFixed(1)} MB, DOM nodes ${dom.nodes}`);
					for (const share of [true, false])
						for (let i = 0; i < 2; i++) await measure(`write k=${k} ${how} share=${share} #${i}`, `w-${k}-${how}-${share}-${i}`, `__sp.write(${share},'w-${k}-${how}-${share}-${i}')`);
				}

			say("### 4. editor: new vs re-keyed");
			await ev("return await __sp.editorPlaces()", 60_000);
			for (let i = 0; i < 3; i++) await measure(`new Obsidian field #${i}`, `ed-new-${i}`, `__sp.editorNew('obsidian',${i},'ed-new-${i}')`);
			for (let i = 3; i < 6; i++) await measure(`re-key warm field #${i}`, `ed-rk-${i}`, `__sp.editorRekey(${i},'ed-rk-${i}')`);
			await ev("return __sp.editorsGone()");
			await ev("return await __sp.editorPlaces()", 60_000);
			for (let i = 0; i < 3; i++) await measure(`new bare EditorView #${i}`, `ed-bare-${i}`, `__sp.editorNew('bare',${i},'ed-bare-${i}')`);
			await ev("return __sp.editorsGone()");

			say("### 5. chunked rendering (byProject)");
			for (const [first, chunk] of [[20, 20], [20, 40], [30, 30], [40, 60]])
				for (let i = 0; i < 2; i++) await measure(`chunked first=${first} chunk=${chunk} #${i}`, `ch-${first}-${chunk}-${i}`, `__sp.chunked('byProject',${first},${chunk},'ch-${first}-${chunk}-${i}')`);
			}
		} finally {
			await cdp.call("Emulation.setCPUThrottlingRate", { rate: 1 });
		}
		await ev("return await __sp.chunked('byProject',20,40,'look')");
		await shot("chunked-end");
		await ev("return __sp.restore()");
	}
	writeFileSync(join(out, part2Name("raw.json")), JSON.stringify(raw, null, 1));
	writeFileSync(join(out, part2Name("log.txt")), lines.join("\n"));
}

import { decodePng } from "./png";
import type { Theme } from "./obsidian";

/** The shadow-root follow-up (SPIKE_PART=4). */
export async function shadowSpike(obsidian: TestObsidian, fx: Fixture, run: string, out: string, root: string): Promise<void> {
	const ev = <T = unknown>(body: string, ms = 60_000) => obsidian.cdp.eval<T>(body, ms);
	const lines: string[] = [];
	const raw: Record<string, unknown> = {};
	const say = (s: string) => {
		console.log(s);
		lines.push(s);
	};
	const page = readFileSync(join(root, "scripts", "e2e", "spikePage.js"), "utf8");
	const cdp = obsidian.cdp;
	mkdirSync(join(out, "shadow"), { recursive: true });
	const clipShot = async (name: string) => {
		const box = await ev<{ x: number; y: number; width: number; height: number }>("return __sp.box()");
		const s = await cdp.call<{ data: string }>("Page.captureScreenshot", { format: "png", clip: { ...box, scale: 1 } });
		const buf = Buffer.from(s.data, "base64");
		writeFileSync(join(out, "shadow", `${name}.png`), buf);
		return decodePng(buf);
	};
	let curPlatform = "";
	const fieldLooks = async () => {
		for (const mode of ["inside", "inside+setRoot", "outside"]) {
			await ev("__sp.shadowHost(); return true");
			await ev("return await __sp.cold('byProject','fl')");
			await ev(`return __sp.fieldIn(${mode !== "outside"})`);
			await sleep(150);
			await cdp.call("Input.insertText", { text: "Typed [[Дру" });
			await sleep(400);
			let rooted: unknown = null;
			if (mode === "inside+setRoot") {
				rooted = await ev("return __sp.fieldRoot()");
				await sleep(200);
			}
			const state = await ev("return __sp.fieldState()");
			const suggest = await ev("return { suggestOpen: !!document.querySelector('.suggestion-container'), items: document.querySelectorAll('.suggestion-item').length }");
			const box = await ev<{ x: number; y: number; width: number; height: number }>("return __sp.fieldBox()");
			const s = await cdp.call<{ data: string }>("Page.captureScreenshot", { format: "png", clip: { ...box, scale: 1 } });
			writeFileSync(join(out, "shadow", `${curPlatform}-field-${mode}.png`), Buffer.from(s.data, "base64"));
			say(`field ${mode}: ${JSON.stringify({ rooted, state, suggest })}`);
			await d0!.key("Escape");
			await ev("return __sp.fieldGone()");
		}
	};
	let d0: Driver | null = null;
	for (const platform of ["desktop", "phone"] as Platform[])
		for (const theme of ["dark", "light"] as Theme[]) {
			curPlatform = platform;
			await obsidian.reset(platform, theme, { path: fx.tasksFile, text: fx.tasks });
			const d = new Driver(obsidian, platform, theme, { baselines: join(run, "unused"), run }, false);
			d0 = d;
			await d.install();
			await openBlock(d, true);
			await ev(`${page}\nreturn true`);
			say(`\n## ${platform} ${theme}`);
			await ev("return __sp.save('rows')");
			await d.tapOn(".tc-n-block .tc-n-view-btn");
			await sleep(500);
			await d.tapOn(".tc-n-panel .tc-n-menu-label", "By project");
			await sleep(800);
			await ev("return __e2e.rest()");
			say(`saved byProject: ${JSON.stringify(await ev("return __sp.save('byProject')"))}`);

			// Pixels: the same cards in the document and in a shadow root.
			await ev("__sp.host(); return true");
			await ev("return await __sp.cold('byProject','px-light')");
			await sleep(400);
			const a = await clipShot(`${platform}-${theme}-document`);
			say(`shadow host: ${JSON.stringify(await ev("return __sp.shadowHost()"))}`);
			await ev("return await __sp.cold('byProject','px-shadow')");
			await sleep(400);
			const b = await clipShot(`${platform}-${theme}-shadow`);
			let differ = 0;
			let box = { x0: 1e9, y0: 1e9, x1: -1, y1: -1 };
			if (a.width === b.width && a.height === b.height) {
				for (let y = 0; y < a.height; y++)
					for (let x = 0; x < a.width; x++) {
						const i = (y * a.width + x) * 4;
						if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > 2) {
							differ++;
							box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
						}
					}
			}
			say(`pixels: document ${a.width}x${a.height}, shadow ${b.width}x${b.height}, differing ${differ}${differ ? ` in ${JSON.stringify(box)}` : ""}`);
			raw[`${platform}/${theme}/pixels`] = { differ, box };

			if (theme === "light" || process.env.PIX_ONLY) {
				if (process.env.PIX_ONLY && theme === "dark") await fieldLooks();
				continue;
			}

			// Behaviour (unthrottled).
			say("### behaviour");
			say(`theme change: ${JSON.stringify(await ev("return await __sp.themeCheck()"))}`);
			say(`focus: ${JSON.stringify(await ev("return __sp.focusCheck()"))}`);
			await ev("return __sp.listen()");
			const c2 = await ev<{ x: number; y: number; key: string }>("return __sp.cardAt(2)");
			await d.tap(c2);
			await sleep(150);
			await d.key("Escape");
			await sleep(100);
			say(`events (tap on ${c2.key}, then Escape with the focus inside): ${JSON.stringify(await ev("return __sp.log"))}`);
			say(`hit test: ${JSON.stringify(await ev(`return __sp.hitCheck(${c2.x}, ${c2.y})`))}`);
			if (platform === "desktop") {
				const c3 = await ev<{ x: number; y: number }>("return __sp.cardAt(3)");
				await d.doubleClick(c3);
				await sleep(150);
				say(`selection (double click on a card title, shadow): ${JSON.stringify(await ev("return __sp.selCheck()"))}`);
			}
			for (const inside of [true, false]) {
				await ev(`return __sp.fieldIn(${inside})`);
				await sleep(200);
				await cdp.call("Input.insertText", { text: "Shadow typed" });
				await sleep(150);
				const typed = await ev("return __sp.fieldState()");
				await d.key("Enter");
				await sleep(150);
				say(`title field ${inside ? "inside the shadow root" : "outside, as an island"}: after typing ${JSON.stringify(typed)}; after Enter events ${JSON.stringify(await ev("return __sp.fieldEvents"))}`);
				await ev("return __sp.fieldGone()");
			}

			// Performance at 4x inside the shadow root.
			const measure = async (label: string, mark: string, expr: string) => {
				let result: unknown;
				const events = (await traced(obsidian, async () => {
					result = await ev(`return await ${expr}`);
					await sleep(400);
				})) as Ev[];
				const r = analyze(events, mark);
				raw[`${platform}/${label}`] = { result, ...r };
				const big = r.tasks.filter((t) => t.ms >= 2).map((t) => `[+${t.at} ${t.ms}ms s${t.script} st${t.style} l${t.layout} p${t.paint} c${t.commit} gc${t.gc}]`).join(" ");
				say(`${label}: longest ${r.longest} ms, event→commit ${r.toPaint} ms; in-page ${JSON.stringify(result).replace(/"steps":\[[^\]]*\],/, "")}\n    tasks≥2ms: ${big}`);
			};
			await ev("__sp.shadowHost(); return true");
			await cdp.call("Emulation.setCPUThrottlingRate", { rate: 4 });
			try {
				say("### performance in the shadow root, 4x");
				for (let i = 0; i < 3; i++) await measure(`shadow cold byProject #${i}`, `sc-${i}`, `__sp.cold('byProject','sc-${i}')`);
				for (let i = 0; i < 2; i++) await measure(`shadow cold rows #${i}`, `scr-${i}`, `__sp.cold('rows','scr-${i}')`);
				for (let i = 0; i < 3; i++) {
					await ev("return await __sp.prepReveal('rows','byProject','cv',true)");
					await measure(`shadow reveal cv:hidden shownBefore #${i}`, `sr-${i}`, `__sp.reveal('cv','sr-${i}')`);
				}
				await ev("return __sp.cardCV(true, 35)");
				for (let i = 0; i < 2; i++) await measure(`shadow cvauto cold byProject #${i}`, `sca-${i}`, `__sp.cold('byProject','sca-${i}')`);
				for (let i = 0; i < 2; i++) {
					await ev("return await __sp.prepReveal('rows','byProject','cv',true)");
					await measure(`shadow cvauto reveal cv:hidden shownBefore #${i}`, `sra-${i}`, `__sp.reveal('cv','sra-${i}')`);
				}
				for (const [first, chunk] of [[20, 20], [30, 20], [30, 40]])
					for (let i = 0; i < 2; i++) await measure(`shadow cvauto chunked first=${first} chunk=${chunk} #${i}`, `sch-${first}-${chunk}-${i}`, `__sp.chunked('byProject',${first},${chunk},'sch-${first}-${chunk}-${i}')`);
				await ev("return __sp.cardCV(false)");
				for (const [first, chunk] of [[30, 20]])
					for (let i = 0; i < 2; i++) await measure(`shadow plain chunked first=${first} chunk=${chunk} #${i}`, `spc-${first}-${chunk}-${i}`, `__sp.chunked('byProject',${first},${chunk},'spc-${first}-${chunk}-${i}')`);
				await ev("return await __sp.mountMany(1,'cv')");
				for (const share of [true, false]) for (let i = 0; i < 2; i++) await measure(`shadow write k=1 share=${share} #${i}`, `sw-${share}-${i}`, `__sp.write(${share},'sw-${share}-${i}')`);
				// Reference in the document, same session: cv:auto chunked with first=30 (the phone's view holds 23).
				await ev("__sp.host(); return true");
				await ev("return __sp.cardCV(true, 35)");
				for (let i = 0; i < 2; i++) await measure(`document cvauto chunked first=30 chunk=20 #${i}`, `dch-${i}`, `__sp.chunked('byProject',30,20,'dch-${i}')`);
				await ev("return __sp.cardCV(false)");
			} finally {
				await cdp.call("Emulation.setCPUThrottlingRate", { rate: 1 });
			}
			await ev("return __sp.restore()");
		}
	writeFileSync(join(out, process.env.PIX_ONLY ? "part5-raw.json" : "part4-raw.json"), JSON.stringify(raw, null, 1));
	writeFileSync(join(out, process.env.PIX_ONLY ? "part5-log.txt" : "part4-log.txt"), lines.join("\n"));
}
