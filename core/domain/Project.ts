/** The mark before a task's project: `🗂️ [[Note]]`. */
export const PROJECT_MARKER = "🗂️";

/** The field anywhere in a text: the marker, with or without its variation selector, then a wikilink. */
const FIELD_RE = /(^|\s)\u{1F5C2}\u{FE0F}?\s+\[\[([^\[\]|#]+?)(?:#[^\[\]|]*)?(?:\|[^\[\]]*)?\]\](?=\s|$)/gu;

/**
 * The project a text names and the text without the field: the link text of the first `🗂️ [[…]]` (no alias, no
 * heading), every such field taken out. A link without the marker, or the marker without a link, stays text.
 */
export function projectOfText(text: string): { readonly project: string | null; readonly text: string } {
	let project: string | null = null;
	const rest = text.replace(FIELD_RE, (_whole, space: string, link: string) => {
		project ??= link.trim();
		return space;
	});
	return project === null ? { project, text } : { project, text: rest.replace(/\s{2,}/g, " ").trim() };
}

/** The field as a line writes it. */
export function projectField(link: string): string {
	return ` ${PROJECT_MARKER} [[${link}]]`;
}

/** The note's name a link text names: its last part of the path, without `.md`. */
export function projectName(link: string): string {
	const last = link.split("/").pop() ?? link;
	return last.replace(/\.md$/i, "").trim();
}

/** What makes two projects one: their names, case aside, as Obsidian resolves a link. */
export function projectKey(name: string): string {
	return name.toLowerCase();
}

/** A project's part of a list: the link text of its note, null for the tasks of no project. */
export type ProjectZone = string | null;

/** A task of project `link` (null: of none) is in `zone`: the same project by name, or both none. */
export function inProject(link: string | null, zone: ProjectZone): boolean {
	if (link === null || zone === null) return link === zone;
	return projectKey(projectName(link)) === projectKey(projectName(zone));
}
