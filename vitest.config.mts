import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	/** The `obsidian` package has types only: a test that loads a piece built on Obsidian gets the fake. */
	resolve: { alias: { obsidian: fileURLToPath(new URL("./tests/fakes/obsidian.ts", import.meta.url)) } },
	test: { include: ["tests/**/*.test.ts"] },
});
