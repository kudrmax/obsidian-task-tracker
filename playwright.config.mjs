import { defineConfig } from "@playwright/test";

/**
 * The engine's end-to-end checks (`npm run e2e`): every scenario of tests/e2e/scenarios on the test page
 * (tests/e2e/page, built by scripts/build-e2e-page.mjs), on the desktop and the phone, in the dark and the light theme.
 */
const desktop = { viewport: { width: 1280, height: 820 }, hasTouch: false, isMobile: false, platform: "desktop" };
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, platform: "phone" };

export default defineConfig({
	testDir: "tests/e2e",
	testMatch: "*.spec.mjs",
	outputDir: "build/e2e-results",
	globalSetup: "./tests/e2e/globalSetup.mjs",
	fullyParallel: true,
	workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : "50%",
	/** A recording of a person replays at its own pace, minutes long. */
	timeout: 300_000,
	reporter: [["list"], ["html", { outputFolder: "build/e2e-report", open: "never" }]],
	use: { browserName: "chromium", trace: "retain-on-failure", video: "retain-on-failure" },
	projects: [
		{ name: "desktop-dark", use: { ...desktop, colorScheme: "dark", theme: "dark" } },
		{ name: "desktop-light", use: { ...desktop, colorScheme: "light", theme: "light" } },
		{ name: "phone-dark", use: { ...phone, colorScheme: "dark", theme: "dark" } },
		{ name: "phone-light", use: { ...phone, colorScheme: "light", theme: "light" } },
	],
});
