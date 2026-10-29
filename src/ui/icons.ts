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
	calendar: {
		fill: false,
		join: false,
		shapes: [
			["rect", { x: "3.5", y: "5", width: "17", height: "15.5", rx: "3" }],
			["line", { x1: "3.5", y1: "10", x2: "20.5", y2: "10" }],
			["line", { x1: "8", y1: "3", x2: "8", y2: "6.5" }],
			["line", { x1: "16", y1: "3", x2: "16", y2: "6.5" }],
		],
	},
	soon: {
		fill: false,
		join: false,
		shapes: [
			["line", { x1: "9", y1: "6.5", x2: "20", y2: "6.5" }],
			["line", { x1: "9", y1: "12", x2: "20", y2: "12" }],
			["line", { x1: "9", y1: "17.5", x2: "20", y2: "17.5" }],
			["circle", { cx: "4.5", cy: "6.5", r: "1", fill: "currentColor" }],
			["circle", { cx: "4.5", cy: "12", r: "1", fill: "currentColor" }],
			["circle", { cx: "4.5", cy: "17.5", r: "1", fill: "currentColor" }],
		],
	},
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
