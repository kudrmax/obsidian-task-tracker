// The only way to release: `npm run release -- "<notes>"`, from the main clone on master. Every check stops the release.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ASSETS = ["main.js", "manifest.json", "styles.css"];

function fail(reason) {
	console.error(`\nRelease stopped: ${reason}`);
	process.exit(1);
}

function run(command, args, options = {}) {
	return execFileSync(command, args, { encoding: "utf8", stdio: options.quiet ? ["ignore", "pipe", "inherit"] : "inherit", ...options });
}

function git(...args) {
	return run("git", args, { quiet: true }).trim();
}

function sha(file) {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function json(file) {
	return JSON.parse(readFileSync(file, "utf8"));
}

const notes = process.argv[2];
if (!notes) fail('no release notes: npm run release -- "<what changed>"');

if (git("rev-parse", "--abbrev-ref", "HEAD") !== "master") fail("not on master");
if (git("status", "--porcelain") !== "") fail("uncommitted changes");
git("fetch", "--quiet", "origin");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/master")) fail("master differs from origin/master");

const version = json("manifest.json").version;
if (json("package.json").version !== version) fail(`package.json says ${json("package.json").version}, manifest.json ${version}`);
if (!(version in json("versions.json"))) fail(`versions.json has no ${version}`);
if (git("tag", "--list", version) !== "") fail(`tag ${version} already exists`);

if (!existsSync("node_modules")) run("npm", ["ci"]);
run("npx", ["vitest", "run"]);
run("npm", ["run", "test:apple"]);
run("npm", ["run", "build"]);

const banner = readFileSync("main.js", "utf8").split("\n", 1)[0];
if (banner !== `// task-calendar ${version}`) fail(`main.js is not this build: its first line is «${banner}»`);
const committed = Number(git("log", "-1", "--format=%ct")) * 1000;
if (statSync("main.js").mtimeMs < committed) fail("main.js is older than the last commit");
if (git("status", "--porcelain") !== "") fail("the build changed tracked files: commit them first");

run("gh", ["release", "create", version, ...ASSETS, "--title", version, "--notes", notes]);

const downloaded = mkdtempSync(path.join(tmpdir(), "task-calendar-release-"));
run("gh", ["release", "download", version, "--dir", downloaded]);
for (const asset of ASSETS) {
	if (sha(path.join(downloaded, asset)) !== sha(asset)) fail(`the released ${asset} is not the one built here`);
}
console.log(`\nReleased ${version}: the assets on GitHub are this build.`);
