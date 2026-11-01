const NS = "http://www.w3.org/2000/svg";

type Shape = readonly [tag: string, attrs: Record<string, string>];

interface IconSpec {
	readonly fill: boolean;
	readonly join: boolean;
	readonly shapes: readonly Shape[];
}

/** The design's own line icons, drawn as on the board; stroke widths come from the stylesheet. */
const ICONS = {
	chevronLeft: { fill: false, join: true, shapes: [["polyline", { points: "15 5 8 12 15 19" }]] },
	chevronRight: { fill: false, join: true, shapes: [["polyline", { points: "9 5 16 12 9 19" }]] },
	calendar: { fill: false, join: true, shapes: [["path", { d: "M6.5 5h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z M3.5 10h17 M8 3v3.5 M16 3v3.5" }]] },
	inbox: { fill: false, join: true, shapes: [["path", { d: "M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5 M5.5 5h13l2 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5.5z" }]] },
	soon: { fill: false, join: true, shapes: [["path", { d: "M5 21.5h14 M5 2.5h14 M17 21.5v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 3.9a2 2 0 0 0-.6 1.4v4.2 M7 2.5v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-3.9a2 2 0 0 0 .6-1.4V2.5" }]] },
	now: {
		fill: false,
		join: true,
		shapes: [["path", { d: "M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4" }]],
	},
	tomorrow: { fill: false, join: true, shapes: [["path", { d: "M4 12h13 M12 6l6 6-6 6 M20.5 5v14" }]] },
	section: { fill: false, join: true, shapes: [["path", { d: "M4 6h9 M4 12h16 M4 18h16" }]] },
	outdent: { fill: false, join: true, shapes: [["path", { d: "M21 6H11 M21 12H11 M21 18H11 M7 8l-4 4 4 4" }]] },
	indent: { fill: false, join: true, shapes: [["path", { d: "M21 6H11 M21 12H11 M21 18H11 M3 8l4 4-4 4" }]] },
	description: { fill: false, join: false, shapes: [["path", { d: "M4 6h16 M4 12h16 M4 18h10" }]] },
	plus: {
		fill: false,
		join: false,
		shapes: [
			["line", { x1: "12", y1: "5", x2: "12", y2: "19" }],
			["line", { x1: "5", y1: "12", x2: "19", y2: "12" }],
		],
	},
} satisfies Record<string, IconSpec>;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
	const spec: IconSpec = ICONS[name];
	const svg = document.createElementNS(NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-linecap", "round");
	if (spec.join) svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	for (const [tag, attrs] of spec.shapes) {
		const shape = document.createElementNS(NS, tag);
		for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
		svg.appendChild(shape);
	}
	return svg;
}
