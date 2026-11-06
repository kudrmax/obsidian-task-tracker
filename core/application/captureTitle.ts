/** What the phone's new task screen hands in: the words typed, the recording saved in the vault and the tag that has it transcribed. */
export interface CaptureParts {
	readonly typed: string;
	/** The recording's file name as saved, linked after the words; null for none. */
	readonly recording: string | null;
	/** The tag as typed in the app's settings, with or without its `#`; it follows a recording only. */
	readonly tag: string;
}

/** The task's title: the words, then the recording's link and its tag; empty when there is nothing of either. */
export function captureTitle({ typed, recording, tag }: CaptureParts): string {
	const parts = [typed.trim()].filter((p) => p !== "");
	if (recording !== null) {
		parts.push(`[[${recording}]]`);
		const name = tag.trim().replace(/^#+/, "");
		if (name !== "") parts.push(`#${name}`);
	}
	return parts.join(" ");
}
