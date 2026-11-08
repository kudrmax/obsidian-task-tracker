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
