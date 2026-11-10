/**
 * A note's tags as Obsidian's metadata cache reads them (`getAllTags`), from the note's text: its properties' `tags` (or
 * `tag`), then the `#tags` of its text outside code, each with its `#`.
 */
export function noteTags(text: string): string[] {
	const { properties, body } = split(text);
	return [...(properties === null ? [] : propertyTags(properties)), ...bodyTags(body)];
}

const FENCE = /^\s*(```|~~~)/;
const INLINE_CODE = /`[^`]*`/g;
const BODY_TAG = /(?<=^|\s)#([^\s!"#$%&'()*+,.:;<=>?@^`{|}~[\]\\]+)/gm;

function split(text: string): { readonly properties: string | null; readonly body: string } {
	const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
	if (lines[0]?.trim() !== "---") return { properties: null, body: text };
	const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
	if (end < 0) return { properties: null, body: text };
	return { properties: lines.slice(1, end).join("\n"), body: lines.slice(end + 1).join("\n") };
}

function propertyTags(yaml: string): string[] {
	const lines = yaml.split("\n");
	const found: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const colon = line.indexOf(":");
		if (colon < 0 || /^\s/.test(line)) continue;
		const key = line.slice(0, colon).trim().toLowerCase();
		if (key !== "tags" && key !== "tag") continue;
		const value = line.slice(colon + 1).trim();
		if (value === "") {
			while (i + 1 < lines.length && lines[i + 1].trim().startsWith("-")) found.push(lines[++i].trim().slice(1));
		} else {
			const inner = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
			found.push(...inner.split(/[,\s]+/));
		}
	}
	return found.map(cleanTag).filter((tag) => tag !== "").map((tag) => `#${tag}`);
}

function cleanTag(raw: string): string {
	return raw.trim().replace(/^["']+|["']+$/g, "").trim().replace(/^#/, "");
}

function bodyTags(body: string): string[] {
	let fenced = false;
	const kept: string[] = [];
	for (const line of body.split("\n")) {
		if (FENCE.test(line)) {
			fenced = !fenced;
			continue;
		}
		if (!fenced) kept.push(line.replace(/\r$/, "").replace(INLINE_CODE, " "));
	}
	return [...kept.join("\n").matchAll(BODY_TAG)].map((m) => m[1]).filter((tag) => !/^\d+$/.test(tag)).map((tag) => `#${tag}`);
}

/** A tag compared as a note writes it: no `#`, case aside. */
function bare(tag: string): string {
	return tag.trim().replace(/^#/, "");
}

/**
 * A note's text with `tag` in its properties' `tags` (without `#`), the rest untouched: a list gets the tag as its last
 * item, a flow list `[a, b]` at its end, a plain value becomes a list; a note without properties gets them first. A note
 * with no text (null) is a new one, the properties alone. A note that has the tag already, in its properties or its text,
 * is left as it is.
 */
export function withProjectTag(text: string | null, tag: string): string {
	const name = bare(tag);
	const item = `  - ${name}`;
	if (text === null) return `---\ntags:\n${item}\n---\n`;
	if (noteTags(text).some((t) => bare(t).toLowerCase() === name.toLowerCase())) return text;
	const lines = text.split("\n");
	const end = lines[0]?.trim() === "---" ? lines.findIndex((line, i) => i > 0 && line.trim() === "---") : -1;
	if (end < 0) return `---\ntags:\n${item}\n---\n${text}`;
	const at = lines.findIndex((line, i) => i > 0 && i < end && /^(tags|tag)\s*:/i.test(line));
	if (at < 0) return [...lines.slice(0, end), "tags:", item, ...lines.slice(end)].join("\n");
	const colon = lines[at].indexOf(":");
	const key = lines[at].slice(0, colon);
	const value = lines[at].slice(colon + 1).trim();
	if (value.startsWith("[") && value.endsWith("]")) {
		const inner = value.slice(1, -1).trim();
		return replaced(lines, at, 1, [`${key}: [${inner === "" ? name : `${inner}, ${name}`}]`]);
	}
	if (value !== "") return replaced(lines, at, 1, [`${key}:`, ...value.split(/[,\s]+/).filter((t) => t !== "").map((t) => `  - ${t}`), item]);
	let last = at;
	while (last + 1 < end && lines[last + 1].trim().startsWith("-")) last++;
	const indent = last > at ? (/^\s*/.exec(lines[last])?.[0] ?? "  ") : "  ";
	return replaced(lines, last + 1, 0, [`${indent}- ${name}`]);
}

function replaced(lines: readonly string[], at: number, count: number, put: readonly string[]): string {
	return [...lines.slice(0, at), ...put, ...lines.slice(at + count)].join("\n");
}
