import { type LabelLevel, PRIORITY_COLORS, type PriorityColor, type PriorityLevel, shadesOf, usableColor } from "../../core/application/contracts";
import type { LabelPaint } from "./viewSettings";

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

let sheet: HTMLStyleElement | null = null;

/**
 * The levels' colours as a stylesheet in the document: cards, menus and the settings read the same shades from it. The
 * settings show a colour still being picked the same way, before it is saved.
 */
export function showPriorityColors(levels: readonly PriorityLevel[], labels: readonly LabelLevel[] = []): void {
	sheet ??= document.head.appendChild(document.createElement("style"));
	sheet.textContent = priorityRules([...levels, ...labels]);
}

const BLEND = "tc-labels-blend";

/** How cards of several labels are painted, for every card in the document: stripes, or with `blend` one colour flowing into the next. */
export function showLabelPaint(paint: LabelPaint): void {
	document.body.classList.toggle(BLEND, paint === "blend");
}

export function clearPriorityColors(): void {
	sheet?.remove();
	sheet = null;
	document.body.classList.remove(BLEND);
}
