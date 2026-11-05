import type { PriorityColor } from "./Priority";

/** A label: a task tagged `#<tag>/<name>` gets the tint of `color`; a task may carry several. */
export interface LabelLevel {
	/** As the tag writes it: `Важное_и_срочное`. */
	readonly name: string;
	readonly color: PriorityColor;
}

/** How a card of several labels is painted: narrow diagonal stripes of their colours in turn, or one colour flowing into the next. */
export type LabelPaint = "stripes" | "blend";
export const LABEL_PAINTS: readonly LabelPaint[] = ["stripes", "blend"];

/** A label's name as the screen shows it: the tag's underscores read as spaces. */
export function labelTitle(name: string): string {
	return name.replace(/_/g, " ");
}

/** A name as typed in the settings, the spaces made underscores, so it is one word of a tag. */
export function labelNameOf(title: string): string {
	return title.trim().replace(/\s+/g, "_");
}

/** A name tags a task only when it is one word without `#`. */
export function usableLabelName(name: string): boolean {
	return /^[^\s#]+$/.test(name);
}

/** The labels that mark tasks: a usable name, the first of two with the same one. */
export function usableLabels(labels: readonly LabelLevel[]): readonly LabelLevel[] {
	return labels.filter((label, i) => usableLabelName(label.name) && labels.findIndex((l) => l.name === label.name) === i);
}

export function sameLabels(a: readonly LabelLevel[], b: readonly LabelLevel[]): boolean {
	return a.length === b.length && a.every((label, i) => label.name === b[i].name && label.color === b[i].color);
}

/** A tag folder marks labels when it is one word without `#`. */
export function usableLabelTag(tag: string): boolean {
	return /^[^\s#/]+$/.test(tag);
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The labels a text is tagged with, in the order it has them: each `#<tag>/<name>` whose name is one of `names`, and the
 * text without those tags. A tag of another name stays part of the text.
 */
export function labelsOfText(text: string, tag: string, names: readonly string[]): { labels: readonly string[]; text: string } {
	if (!usableLabelTag(tag) || names.length === 0) return { labels: [], text };
	const labels: string[] = [];
	const rest = text.replace(new RegExp(`(^|\\s)#${escapeRegExp(tag)}/(\\S+)(?=\\s|$)`, "g"), (whole, space: string, name: string) => {
		if (!names.includes(name)) return whole;
		if (!labels.includes(name)) labels.push(name);
		return space;
	});
	return labels.length === 0 ? { labels, text } : { labels, text: rest.replace(/\s{2,}/g, " ").trim() };
}

export function labelTags(tag: string, labels: readonly string[]): string {
	return labels.map((name) => ` #${tag}/${name}`).join("");
}

/** `labels` with `name` taken off when they have it, else put at the end. */
export function toggledLabel(labels: readonly string[], name: string): readonly string[] {
	return labels.includes(name) ? labels.filter((l) => l !== name) : [...labels, name];
}
