/** A piece of the quick entry on the page: a tap on it is no tap elsewhere, so the field stays open. */
export interface EntryPart {
	owns(target: Element): boolean;
}
