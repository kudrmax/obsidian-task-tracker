// Renders the approved boards in docs/design/canvas to static HTML and PNG: node docs/design/reference/render.mjs [board…]
// Without names it renders every board of canvas.json's "prod" page. A board's <script type="text/x-dc"> defines
// `class Component extends DCLogic { renderVals() }`; its values fill the template: {{a.b}} is a dotted lookup,
// <sc-for list as> repeats, <sc-if value> branches, and <dc-import name="X" prop="…"> inlines board X rendered with
// those attributes as props ({{…}} values resolve in the importing board's scope; imports nest). PNGs come from
// headless Chrome at 1x (<Board>.png, 390×844) and 2x (<Board>@2x.png), the scale Obsidian draws at on a Mac.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const canvas = join(here, "..", "canvas");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 390, HEIGHT = 844;
const canvasJson = JSON.parse(readFileSync(join(canvas, "canvas.json"), "utf8"));
/** States the plan compares against that no board of the canvas shows on its own. */
const DERIVED = { ScreenNewSlot: ["Screen", { newSlot: true }] };
const BOARDS = [...canvasJson.order.filter((file) => canvasJson.boards[file]?.page === "prod").map((file) => file.replace(/\.dc\.html$/, "")), ...Object.keys(DERIVED)];

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

const camel = (attr) => attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** The template as a tree of text, for, if and import nodes. */
function parse(template) {
	const tokens = template.split(/(<sc-for\b[^>]*>|<\/sc-for>|<sc-if\b[^>]*>|<\/sc-if>|<dc-import\b[^>]*>(?:<\/dc-import>)?)/);
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
		else if (token.startsWith("<dc-import")) {
			const attrs = [...token.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]);
			top.children.push({ kind: "import", name: attrs.find(([key]) => key === "name")[1], props: attrs.filter(([key]) => key !== "name" && !key.startsWith("hint-")) });
		} else if (token) top.children.push({ kind: "text", text: token });
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
		} else if (node.kind === "import") {
			const props = {};
			for (const [key, raw] of node.props) {
				const ref = raw.match(/^\{\{([^}]+)\}\}$/);
				props[camel(key)] = ref ? lookup(scope, ref[1].trim()) : raw;
			}
			out += renderWith(node.name, props).html;
		} else for (const item of lookup(scope, node.list) ?? []) out += render(node.children, { ...scope, [node.as]: item });
	}
	return out;
}

/** A board rendered with the given props over its defaults; imports inside it render the same way. */
function renderWith(name, props) {
	const b = board(name);
	const vals = new b.Component({ ...b.defaults, ...props }).renderVals();
	return { html: render(parse(b.template).children, vals), style: b.style };
}

const renderBoard = (name) => (DERIVED[name] ? renderWith(DERIVED[name][0], DERIVED[name][1]) : renderWith(name, {}));

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
