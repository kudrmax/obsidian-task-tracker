/** A piece of a task's text: as typed, or a link shown by its word. */
export type TextPart =
	| { readonly kind: "text"; readonly text: string }
	/** `[[target|label]]`, or a markdown link to a note: `target` is the link text Obsidian resolves. */
	| { readonly kind: "note"; readonly label: string; readonly target: string }
	/** `[label](https://…)` or a bare address. */
	| { readonly kind: "url"; readonly label: string; readonly target: string };

/**
 * Only links are read; code spans, escapes and embeds are matched first so a link inside them stays text, and every other
 * mark (bold, tags, highlights) is left as typed.
 */
const TOKEN_RE = new RegExp(
	[
		"(?<code>`[^`]*`)",
		"(?<escape>\\\\.)",
		"(?<embed>!\\[\\[[^\\]]*\\]\\]|!\\[[^\\]]*\\]\\([^)]*\\))",
		"\\[\\[(?<wiki>[^\\[\\]|]+?)(?:\\|(?<alias>[^\\[\\]]+?))?\\]\\]",
		"\\[(?<label>[^\\[\\]]+)\\]\\((?<href><[^>]+>|[^()\\s]+)\\)",
		"(?<bare>https?://[^\\s<>]+)",
	].join("|"),
	"gu",
);
const SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;
const TRAILING_PUNCTUATION_RE = /[.,;:!?)\]}'"»]+$/u;

export function textParts(text: string): TextPart[] {
	const parts: TextPart[] = [];
	const pushText = (s: string): void => {
		if (s === "") return;
		const last = parts[parts.length - 1];
		if (last?.kind === "text") parts[parts.length - 1] = { kind: "text", text: last.text + s };
		else parts.push({ kind: "text", text: s });
	};
	let at = 0;
	for (const m of text.matchAll(TOKEN_RE)) {
		const link = linkOf(m.groups!);
		if (!link) continue;
		pushText(text.slice(at, m.index));
		parts.push(link.part);
		pushText(link.rest);
		at = m.index + m[0].length;
	}
	pushText(text.slice(at));
	return parts;
}

/** The text with each link's word in its place: for where a link can't be shown, such as a notification. */
export function plainText(text: string): string {
	return textParts(text)
		.map((p) => (p.kind === "text" ? p.text : p.label))
		.join("");
}

function linkOf(g: Record<string, string | undefined>): { part: TextPart; rest: string } | null {
	if (g.wiki !== undefined) {
		const target = g.wiki.trim();
		return { part: { kind: "note", label: g.alias?.trim() || noteLabel(target), target }, rest: "" };
	}
	if (g.label !== undefined && g.href !== undefined) {
		const href = g.href.startsWith("<") ? g.href.slice(1, -1) : g.href;
		const part: TextPart = SCHEME_RE.test(href) ? { kind: "url", label: g.label, target: href } : { kind: "note", label: g.label, target: decoded(href) };
		return { part, rest: "" };
	}
	if (g.bare !== undefined) {
		const rest = TRAILING_PUNCTUATION_RE.exec(g.bare)?.[0] ?? "";
		const url = g.bare.slice(0, g.bare.length - rest.length);
		return { part: { kind: "url", label: url, target: url }, rest };
	}
	return null;
}

/** `Note#Heading` reads `Note > Heading`, as Obsidian shows it; a link within the same note shows just the heading. */
function noteLabel(target: string): string {
	const [note, ...subpath] = target.split("#");
	if (subpath.length === 0) return note;
	return note === "" ? subpath.join(" > ") : [note, ...subpath].join(" > ");
}

function decoded(href: string): string {
	try {
		return decodeURI(href);
	} catch {
		return href;
	}
}
