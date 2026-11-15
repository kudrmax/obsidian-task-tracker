/** The focus driver (§Architecture): every focus, with `preventScroll`, inside the user's event that asked for it. */
export class Focus {
	/** The block takes the focus on a press, so its keys apply; the note under it never scrolls for it. */
	static take(el: HTMLElement): void {
		if (!el.contains(el.ownerDocument.activeElement)) el.focus({ preventScroll: true });
	}

	/** A field named by the view (`data-n-field`) takes the focus now, its caret at its end. */
	static field(root: ParentNode, name: string): boolean {
		for (const el of root.querySelectorAll<HTMLElement>("[data-n-field]")) {
			if (el.dataset.nField !== name) continue;
			el.focus({ preventScroll: true });
			return el.ownerDocument.activeElement === el;
		}
		return false;
	}

	static holds(el: HTMLElement): boolean {
		return el.contains(el.ownerDocument.activeElement);
	}

	/** Whether the focus is in a field typed in (a field keeps Cmd+Z for its typing). */
	static inField(doc: Document): boolean {
		const focus = doc.activeElement;
		return focus instanceof HTMLElement && (focus.isContentEditable || focus.tagName === "INPUT" || focus.tagName === "TEXTAREA");
	}
}
