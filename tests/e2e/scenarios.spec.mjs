import { readdirSync } from "node:fs";
import { expect, test } from "./fixture.mjs";

/**
 * Every scenario of tests/e2e/scenarios as a test (a scenario with `cases`, a test for each), on each project's platform
 * and theme, on a freshly opened screen; the failures it collects are asserted at its end.
 */
const dir = new URL("./scenarios/", import.meta.url);
const scenarios = await Promise.all(
	readdirSync(dir)
		.filter((file) => file.endsWith(".mjs"))
		.sort()
		.map(async (file) => (await import(new URL(file, dir).href)).default),
);

for (const scenario of scenarios) {
	for (const item of scenario.cases ?? [null]) {
		const title = item === null ? scenario.name : `${scenario.name} › ${item}`;
		test(title, { annotation: scenario.features.map((description) => ({ type: "feature", description })) }, async ({ t, platform }) => {
			test.skip(!!scenario.platforms && !scenario.platforms.includes(platform), `${scenario.name} runs on ${scenario.platforms?.join(", ")} only`);
			try {
				await scenario.run(t, item);
			} catch (error) {
				t.failures.push(`threw: ${error instanceof Error ? error.stack : String(error)}`);
			}
			expect(t.failures, `${title} [${platform}, ${t.theme}]`).toEqual([]);
		});
	}
}
