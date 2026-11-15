import { defineConfig } from "vitest/config";

/** Time budgets: run on their own after the other tests (`npm test`), so no other test's load is counted in them. */
export default defineConfig({
	test: { setupFiles: ["tests/setup.ts"], include: ["tests/budget/**/*.test.ts"], fileParallelism: false },
});
