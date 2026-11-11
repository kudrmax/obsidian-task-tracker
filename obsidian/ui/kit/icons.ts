const NS = "http://www.w3.org/2000/svg";
const CIRCLE = "M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z";
const DOTS = "M5 10.4a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 1 1 0-3.2z M12 10.4a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 1 1 0-3.2z M19 10.4a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 1 1 0-3.2z";

export interface IconSpec {
	/** The stroke, as the board draws it; stroke widths come from the stylesheet. Strokes that cross are drawn one over the other, each its own path. */
	readonly d: string | readonly string[];
	/** A part painted solid: the half of In progress, the whole of Done. */
	readonly fill?: string;
}

/** The design's icons, each drawn once. */
const DRAWINGS = {
	chevronLeft: { d: "M15 5L8 12L15 19" },
	chevronRight: { d: "M9 5L16 12L9 19" },
	chevronUp: { d: "M6 15l6-6 6 6" },
	calendar: { d: "M6.5 5h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z M3.5 10h17 M8 3v3.5 M16 3v3.5" },
	inbox: { d: "M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5 M5.5 5h13l2 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5.5z" },
	backlog: { d: "M3.5 4.5h17v4.5h-17z M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9 M10 13h4" },
	soon: { d: "M5 21.5h14 M5 2.5h14 M17 21.5v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 3.9a2 2 0 0 0-.6 1.4v4.2 M7 2.5v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-3.9a2 2 0 0 0 .6-1.4V2.5" },
	now: { d: "M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4" },
	tomorrow: { d: "M4 12h13 M12 6l6 6-6 6 M20.5 5v14" },
	section: { d: "M4 6h9 M4 12h16 M4 18h16" },
	outdent: { d: "M21 6H11 M21 12H11 M21 18H11 M7 8l-4 4 4 4" },
	indent: { d: "M21 6H11 M21 12H11 M21 18H11 M3 8l4 4-4 4" },
	description: { d: "M4 6h16 M4 12h16 M4 18h10" },
	plus: { d: ["M12 5v14", "M5 12h14"] },
	minus: { d: "M5 12h14" },
	cross: { d: "M6 6l12 12 M18 6L6 18" },
	undo: { d: "M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11" },
	more: { d: [], fill: DOTS },
	select: { d: `${CIRCLE} M8 12.5l2.8 2.8L16 9.8` },
	search: { d: "M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13z M15.5 15.5L20 20" },
	progress: { d: CIRCLE, fill: "M12 3a9 9 0 0 1 0 18z" },
	done: { d: CIRCLE, fill: CIRCLE },
	wontdo: { d: `${CIRCLE} M8 12h8` },
	rename: { d: "M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" },
	delete: { d: "M4 7h16 M9 7V4.5h6V7 M6 7l1 13h10l1-13" },
	removeDue: { d: `${CIRCLE} M9 9l6 6 M15 9l-6 6` },
	priority: { d: "M5.5 21V4 M5.5 4.5h11.5l-2.5 4.75 2.5 4.75H5.5" },
	label: { d: "M3.5 4.5a1 1 0 0 1 1-1h7.1a1 1 0 0 1 .7.3l8.4 8.4a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0l-8.4-8.4a1 1 0 0 1-.3-.7z" },
	removeSection: { d: "M4 6h9 M4 12h9 M4 18h9 M16 9l5 5 M21 9l-5 5" },
	subtask: { d: "M5 4v8a4 4 0 0 0 4 4h11 M16 12l4 4-4 4" },
	fullScreen: { d: "M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5" },
	project: { d: "M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2.2h7.2a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" },
	openFile: { d: "M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" },
	check: { d: "M5 12.5l4.5 4.5L19 7" },
	google: { d: "M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5H7z" },
	work: { d: "M9 2.5h6a2.5 2.5 0 0 1 2.5 2.5v14a2.5 2.5 0 0 1-2.5 2.5H9A2.5 2.5 0 0 1 6.5 19V5A2.5 2.5 0 0 1 9 2.5z M11 18.5h2" },
	iphone: { d: "M9 2.5h6a2.5 2.5 0 0 1 2.5 2.5v14a2.5 2.5 0 0 1-2.5 2.5H9A2.5 2.5 0 0 1 6.5 19V5A2.5 2.5 0 0 1 9 2.5z M10.5 5h3" },
	reminder: { d: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z M10 21h4" },
	refresh: { d: "M20 12a8 8 0 1 1-2.3-5.7 M20 4v4.5h-4.5" },
	repeat: { d: "M17 2.5l3.5 3.5-3.5 3.5 M3.5 11.5V10a4 4 0 0 1 4-4h13 M7 21.5L3.5 18 7 14.5 M20.5 12.5V14a4 4 0 0 1-4 4h-13" },
	stop: { d: `${CIRCLE} M9.5 9.5h5v5h-5z` },
	/** A result: Lucide's target, on a folded result's small line and on Add to result. */
	target: { d: "M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20z M12 6a6 6 0 1 1 0 12a6 6 0 1 1 0-12z M12 10a2 2 0 1 1 0 4a2 2 0 1 1 0-4z" },
	/** Make result, Make task: Lucide's goal. */
	goal: { d: ["M12 13V2l8 4-8 4", "M20.561 10.222a9 9 0 1 1-12.55-5.29", "M8.002 9.997a5 5 0 1 0 8.9 2.02"] },
} satisfies Record<string, IconSpec>;

export type IconName = keyof typeof DRAWINGS;

export const ICONS: Readonly<Record<IconName, IconSpec>> = DRAWINGS;

function path(svg: SVGSVGElement, d: string): SVGPathElement {
	const shape = document.createElementNS(NS, "path");
	shape.setAttribute("d", d);
	svg.appendChild(shape);
	return shape;
}

export function icon(name: IconName): SVGSVGElement {
	const spec = ICONS[name];
	const svg = document.createElementNS(NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	for (const stroke of typeof spec.d === "string" ? [spec.d] : spec.d) path(svg, stroke);
	if (spec.fill) {
		const filled = path(svg, spec.fill);
		filled.setAttribute("fill", "currentColor");
		filled.setAttribute("stroke", "none");
	}
	return svg;
}
