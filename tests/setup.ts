/** Obsidian's globals for the window in focus: in a test the one window there is. */
for (const [name, of] of [
	["activeDocument", () => globalThis.document],
	["activeWindow", () => globalThis.window],
] as const) {
	if (!(name in globalThis)) Object.defineProperty(globalThis, name, { get: of, configurable: true });
}
