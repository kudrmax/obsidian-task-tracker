/** Puts a mark's words, ready from the core, on it, after what it reads (`said`, a time) if anything; none takes them off. */
export function labelMark(mark: HTMLElement, words: string, said = ""): void {
	if (words === "") {
		mark.removeAttribute("aria-label");
		mark.removeAttribute("title");
		mark.removeAttribute("role");
		return;
	}
	if (said === "") mark.setAttribute("role", "img");
	mark.setAttribute("aria-label", said === "" ? words : `${said}, ${words}`);
	mark.setAttribute("title", words);
}
