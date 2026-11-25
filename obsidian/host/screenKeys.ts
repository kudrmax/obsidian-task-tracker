import { Scope } from "obsidian";
import { KEYS, takesKeys } from "../ui/engine/keys";
import type { MountedScreen } from "../ui/engine/mount";

/** A key of the screen's table on `screen`, if it takes keys now; false keeps the key from the page once taken. */
export function runScreenKey(screen: MountedScreen | null, id: string): boolean {
	const state = screen?.store.getState();
	const key = KEYS.find((k) => k.id === id);
	if (!state || !key || !takesKeys(state)) return true;
	key.run(state);
	return false;
}

/**
 * The screen's key table (spec, «Keys»: one table, registered by the host) on a `Scope` of its own over `parent`: the
 * leaf's scope, and a note's block's while the focus is in it (F283), a block only the keys it takes, so ⌘Z, ⌘⇧Z and the rest are the screen's there and
 * not the note's.
 */
export function screenKeyScope(parent: Scope, block: boolean, screen: () => MountedScreen | null): Scope {
	const scope = new Scope(parent);
	for (const key of KEYS.filter((k) => !block || k.block)) scope.register([...key.modifiers], key.key, () => runScreenKey(screen(), key.id));
	return scope;
}
