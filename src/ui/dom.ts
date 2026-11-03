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

/** How far a transform drawn on `el` shifts it down now: a translation's y, 0 for none. */
function shiftY(el: Element): number {
	const transform = getComputedStyle(el).transform;
	const values = /matrix(3d)?\(([^)]*)\)/.exec(transform ?? "");
	if (!values) return 0;
	const parts = values[2].split(",").map(Number);
	return (values[1] ? parts[13] : parts[5]) || 0;
}

/** Where the top of `el` stands once the transforms running on it and on what holds it have stopped: its box less their shifts. */
export function restingTop(el: Element): number {
	let shift = 0;
	for (let node: Element | null = el; node && node !== node.ownerDocument.body; node = node.parentElement) shift += shiftY(node);
	return el.getBoundingClientRect().top - shift;
}
