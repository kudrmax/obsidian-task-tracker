import { plainText } from "./TaskText";

/** A found piece of a text: its start and its end, as indexes into the text. */
export interface Found {
	readonly start: number;
	readonly end: number;
}

/** How a text holds a query: the pieces found, and how well; a higher score is a better match. */
export interface TextMatch {
	readonly score: number;
	readonly found: readonly Found[];
}

/** A piece of a text, `match` when it is one the search found. */
export interface MatchPart {
	readonly text: string;
	readonly match: boolean;
}

/** How much of the text before the first match a snippet keeps. */
const SNIPPET_LEAD = 24;
const ELLIPSIS = "…";
const SPACE_RE = /\s/;
const PUNCTUATION_RE = /[ -⁯⸀-⹿\\'!"#$%&()*+,\-./:;<=>?@[\]^_`{|}~]/;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
const ACCENTS_RE = /[̀-ͯ]/g;

/** A letter as the eye reads it: case and accents aside, so «Ё» is «е». One letter stays one, so indexes stay the text's own. */
function foldedChar(char: string): string {
	const lower = char.toLowerCase();
	const bare = lower.normalize("NFD").replace(ACCENTS_RE, "");
	if (bare.length === 1) return bare;
	return lower.length === 1 ? lower : char;
}

function folded(text: string): string {
	let out = "";
	for (let i = 0; i < text.length; i++) out += foldedChar(text.charAt(i));
	return out;
}

/** Where a match begins inside a word rather than at its start: `Machine` in `Typemachine`, not in `TypeMachine`. */
function insideWord(text: string, at: number): boolean {
	if (at === 0) return false;
	const char = text.charAt(at);
	const before = text.charAt(at - 1);
	if (!WORD_CHAR_RE.test(char) || !WORD_CHAR_RE.test(before)) return false;
	const startsCapital = char !== char.toLowerCase() && before === before.toLowerCase();
	return !startsCapital;
}

/**
 * A query searched for the way Obsidian's quick switcher does: its words standing in the text in their order, each as a
 * part of a word («отв эл» finds «Ответить Элине»); failing that, its letters in their order. Case and accents aside.
 */
export class FuzzyQuery {
	private constructor(
		private readonly length: number,
		private readonly words: readonly string[],
		private readonly letters: readonly string[],
	) {}

	/** Null for a query of spaces: it finds nothing. */
	static of(query: string): FuzzyQuery | null {
		const text = folded(query.trim());
		if (text === "") return null;
		const words: string[] = [];
		let from = 0;
		for (let i = 0; i < text.length; i++) {
			const char = text.charAt(i);
			if (!SPACE_RE.test(char) && !PUNCTUATION_RE.test(char)) continue;
			if (from !== i) words.push(text.slice(from, i));
			if (!SPACE_RE.test(char)) words.push(char);
			from = i + 1;
		}
		if (from !== text.length) words.push(text.slice(from));
		const letters = [...text].filter((char) => !SPACE_RE.test(char));
		return new FuzzyQuery(text.length, words, letters);
	}

	/** The words in their order, failing that the letters in theirs. */
	match(text: string): TextMatch | null {
		const lower = folded(text);
		return this.matchPieces(this.words, text, lower, false) ?? this.matchPieces(this.letters, text, lower, true);
	}

	/** The words in their order only: letters scattered over a long text would find nearly anything. */
	matchWords(text: string): TextMatch | null {
		return this.matchPieces(this.words, text, folded(text), false);
	}

	private matchPieces(pieces: readonly string[], text: string, lower: string, letters: boolean): TextMatch | null {
		if (pieces.length === 0) return null;
		const found: { start: number; end: number }[] = [];
		let at = 0;
		let broken = 0;
		for (const piece of pieces) {
			const start = lower.indexOf(piece, at);
			if (start < 0) return null;
			const joined = letters && start === at;
			if (!joined && insideWord(text, start)) broken++;
			const last = found[found.length - 1];
			if (last && last.end === start) last.end = start + piece.length;
			else found.push({ start, end: start + piece.length });
			at = start + piece.length;
		}
		return { score: this.score(found, broken, text.length), found };
	}

	/** Fewer pieces, fewer of them inside words, tighter, earlier and in a shorter text score higher. */
	private score(found: readonly Found[], broken: number, textLength: number): number {
		const span = found[found.length - 1].end - found[0].start;
		return -(found.length - 1) - broken / 10 - (span + 1 - this.length) / 100 - found[0].start / 1000 - textLength / 10000;
	}
}

/** The text cut into pieces, the found ones marked. */
export function matchParts(text: string, found: readonly Found[]): MatchPart[] {
	const parts: MatchPart[] = [];
	let at = 0;
	for (const piece of found) {
		if (piece.start > at) parts.push({ text: text.slice(at, piece.start), match: false });
		parts.push({ text: text.slice(piece.start, piece.end), match: true });
		at = piece.end;
	}
	if (at < text.length) parts.push({ text: text.slice(at), match: false });
	return parts;
}

const EMBED_RE = /!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g;
const BLOCK_MARK_RE = /^\s*(?:>\s?)*\s*(?:#{1,6}\s+|(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?)?/;
const LITERAL_RE = /`([^`]*)`|\\(.)/gu;
const EMPHASIS_RE = /(\*\*|~~|==|\*|(?<![\p{L}\p{N}])__|(?<![\p{L}\p{N}])_)(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}])/gu;

function withoutEmphasis(text: string): string {
	let out = text;
	for (let before = ""; before !== out; ) {
		before = out;
		out = out.replace(EMPHASIS_RE, "$2");
	}
	return out;
}

/** Inline Markdown as read: links by their words, no emphasis marks, code and escapes as their characters. */
function plainInline(text: string): string {
	let out = "";
	let at = 0;
	for (const m of text.matchAll(LITERAL_RE)) {
		out += plainText(withoutEmphasis(text.slice(at, m.index)));
		out += m[1] ?? m[2];
		at = m.index + m[0].length;
	}
	return out + plainText(withoutEmphasis(text.slice(at)));
}

/** A description as one line of the words it shows: no list, quote or heading marks, no breaks, single spaces, no embeds. */
export function plainDescription(markdown: string): string {
	return plainInline(
		markdown
			.split("\n")
			.map((line) => line.replace(BLOCK_MARK_RE, ""))
			.join(" ")
			.replace(EMBED_RE, ""),
	)
		.replace(/\s+/g, " ")
		.trim();
}

/** A line of the text from a little before the first match, cut at a word with «…». */
export function snippetParts(text: string, found: readonly Found[]): MatchPart[] {
	const first = found[0].start;
	if (first <= SNIPPET_LEAD) return matchParts(text, found);
	const tail = text.slice(first - SNIPPET_LEAD, first);
	const space = tail.indexOf(" ");
	const lead = space >= 0 && space < tail.length - 1 ? tail.slice(space + 1) : tail;
	const cut = first - lead.length;
	const shifted = found.map((piece) => ({ start: piece.start - cut + 1, end: piece.end - cut + 1 }));
	return matchParts(ELLIPSIS + text.slice(cut), shifted);
}
