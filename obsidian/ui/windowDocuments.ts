/** The popout windows open beside Obsidian's main one: what the plugin puts on the main document goes on theirs too. */
const popouts = new Set<Document>();
const listeners = new Set<(doc: Document) => void>();

/** The main window's document and every popout window's. */
export function windowDocuments(): Document[] {
	return [...(typeof document === "undefined" ? [] : [document]), ...popouts];
}

/** A popout window opened: whatever is shown on the documents is shown on it at once. Returns its closing. */
export function addWindowDocument(doc: Document): () => void {
	popouts.add(doc);
	for (const listener of [...listeners]) listener(doc);
	return () => void popouts.delete(doc);
}

/** Hears every popout window that opens. Returns the unsubscribe. */
export function onWindowDocument(listener: (doc: Document) => void): () => void {
	listeners.add(listener);
	return () => void listeners.delete(listener);
}
