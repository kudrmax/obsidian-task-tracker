const NS = "http://www.w3.org/2000/svg";

/** The sources' icons as the board draws them: a cloud for Google, a phone for the work file, the refresh arrow, the pull spinner. */
export const SOURCE_ICONS = {
	google: "M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5H7z",
	work: "M9 2.5h6a2.5 2.5 0 0 1 2.5 2.5v14a2.5 2.5 0 0 1-2.5 2.5H9A2.5 2.5 0 0 1 6.5 19V5A2.5 2.5 0 0 1 9 2.5z M11 18.5h2",
	refresh: "M20 12a8 8 0 1 1-2.3-5.7 M20 4v4.5h-4.5",
	spinner: "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1",
} as const;

export function sourceIcon(name: keyof typeof SOURCE_ICONS): SVGSVGElement {
	const svg = document.createElementNS(NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(NS, "path");
	path.setAttribute("d", SOURCE_ICONS[name]);
	svg.appendChild(path);
	return svg;
}
