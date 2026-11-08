import { type LabelLevel, type LabelPaint, PRIORITY_COLORS, type PriorityColor, type PriorityLevel, shadesOf, usableColor } from "../../core/application/contracts";
import { onWindowDocument, windowDocuments } from "./windowDocuments";

export { contrast, inkOf, type PriorityShades, shadesOf } from "../../core/application/contracts";

/** The properties each colour's rule sets, which the stylesheet's rules read. */
const PROPERTY = { ink: "--tc-priority-ink", fill: "--tc-priority-fill", meta: "--tc-priority-meta" } as const;

/** A card of several labels carries the n-th one's colour in `attribute`; the stylesheet reads its fill as `fill`. */
export const LABEL_SLOTS = [
	{ attribute: "data-label0", fill: "--tc-label-fill-0" },
	{ attribute: "data-label1", fill: "--tc-label-fill-1" },
	{ attribute: "data-label2", fill: "--tc-label-fill-2" },
	{ attribute: "data-label3", fill: "--tc-label-fill-3" },
] as const;

const themed = (marked: string, theme: "dark" | "light"): string => (theme === "light" ? marked.split(", ").map((s) => `body.theme-light ${s}`).join(", ") : marked);

/**
 * The rules that give every element marked with a colour (`data-priority`) that colour's shades, in both themes, and a
 * card of several labels each label's fill: the presets always (the settings offer them), and each other colour a level
 * or a label has.
 */
export function priorityRules(levels: readonly (PriorityLevel | LabelLevel)[]): string {
	const colors = new Set<PriorityColor>(PRIORITY_COLORS);
	for (const level of levels) if (usableColor(level.color)) colors.add(level.color);
	const rules: string[] = [];
	for (const color of colors) {
		const marked = `[data-priority="${color}"], .tc-quick-row:has(> [data-priority="${color}"])`;
		for (const theme of ["dark", "light"] as const) {
			const s = shadesOf(color, theme);
			rules.push(`${themed(marked, theme)} { ${PROPERTY.ink}: ${s.ink}; ${PROPERTY.fill}: ${s.fill}; ${PROPERTY.meta}: ${s.meta}; }`);
			for (const slot of LABEL_SLOTS) rules.push(`${themed(`[${slot.attribute}="${color}"]`, theme)} { ${slot.fill}: ${s.fill}; }`);
		}
	}
	return rules.join("\n");
}

/** The stylesheet each window's document holds, and the rules and paint they show. */
const sheets = new Map<Document, HTMLStyleElement>();
let rules: string | null = null;
let blend = false;

function paintDocument(doc: Document): void {
	if (rules !== null) {
		let sheet = sheets.get(doc);
		if (!sheet) sheets.set(doc, (sheet = doc.head.appendChild(doc.createElement("style"))));
		sheet.textContent = rules;
	}
	doc.body.classList.toggle(BLEND, blend);
}

onWindowDocument(paintDocument);

/**
 * The levels' colours as a stylesheet in every window's document: cards, menus and the settings read the same shades from
 * it. The settings show a colour still being picked the same way, before it is saved.
 */
export function showPriorityColors(levels: readonly PriorityLevel[], labels: readonly LabelLevel[] = []): void {
	rules = priorityRules([...levels, ...labels]);
	windowDocuments().forEach(paintDocument);
}

const BLEND = "tc-labels-blend";

/** How cards of several labels are painted, for every card in every window: stripes, or with `blend` one colour flowing into the next. */
export function showLabelPaint(paint: LabelPaint): void {
	blend = paint === "blend";
	for (const doc of windowDocuments()) doc.body.classList.toggle(BLEND, blend);
}

export function clearPriorityColors(): void {
	for (const sheet of sheets.values()) sheet.remove();
	sheets.clear();
	rules = null;
	blend = false;
	for (const doc of windowDocuments()) doc.body.classList.remove(BLEND);
}
