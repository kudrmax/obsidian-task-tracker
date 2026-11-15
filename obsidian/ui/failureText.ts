import { StaleTaskError, TasksFileMissingError } from "../../core/application/contracts";

/** What Max reads when a change could not be made: the one place of these words, the old screen's and the runtime's. */
export const NOTICE_WORDS = {
	stale: "The task changed in the file; the view was refreshed",
	busy: "The tasks file kept changing; your last changes were not saved",
	gone: (path: string) => `Tasks file not found: ${path}`,
} as const;

/** A change that failed, as the notice says it. */
export function failureText(error: unknown): string {
	if (error instanceof StaleTaskError) return NOTICE_WORDS.stale;
	if (error instanceof TasksFileMissingError) return NOTICE_WORDS.gone(error.path);
	return error instanceof Error ? error.message : String(error);
}

/** A notice of the runtime's (`RuntimeNotice`), as Max reads it. */
export function noticeText(notice: { readonly kind: "stale" | "busy" } | { readonly kind: "gone"; readonly path: string } | { readonly kind: "failed"; readonly error: unknown }): string {
	switch (notice.kind) {
		case "stale":
			return NOTICE_WORDS.stale;
		case "busy":
			return NOTICE_WORDS.busy;
		case "gone":
			return NOTICE_WORDS.gone(notice.path);
		case "failed":
			return failureText(notice.error);
	}
}
