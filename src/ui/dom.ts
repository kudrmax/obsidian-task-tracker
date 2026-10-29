/** Plain DOM helpers, so the pieces under test run in happy-dom as well as in Obsidian. */
export function el<K extends keyof HTMLElementTagNameMap>(parent: Node | null, tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (cls) node.className = cls;
	if (text) node.textContent = text;
	parent?.appendChild(node);
	return node;
}

export function clear(node: Node): void {
	while (node.firstChild) node.removeChild(node.firstChild);
}

export function px(value: number): string {
	return `${value}px`;
}

/** Pointer capture throws for a pointer the browser is not tracking, as in tests; then nothing is captured. */
export function capturePointer(target: Element, pointerId: number): void {
	try {
		target.setPointerCapture(pointerId);
	} catch {
		return;
	}
}

export function releasePointer(target: Element, pointerId: number): void {
	try {
		target.releasePointerCapture(pointerId);
	} catch {
		return;
	}
}
