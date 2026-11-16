import { defineConfig } from "vitest/config";
import { recordClosure } from "./guards/record-plugin.mjs";
const out = process.env.CLOSURE_OUT ?? "closure-out";
export default defineConfig({
  plugins: [recordClosure(out)],
  test: {
    include: ["tests/**/*.test.ts"],
    css: true,
    setupFiles: ["guards/fs-setup.ts"],
    fsModuleCache: process.env.NOCACHE ? false : undefined,
    execArgv: process.env.NODEHOOK ? ["--import", new URL("./guards/loader-register.mjs", import.meta.url).pathname] : [],
  },
});
