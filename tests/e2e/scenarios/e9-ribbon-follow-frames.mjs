import { FrameRecorder } from "../lib/frames.mjs";

/**
 * Step 7 frame by frame on the trackpad (plan 2026-11-19, «Max's decision on the ribbon»; spec 2026-11-18, Decision 64): a
 * stroke of two fingers, uneven as fingers are, then macOS's momentum (one delta a frame, falling). While the fingers move
 * the columns move by exactly their deltas; from the lift (the momentum's start, read from its pace) the deltas move nothing
 * and one landing takes the columns one place, never past it and never back, standing still within 300 ms of letting go.
 * The fingers' events are sent with their own timestamps, as the replays send a person's.
 */
const FINGERS = [
	[0, 4],
	[3, 9],
	[14, 3],
	[16, 12],
	[30, 6],
	[37, 8],
	[57, 5],
	[61, 11],
	[70, 14],
	[73, 9],
];
/** The OS's momentum after the lift: a frame apart, each the one before or a little less (stage0.md, «Round seven»). */
const MOMENTUM = [30, 30, 29, 28, 28, 27, 26, 25, 24, 23, 22, 21, 20, 18, 17, 16, 14, 13, 12, 10, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2, 1, 1];
/** Its last pixels, sparser (ms after the one before), as in Max's recordings: none of them may move the columns. */
const TAIL = [[17, 1], [17, 1], [33, 1], [33, 1], [67, 1]];
const FRAME_MS = 1000 / 120;
/** Pixels a frame's reading of the columns may stand off the fingers' sum: Motion draws a value at its next frame, read after it. */
const FOLLOW_PX = 1;
const LANDED_MS = 300;
const LET_GO_AT = 4;

export default {
	name: "e9-ribbon-follow-frames",
	features: ["Step 7: swipe the columns (the trackpad, frame by frame)"],
	platforms: ["desktop"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		/** From the day's calendar back to Soon: the landing place lies between two others, so nothing bounds a drift past it. */
		await t.setStop("calendar");
		const ribbon = await t.oracle.rect(".tc-ribbon");
		const at = { x: ribbon.left + ribbon.width * 0.5, y: ribbon.top + ribbon.height * 0.5 };
		const track = () => t.cdp.eval(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(document.querySelector(".tc-ribbon-track").getBoundingClientRect().left))))`);
		const epoch = Date.now() / 1000;
		const t0 = performance.now();
		const send = (ms, dx) => t.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: at.x, y: at.y, deltaX: -dx, deltaY: 0, timestamp: epoch + ms / 1000 });
		const wait = async (ms) => {
			const due = ms - (performance.now() - t0);
			if (due > 1) await t.sleep(due);
		};

		/** When each wheel event reached the page, on the page's clock: CDP hands them over slower than a frame apart, so the lift is timed from the event the page let go at. */
		await t.cdp.eval(`(() => { window.__tcWheels = []; window.addEventListener("wheel", () => window.__tcWheels.push(performance.now()), { capture: true }); return 1; })()`);
		const start = await track();
		let drawn = 0;
		for (const [ms, dx] of FINGERS) {
			await wait(ms);
			await send(ms, dx);
			drawn += dx;
		}
		const followed = (await track()) - start;
		t.expect(Math.abs(followed - drawn) <= FOLLOW_PX, `while the fingers move the columns move by their deltas: ${followed.toFixed(1)} px against ${drawn} px`);

		const recorder = new FrameRecorder(t.cdp);
		await recorder.start();
		const recorderT0 = await t.cdp.eval("performance.now()");
		const lift = FINGERS.at(-1)[0] + FRAME_MS;
		let ms = lift;
		for (let i = 0; i < MOMENTUM.length; i++) {
			ms = lift + i * FRAME_MS;
			await wait(ms);
			await send(ms, MOMENTUM[i]);
		}
		for (const [gap, dx] of TAIL) {
			ms += gap;
			await wait(ms);
			await send(ms, dx);
		}
		await t.sleep(600);
		const frames = (await recorder.stop()).filter((f) => f.track !== null);
		const step = ribbon.width / 2;
		const target = start + step;
		const back = frames.findIndex((f, i) => i > 0 && f.track < frames[i - 1].track - 0.5);
		t.expect(back === -1, `after the lift the columns never move back: ${back === -1 ? "" : JSON.stringify(frames.slice(back - 1, back + 1))}`);
		const past = frames.filter((f) => f.track > target + 0.5);
		t.expect(past.length === 0, `nor past their place: ${JSON.stringify(past.slice(0, 2))}`);
		const end = frames.at(-1).track;
		t.expect(Math.abs(end - target) < 0.5, `the stroke lands one place back: ${end} against ${target}`);
		/** The page lets go at the momentum's `momentumEvents`-th event (4, `WHEEL_FOLLOW`): a person's lift reaches it 25 ms (median) before that (stage0.md, «Round seven»). */
		const arrivals = await t.cdp.eval("window.__tcWheels");
		const liftAt = arrivals[FINGERS.length + LET_GO_AT - 1] - recorderT0;
		const still = frames.findIndex((f, i) => frames.slice(i).every((g) => Math.abs(g.track - target) < 0.5));
		const landedMs = frames[still].t - liftAt;
		t.expect(landedMs <= LANDED_MS, `standing still ${Math.round(landedMs)} ms after letting go`);
		console.log(`e9-ribbon-follow-frames: standing still ${Math.round(landedMs)} ms after letting go`);
	},
};
