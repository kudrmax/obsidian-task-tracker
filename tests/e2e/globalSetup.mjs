import { execFileSync } from "node:child_process";

/** The test page built from the current source before any scenario runs. */
export default function globalSetup() {
	execFileSync("node", ["scripts/build-e2e-page.mjs"], { cwd: new URL("../../", import.meta.url).pathname, stdio: "inherit" });
}
