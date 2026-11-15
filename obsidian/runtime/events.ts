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

/**
 * What the runtime tells Max: a call dropped because its task changed (`stale`), the pending calls let go past the bound
 * of replays (`busy`), the tasks file gone (`gone`), a failure of the disk or the network (`failed`). The words are the
 * plugin's, in one place with the old screen's (`obsidian/ui/failureText.ts`); the composition says them.
 */
export type RuntimeNotice =
	| { readonly kind: "stale" }
	| { readonly kind: "busy" }
	| { readonly kind: "gone"; readonly path: string }
	| { readonly kind: "failed"; readonly error: unknown };

/** A short message to Max: Obsidian's `Notice` in the plugin. */
export interface Notices {
	tell(notice: RuntimeNotice): void;
}
