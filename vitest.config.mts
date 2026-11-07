import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** The core reads the device's local time: the door's and the phone's answers also run in two other zones, so a time-zone bug turns red. */
const ZONED = ["tests/application/PhoneCalls.test.ts", "tests/application/PhoneDoor.*.test.ts", "tests/phone/answers.test.ts", "tests/timeZones.zone.test.ts"];
const ZONES = ["Asia/Novosibirsk", "America/New_York"];

export default defineConfig({
	/** The `obsidian` package has types only: a test that loads a piece built on Obsidian gets the fake. */
	resolve: { alias: { obsidian: fileURLToPath(new URL("./tests/fakes/obsidian.ts", import.meta.url)) } },
	test: {
		setupFiles: ["tests/setup.ts"],
		projects: [
			{ extends: true, test: { name: "all", include: ["tests/**/*.test.ts"], exclude: ["tests/**/*.zone.test.ts"] } },
			...ZONES.map((zone) => ({ extends: true, test: { name: zone, include: ZONED, env: { TZ: zone } } })),
		],
	},
});
