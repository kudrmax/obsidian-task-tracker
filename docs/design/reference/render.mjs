// Renders the approved boards in docs/design/canvas to static HTML and PNG: node docs/design/reference/render.mjs [board…]
// A board's <script type="text/x-dc"> defines `class Component extends DCLogic { renderVals() }`; its values fill the
// template: {{a.b}} is a dotted lookup, <sc-for list as> repeats, <sc-if value> branches. A board that holds a
// <dc-import name="X" …> renders X with the import's attributes as props. PNGs come from headless Chrome at 1x
// (<Board>.png, 390×844) and 2x (<Board>@2x.png), the scale Obsidian draws at on a Mac.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const canvas = join(here, "..", "canvas");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 390, HEIGHT = 844;
const BOARDS = ["Screen", "ScreenSoon", "ScreenDrag", "ScreenLeft", "ScreenRight"];

class DCLogic {
	constructor(props) {
		this.props = props;
	}
}

function board(name) {
	const html = readFileSync(join(canvas, `${name}.dc.html`), "utf8");
	const script = html.match(/<script type="text\/x-dc"([^>]*)>([\s\S]*?)<\/script>/);
	const propsJson = script[1].match(/data-props='([^']*)'/)?.[1];
	const defaults = {};
	for (const [key, spec] of Object.entries(propsJson ? JSON.parse(propsJson) : {})) if (spec && "default" in spec) defaults[key] = spec.default;
	const Component = new Function("DCLogic", `${script[2]}\nreturn Component;`)(DCLogic);
	const body = html.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1];
	const helmet = body.match(/<helmet>([\s\S]*?)<\/helmet>/)?.[1] ?? "";
	const style = [...helmet.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
	const template = body.replace(/<helmet>[\s\S]*?<\/helmet>/, "").trim();
	return { name, defaults, Component, style, template };
}

/** The template as a tree of text, for and if nodes. */
function parse(template) {
	const tokens = template.split(/(<sc-for\b[^>]*>|<\/sc-for>|<sc-if\b[^>]*>|<\/sc-if>)/);
	const root = { children: [] };
	const stack = [root];
	for (const token of tokens) {
		const top = stack[stack.length - 1];
		if (token.startsWith("<sc-for")) {
			const node = { kind: "for", list: token.match(/list="\{\{([^}]+)\}\}"/)[1], as: token.match(/as="([^"]+)"/)[1], children: [] };
			top.children.push(node);
			stack.push(node);
		} else if (token.startsWith("<sc-if")) {
			const node = { kind: "if", value: token.match(/value="\{\{([^}]+)\}\}"/)[1], children: [] };
			top.children.push(node);
			stack.push(node);
		} else if (token === "</sc-for>" || token === "</sc-if>") stack.pop();
		else if (token) top.children.push({ kind: "text", text: token });
	}
	return root;
}

const lookup = (scope, path) => path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), scope);

function render(nodes, scope) {
	let out = "";
	for (const node of nodes) {
		if (node.kind === "text") out += node.text.replace(/\{\{([^}]+)\}\}/g, (_, path) => String(lookup(scope, path.trim()) ?? ""));
		else if (node.kind === "if") {
			if (lookup(scope, node.value)) out += render(node.children, scope);
		} else for (const item of lookup(scope, node.list) ?? []) out += render(node.children, { ...scope, [node.as]: item });
	}
	return out;
}

const camel = (attr) => attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function renderBoard(name) {
	const b = board(name);
	const ownVals = new b.Component({ ...b.defaults }).renderVals();
	const imported = b.template.match(/<dc-import\b([^>]*)>/);
	if (!imported) return { html: render(parse(b.template).children, ownVals), style: b.style };
	const attrs = [...imported[1].matchAll(/([\w-]+)="([^"]*)"/g)];
	const target = board(attrs.find(([, key]) => key === "name")[2]);
	const props = { ...target.defaults };
	for (const [, key, raw] of attrs) {
		if (key === "name" || key.startsWith("hint-")) continue;
		const ref = raw.match(/^\{\{([^}]+)\}\}$/);
		props[camel(key)] = ref ? lookup(ownVals, ref[1].trim()) : raw;
	}
	return { html: render(parse(target.template).children, new target.Component(props).renderVals()), style: target.style };
}

function page({ html, style }, name) {
	return `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<title>${name}</title>\n<style>\n${style.trim()}\n</style>\n</head>\n<body>\n${html}\n</body>\n</html>\n`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Headless Chrome on this Mac writes the PNG and then lingers instead of quitting, so the run waits for the file to
 * settle and ends Chrome itself. Each run gets a profile of its own in the system temp folder, so two runs never wait
 * on one another's lock.
 */
async function screenshot(htmlPath, pngPath, scale) {
	const profile = mkdtempSync(join(tmpdir(), "task-calendar-reference-"));
	rmSync(pngPath, { force: true });
	const chrome = spawn(CHROME, [
		"--headless=new", "--no-first-run", "--disable-gpu", "--hide-scrollbars",
		`--user-data-dir=${profile}`, `--window-size=${WIDTH},${HEIGHT}`, `--force-device-scale-factor=${scale}`,
		`--screenshot=${pngPath}`, `file://${resolve(htmlPath)}`,
	], { stdio: "ignore" });
	try {
		const deadline = Date.now() + 60_000;
		let size = -1;
		while (Date.now() < deadline) {
			await sleep(200);
			const now = existsSync(pngPath) ? statSync(pngPath).size : -1;
			if (now > 0 && now === size) return;
			size = now;
		}
		throw new Error(`Chrome wrote no screenshot for ${htmlPath}`);
	} finally {
		chrome.kill();
		await sleep(200);
		rmSync(profile, { recursive: true, force: true });
	}
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : BOARDS;
for (const name of wanted) {
	const htmlPath = join(here, `${name}.html`);
	writeFileSync(htmlPath, page(renderBoard(name), name));
	if (!existsSync(CHROME)) {
		console.log(`${name}.html written; no Chrome at ${CHROME}, PNG skipped`);
		continue;
	}
	await screenshot(htmlPath, join(here, `${name}.png`), 1);
	await screenshot(htmlPath, join(here, `${name}@2x.png`), 2);
	console.log(`${name}: html, png, @2x`);
}
