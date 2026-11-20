/**
 * The trackpad's native module (native/trackpad/addon.m) built into a universal (arm64 and x64)
 * trackpad.node beside it, with trackpad.node.json naming the source's hash: both are committed, the plugin's builds embed
 * the binary as it is, and tests/infrastructure/trackpad.test.ts fails when the source changed without a rebuild.
 * Plain N-API (node_api.h), so one build serves every Electron; the headers are the running Node's own.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const native = path.resolve("native/trackpad");
const source = path.join(native, "addon.m");
const out = path.join(native, "trackpad.node");
const headers = path.resolve(path.dirname(process.execPath), "..", "include", "node");

execFileSync(
	"xcrun",
	["clang", "-bundle", "-undefined", "dynamic_lookup", "-arch", "arm64", "-arch", "x86_64", "-mmacosx-version-min=10.15", "-O2", "-fobjc-arc", "-Wall", "-Werror", "-Wno-unused-parameter", `-I${headers}`, "-DNODE_GYP_MODULE_NAME=task_calendar_trackpad", "-framework", "AppKit", "-framework", "Foundation", source, "-o", out],
	{ stdio: "inherit" },
);
execFileSync("codesign", ["--force", "--sign", "-", out], { stdio: "inherit" });
const sha256 = createHash("sha256").update(await readFile(source)).digest("hex");
await writeFile(path.join(native, "trackpad.node.json"), `${JSON.stringify({ source: "addon.m", sha256 }, null, "\t")}\n`);
console.log(`trackpad.node built from addon.m ${sha256.slice(0, 12)}`);
