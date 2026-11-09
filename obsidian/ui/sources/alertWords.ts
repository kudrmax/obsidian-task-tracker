import type { CalendarAlert, SourceTone } from "../../../core/application/contracts";

/** What a screen reader and a hover say of an orange or red mark, the same words the app says. */
export function alertWords(tone: CalendarAlert | SourceTone): string | null {
	switch (tone) {
		case "old":
			return "Out of date";
		case "broken":
			return "Refresh failed";
		default:
			return null;
	}
}

/** Puts the words on a mark, after what it reads (`said`, a time) if anything, or takes them off when it isn't coloured. */
export function labelMark(mark: HTMLElement, tone: CalendarAlert | SourceTone, said = ""): void {
	const words = alertWords(tone);
	if (words === null) {
		mark.removeAttribute("aria-label");
		mark.removeAttribute("title");
		mark.removeAttribute("role");
		return;
	}
	if (said === "") mark.setAttribute("role", "img");
	mark.setAttribute("aria-label", said === "" ? words : `${said}, ${words}`);
	mark.setAttribute("title", words);
}
