import { projectKey } from "../domain/Project";
import type { ProjectNote } from "./contracts";

/**
 * The vault's notes as a host without Obsidian reads them (the iOS app): the link Obsidian would write to each, the `[[`
 * typed in a title and the notes it offers, and the note a link opens.
 */

/** A file of the vault by its path from the vault folder. */
export interface VaultNote {
	readonly path: string;
}

const MD = ".md";

/** A file's name as a link shows it: a note without `.md`, any other file with its extension. */
function nameOf(path: string): string {
	const file = path.slice(path.lastIndexOf("/") + 1);
	return file.toLowerCase().endsWith(MD) ? file.slice(0, -MD.length) : file;
}

function withoutMd(path: string): string {
	return path.toLowerCase().endsWith(MD) ? path.slice(0, -MD.length) : path;
}

/** Every file with the shortest link Obsidian writes to it: its name while no other file has it, else its path. */
export function linkedNotes(notes: readonly VaultNote[]): ProjectNote[] {
	const named = new Map<string, number>();
	for (const { path } of notes) named.set(projectKey(nameOf(path)), (named.get(projectKey(nameOf(path))) ?? 0) + 1);
	return notes.map(({ path }) => {
		const name = nameOf(path);
		return { name, path, link: named.get(projectKey(name)) === 1 ? name : withoutMd(path) };
	});
}

/** A `[[` being typed: the words after it up to the caret, and the range a picked note's link takes the place of. */
export interface LinkQuery {
	readonly query: string;
	/** Where `[[` begins. */
	readonly from: number;
	/** Where the range ends: the caret, or past a `]]` right after it. */
	readonly to: number;
}

const OPEN = "[[";
const CLOSE = "]]";

/** The `[[` the caret stands in, not closed before it, on the same line; null for none. Offsets are UTF-16 code units. */
export function linkQuery(text: string, caret: number): LinkQuery | null {
	const before = text.slice(0, caret);
	const from = before.lastIndexOf(OPEN);
	if (from < 0) return null;
	const query = before.slice(from + OPEN.length);
	if (/[\]\[\n|]/.test(query)) return null;
	return { query, from, to: text.startsWith(CLOSE, caret) ? caret + CLOSE.length : caret };
}

/** How many notes `[[` offers at most. */
export const NOTE_SUGGESTIONS = 20;

/**
 * The notes `[[query` offers, best first: the name as typed, then a name starting with it, a name holding it, a path
 * holding it, a path holding each of its words; the shorter name first among equals, then A–Z. All of them, A–Z, for
 * nothing typed yet.
 */
export function noteSuggestions(query: string, notes: readonly VaultNote[], limit = NOTE_SUGGESTIONS): ProjectNote[] {
	const typed = query.trim().toLowerCase();
	const words = typed.split(/\s+/).filter((word) => word !== "");
	const rank = (note: ProjectNote): number | null => {
		const name = note.name.toLowerCase();
		const path = note.path.toLowerCase();
		if (typed === "") return 0;
		if (name === typed) return 0;
		if (name.startsWith(typed)) return 1;
		if (name.includes(typed)) return 2;
		if (path.includes(typed)) return 3;
		return words.every((word) => path.includes(word)) ? 4 : null;
	};
	const ranked = linkedNotes(notes).flatMap((note) => {
		const r = rank(note);
		return r === null ? [] : [{ note: { name: note.name, path: note.path, link: note.link }, rank: r }];
	});
	ranked.sort((a, b) => a.rank - b.rank || (typed === "" ? 0 : a.note.name.length - b.note.name.length) || compare(a.note.name, b.note.name) || compare(a.note.path, b.note.path));
	return ranked.slice(0, limit).map(({ note }) => note);
}

function compare(a: string, b: string): number {
	const x = a.toLowerCase();
	const y = b.toLowerCase();
	return x < y ? -1 : x > y ? 1 : 0;
}

/** A title with a picked note's link in place of the `[[` typed: the new text and where the caret stands after it. */
export function withNoteLink(text: string, at: LinkQuery, link: string): { readonly text: string; readonly caret: number } {
	const written = `${OPEN}${link}${CLOSE}`;
	return { text: text.slice(0, at.from) + written + text.slice(at.to), caret: at.from + written.length };
}

/**
 * The file a link in a title opens (`TextPart.target` of a note): by its path, else by its name, as Obsidian resolves a
 * link; a heading or a block after `#` is left aside. Null for a link to no file the vault has.
 */
export function noteOfLink(target: string, notes: readonly VaultNote[]): ProjectNote | null {
	const bare = target.split("#")[0].split("|")[0].trim().replace(/^\//, "");
	if (bare === "") return null;
	const wanted = projectKey(withoutMd(bare));
	const linked = linkedNotes(notes);
	const found = linked.find((note) => projectKey(withoutMd(note.path)) === wanted) ?? linked.find((note) => projectKey(withoutMd(note.path)).endsWith(`/${wanted}`)) ?? linked.find((note) => projectKey(note.name) === wanted);
	return found ? { name: found.name, path: found.path, link: found.link } : null;
}
