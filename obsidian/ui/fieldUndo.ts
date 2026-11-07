/**
 * Cmd+Z and Cmd+Shift+Z in a plain text field of the plugin undo and redo its own typing and go no further: left to
 * Obsidian, they reach the app's Undo menu, which in a background window waits on a hidden system alert and holds the app.
 */
export function ownUndo(input: HTMLElement): void {
	input.addEventListener("keydown", (e) => {
		if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "z") return;
		e.preventDefault();
		e.stopPropagation();
		input.ownerDocument.execCommand(e.shiftKey ? "redo" : "undo");
	});
}
