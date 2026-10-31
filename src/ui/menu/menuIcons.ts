const NS = "http://www.w3.org/2000/svg";
const CIRCLE = "M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z";

/** The menu's icons as the board draws them: a stroke path, a filled half for In progress and a filled circle for Done. */
export const MENU_ICONS = {
	progress: { d: CIRCLE, fill: "M12 3a9 9 0 0 1 0 18z" },
	done: { d: CIRCLE, fill: CIRCLE },
	wontdo: { d: `${CIRCLE} M8 12h8`, fill: "" },
	due: { d: "M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z M3.5 10h17 M8 3v4 M16 3v4", fill: "" },
	rename: { d: "M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4", fill: "" },
	delete: { d: "M4 7h16 M9 7V4.5h6V7 M6 7l1 13h10l1-13", fill: "" },
	removeDue: { d: `${CIRCLE} M9 9l6 6 M15 9l-6 6`, fill: "" },
	priority: { d: "M5.5 21V4 M5.5 4.5h11.5l-2.5 4.75 2.5 4.75H5.5", fill: "" },
	check: { d: "M5 12.5l5 5 9-10.5", fill: "" },
	removeSection: { d: "M4 6h9 M4 12h9 M4 18h9 M16 9l5 5 M21 9l-5 5", fill: "" },
} as const;

export type MenuIconName = keyof typeof MENU_ICONS;

export function menuIcon(name: MenuIconName): SVGSVGElement {
	const spec = MENU_ICONS[name];
	const svg = document.createElementNS(NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(NS, "path");
	path.setAttribute("d", spec.d);
	svg.appendChild(path);
	if (spec.fill) {
		const filled = document.createElementNS(NS, "path");
		filled.setAttribute("d", spec.fill);
		filled.setAttribute("fill", "currentColor");
		filled.setAttribute("stroke", "none");
		svg.appendChild(filled);
	}
	return svg;
}
