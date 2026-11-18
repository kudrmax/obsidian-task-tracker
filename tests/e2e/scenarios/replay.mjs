/**
 * Max's real trackpad input and the synthetic chains (tests/e2e/recordings), replayed at their own pace: every stroke
 * turns the ribbon exactly one place its way (past Now–calendar, a day), the momentum tail nothing, and the ribbon never
 * stalls between places. A recording without its `.expect.json` is held to the strokes the pager's rule finds in it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { WheelStrokes } from "../../../obsidian/ui/engine/mechanics/wheelStrokes.ts";

const RECORDINGS = new URL("../recordings/", import.meta.url).pathname;

export default {
	name: "replay",
	features: ["F35", "F292"],
	platforms: ["desktop"],
	async run(t) {
		for (const file of readdirSync(RECORDINGS).filter((f) => f.endsWith(".json") && !f.endsWith(".expect.json")).sort()) {
			await t.setPlace("soon");
			await t.open();
			const pager = new WheelStrokes();
			const strokes = JSON.parse(readFileSync(RECORDINGS + file, "utf8")).events.filter((e) => e.type === "wheel").map((e) => pager.feed({ dx: e.dx, dy: e.dy, t: e.t, ctrl: e.ctrl })).filter((step) => step !== 0);
			const result = await t.replay(file, { startPlace: 1, strokes });
			t.expect(result.ok, `${file}: places ${JSON.stringify(result.observed)} against ${JSON.stringify(result.expected)}, astray ${result.astray}, stalls ${result.stalls}, frame faults ${JSON.stringify(result.faults.slice(0, 3))}`);
		}
	},
};
