/** Makes ⌘Enter in `field` run `run` while the field has the focus; the returned function lets go of it. */
export type ModEnterHold = (field: HTMLElement, run: () => void) => () => void;

/** The key as the field hears it: enough where nothing above the page takes ⌘Enter first, as in a test. */
export const plainModEnter: ModEnterHold = (field, run) => {
	const onKey = (e: KeyboardEvent) => {
		if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
		e.preventDefault();
		run();
	};
	field.addEventListener("keydown", onKey);
	return () => field.removeEventListener("keydown", onKey);
};
