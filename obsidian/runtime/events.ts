import type { PendingCall } from "./persistence/PendingLog";

/**
 * What the runtime tells the screens besides a change of the replica, each turned into a message of their model.
 * `rebased`: the file changed elsewhere and the pending calls ran again over it; `idMap` (old id → new id) is applied to
 * the whole model in one message (row keys, pins, the selection, an open card or menu, an entry's target); each call in
 * `dropped` gets its reverse transition. `fileGone`: the tasks file went (moved, deleted, or `tasksFile` changed): the
 * screen offers to create it. `minute`: the clock passed a minute: views are read again.
 */
export type RuntimeEvent =
	| { readonly kind: "rebased"; readonly idMap: Readonly<Record<string, string>>; readonly dropped: readonly PendingCall[] }
	| { readonly kind: "fileGone"; readonly path: string }
	| { readonly kind: "minute" };

/** Where a runtime tells its events. */
export class RuntimeEvents {
	private readonly listeners = new Set<(event: RuntimeEvent) => void>();

	emit(event: RuntimeEvent): void {
		for (const listener of [...this.listeners]) listener(event);
	}

	on(listener: (event: RuntimeEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

/** A short message to Max: Obsidian's `Notice` in the plugin. */
export interface Notices {
	show(text: string): void;
}

/** What Max reads when the runtime had to let his changes go. */
export const NOTICE_WORDS = {
	stale: "The task changed in the file; the view was refreshed",
	busy: "The tasks file kept changing; your last changes were not saved",
	gone: (path: string) => `Tasks file not found: ${path}`,
} as const;
