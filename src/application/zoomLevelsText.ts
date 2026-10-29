import type { ZoomLevel } from "../settings";

/** `28:60, 56:30` — pixels per hour and the step in minutes, as the settings tab shows them. */
export function formatZoomLevels(levels: readonly ZoomLevel[]): string {
	return levels.map((l) => `${l.hourPx}:${l.stepMinutes}`).join(", ");
}

export function parseZoomLevels(text: string): ZoomLevel[] | null {
	const levels: ZoomLevel[] = [];
	for (const part of text.split(",")) {
		const m = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(part);
		if (!m) return null;
		const hourPx = Number(m[1]);
		const stepMinutes = Number(m[2]);
		if (hourPx <= 0 || stepMinutes <= 0 || stepMinutes > 60) return null;
		levels.push({ hourPx, stepMinutes });
	}
	return levels.length > 0 ? levels : null;
}
