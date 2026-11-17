/**
 * Max's real trackpad input and the synthetic chains (tests/e2e/recordings), replayed at their own pace: every stroke
 * turns the ribbon exactly one place its way, the momentum tail nothing, and the ribbon never stalls between places.
 */
import { readdirSync } from "node:fs";

const RECORDINGS = new URL("../recordings/", import.meta.url).pathname;

export default {
	name: "replay",
	features: ["F35", "F292"],
	platforms: ["desktop"],
	async run(t) {
		for (const file of readdirSync(RECORDINGS).filter((f) => f.endsWith(".json") && !f.endsWith(".expect.json")).sort()) {
			await t.setPlace("soon");
			await t.open();
			const result = await t.replay(file, { startPlace: 1 });
			t.expect(result.ok, `${file}: places ${JSON.stringify(result.observed)} against ${JSON.stringify(result.expected)}, leaps ${result.leaps}, stalls ${result.stalls}, frame faults ${JSON.stringify(result.faults.slice(0, 3))}`);
		}
	},
};
