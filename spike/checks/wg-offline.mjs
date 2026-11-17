import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { WheelGestures } = require(process.argv[3] + "/node_modules/wheel-gestures");
/** Feeds the recorded wheel stream to wheel-gestures at its own pace and prints the gestures it sees. */
const rec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const wheel = rec.events.filter((e) => e.type === "wheel");
const wg = WheelGestures({ momentum: true });
const t0 = wheel[0].t;
const start = performance.now();
const log = [];
wg.on("wheel", (s) => {
	const t = Math.round(s.event.timeStamp - t0);
	if (s.isStart) log.push(`\n${t} START`);
	if (s.isMomentum && s.previous && !s.previous.isMomentum) log.push(`${t} MOMENTUM(lift) mvX=${Math.round(s.axisMovement[0])} velX=${s.axisVelocity[0].toFixed(2)}`);
	if (s.isEnding) log.push(`${t} END mvX=${Math.round(s.axisMovement[0])} mvY=${Math.round(s.axisMovement[1])}${s.isMomentumCancel ? " (momentum cancelled)" : ""}`);
});
for (const e of wheel) {
	const due = e.t - t0 - (performance.now() - start);
	if (due > 0) await new Promise((r) => setTimeout(r, due));
	wg.feedWheel({ deltaX: e.dx, deltaY: e.dy, deltaMode: e.mode ?? 0, timeStamp: e.t, ctrlKey: !!e.ctrl });
}
await new Promise((r) => setTimeout(r, 1500));
console.log(log.join("\n"));
