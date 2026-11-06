import { StaleTaskError, TasksFileMissingError } from "../application/contracts";

/** A change that failed, as the notice says it. */
export function failureText(error: unknown): string {
	if (error instanceof StaleTaskError) return "The task changed in the file; the view was refreshed";
	if (error instanceof TasksFileMissingError) return `Tasks file not found: ${error.path}`;
	return error instanceof Error ? error.message : String(error);
}
