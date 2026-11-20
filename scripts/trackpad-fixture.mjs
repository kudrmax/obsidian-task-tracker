/**
 * Max's trackpad probe session (2026-11-20, the native module's signals and the page's wheel events, each with the moment
 * of its own event and the moment it reached the page) turned into what the plugin's `TrackpadFollow` hears, in the order
 * the page heard it: `node scripts/trackpad-fixture.mjs <session.json> <out.json>`. The signals are the native module's
 * (a «may begin» then «began» is one touch); an up's last movement and a momentum end's last delta are read from the
 * wheel events the way the module reads them from macOS's.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
const { gestures } = JSON.parse(readFileSync(input, "utf8"));
const events = gestures.flatMap((g) => g.events).map((e) => ({ ...e, at: e.t === "wheel" ? e.hwEpochMs : e.eventEpochMs }));
const byTime = [...events].sort((a, b) => a.at - b.at);
const t0 = byTime[0].at;
const ms = (x) => Math.round((x - t0) * 10) / 10;
const size = (w) => Math.abs(w.dx) + Math.abs(w.dy);

const items = [];
let lastFingerPhase = null;
let lastMove = null;
let momentumLast = 0;
let inMomentum = false;
for (const e of byTime) {
	if (e.t === "wheel") {
		if (inMomentum && size(e) > 0) momentumLast = size(e);
		else if (!inMomentum && size(e) > 0) lastMove = e.at;
		items.push({ heard: e.recvEpochMs, item: { type: "wheel", t: ms(e.at), dx: e.dx, dy: e.dy } });
	} else if (e.t === "began") {
		const down = e.phase === "mayBegin" || lastFingerPhase !== "mayBegin";
		lastFingerPhase = e.phase;
		if (down) {
			lastMove = null;
			items.push({ heard: e.recvEpochMs, item: { type: "down", t: ms(e.at) } });
		}
	} else if (e.t === "ended") {
		lastFingerPhase = e.phase;
		items.push({ heard: e.recvEpochMs, item: { type: "up", t: ms(e.at), lastMove: lastMove === null ? null : ms(lastMove) } });
	} else if (e.t === "momentumBegan") {
		inMomentum = true;
		momentumLast = 0;
		items.push({ heard: e.recvEpochMs, item: { type: "momentumBegan", t: ms(e.at) } });
	} else if (e.t === "momentumEnded") {
		inMomentum = false;
		items.push({ heard: e.recvEpochMs, item: { type: "momentumEnded", t: ms(e.at), last: momentumLast } });
	}
}
items.sort((a, b) => a.heard - b.heard);
const lines = items.map(({ heard, item }) => JSON.stringify({ heard: ms(heard), ...item }));
writeFileSync(output, `{"source":"${input.split("/").pop()}","events":[\n${lines.join(",\n")}\n]}\n`);
console.log(`${items.length} events`);
