/** The mark before each of a task's projects: `🗂️ Дружба`. */
export const PROJECT_MARKER = "🗂️";

/** The mark as a word of a line, with or without its variation selector. */
const MARK_RE = /(^|\s+)\u{1F5C2}\u{FE0F}?(?=\s|$)/gu;
/** The old field, `🗂️ [[Note]]`: the link right after the mark. */
const LINK_RE = /^\s+\[\[([^[\]|#]+?)(?:#[^[\]|]*)?(?:\|[^[\]]*)?\]\](?=\s|$)/u;

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Where a name ends: the next project's mark, a tag, or another field's mark (`stops`), each a word of its own. */
function stopsRe(stops: readonly string[]): RegExp {
	const words = ["\u{1F5C2}\u{FE0F}?", ...stops.filter((s) => s !== "").map(escapeRegExp)];
	return new RegExp(`\\s+(?:(?:${words.join("|")})(?=\\s|$)|#\\S)`, "u");
}

const stopCache = new Map<string, RegExp>();

function stopOf(stops: readonly string[]): RegExp {
	const key = stops.join("\u0000");
	let re = stopCache.get(key);
	if (!re) stopCache.set(key, (re = stopsRe(stops)));
	return re;
}

/**
 * The projects a text names and the text without them. Each `🗂️` names one: a plain name running to the next field's
 * mark (`stops`), the next `🗂️`, a tag or the end; the old `🗂️ [[Note]]` names the note's name and leaves what follows
 * the link as text. Names are trimmed, a name of nothing is none, and the same project twice (`projectKey`) is one.
 */
export function projectsOfText(text: string, stops: readonly string[] = []): { readonly projects: readonly string[]; readonly text: string } {
	const names: string[] = [];
	let rest = "";
	let at = 0;
	const marks = [...text.matchAll(MARK_RE)];
	if (marks.length === 0) return { projects: [], text };
	for (let i = 0; i < marks.length; i++) {
		const mark = marks[i];
		const start = mark.index!;
		if (start < at) continue;
		rest += text.slice(at, start);
		const from = start + mark[0].length;
		const link = LINK_RE.exec(text.slice(from));
		if (link) {
			names.push(projectName(link[1]));
			at = from + link[0].length;
			continue;
		}
		const tail = text.slice(from);
		const stop = stopOf(stops).exec(tail);
		const end = stop ? from + stop.index : text.length;
		names.push(text.slice(from, end).trim());
		at = end;
	}
	rest += text.slice(at);
	return { projects: uniqueNames(names), text: rest.trim() };
}

/** The names in order, each project once and none of nothing. */
export function uniqueNames(names: readonly string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const name of names) {
		const key = projectKey(name);
		if (name === "" || seen.has(key)) continue;
		seen.add(key);
		unique.push(name);
	}
	return unique;
}

/** The fields as a line writes them, one `🗂️ Name` per project. */
export function projectFields(names: readonly string[]): string {
	return names.map((name) => ` ${PROJECT_MARKER} ${name}`).join("");
}

/** The note's name a link text names: its last part of the path, without `.md`. */
export function projectName(link: string): string {
	const last = link.split("/").pop() ?? link;
	return last.replace(/\.md$/i, "").trim();
}

/** The field marks a name stops at before the settings say otherwise. */
const DEFAULT_STOPS: readonly string[] = ["📅", "⏰", "🚨", "📌", "🔕", "🔁", "📁"];

/**
 * A project's name as typed, the way it can be written: on one line, its spaces single, without brackets (a name is never
 * a link), the project's mark, or a field's mark standing as a word (`stops`: the settings' marks, as the line is read
 * by them); null for a name of nothing.
 */
export function cleanProjectName(typed: string, stops: readonly string[] = DEFAULT_STOPS): string | null {
	const marks = stops.filter((m) => m !== "").map(escapeRegExp);
	const fields = marks.length === 0 ? null : new RegExp(`(^|\\s)(?:${marks.join("|")})(?=\\s|$)`, "gu");
	const name = (fields ? typed.replace(fields, "$1") : typed)
		.replace(/\u{1F5C2}\u{FE0F}?/gu, " ")
		.replace(/[[\]]/g, "")
		.replace(/(^|\s)#(?=\S)/g, "$1")
		.replace(/\s+/g, " ")
		.trim();
	return name === "" ? null : name;
}

/** What makes two projects one: their names, case and Unicode composition aside. */
export function projectKey(name: string): string {
	return name.normalize("NFC").toLowerCase();
}

/** Whether the names hold a project, case and composition aside. */
export function namesProject(names: readonly string[], name: string): boolean {
	const key = projectKey(name);
	return names.some((n) => projectKey(n) === key);
}

/** The same project, or both none: names compared case and composition aside. */
export function inProject(name: string | null, zone: string | null): boolean {
	if (name === null || zone === null) return name === zone;
	return projectKey(name) === projectKey(zone);
}
