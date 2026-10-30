import type { ZoomLevel } from "../settings";

/** `28, 56, 112` — the hour's heights in pixels, as the settings tab shows them. */
export function formatZoomLevels(levels: readonly ZoomLevel[]): string {
	return levels.map((l) => String(l.hourPx)).join(", ");
}

/** Reads the heights; the old text with a step after each one (`56:30`) still reads, the step dropped. */
export function parseZoomLevels(text: string): ZoomLevel[] | null {
	const levels: ZoomLevel[] = [];
	for (const part of text.split(",")) {
		const m = /^\s*(\d+)\s*(?::\s*\d+\s*)?$/.exec(part);
		if (!m) return null;
		const hourPx = Number(m[1]);
		if (hourPx <= 0) return null;
		levels.push({ hourPx });
	}
	return levels.length > 0 ? levels : null;
}
