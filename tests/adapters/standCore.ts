import { CorePort } from "../../obsidian/adapters/CorePort";
import { memoryCore, type MemoryCore } from "../../obsidian/memoryCore";
import { fileText, mockFile } from "../../obsidian/stand/mockData";
import { standEvents } from "../../obsidian/stand/standEvents";
import type { TaskCalendarSettings } from "../../core/settings";

export const NOW = new Date(2026, 10, 18, 14, 20);

/** The stand's made-up tasks as a tasks file's text. */
export const standText = (now: Date): string => fileText(mockFile(now), now);

/** `CorePort` over the core over `text` in memory, its writes landing after `delay` ms. */
export async function corePortOver(text: string, now: Date = NOW, delay = 0, settings: Partial<TaskCalendarSettings> = {}): Promise<MemoryCore & { readonly port: CorePort }> {
	const made = memoryCore(text, { now: () => now }, settings, standEvents(mockFile(now), now));
	made.file.delay = delay;
	const port = await CorePort.open({ ...made.core, clock: made.clock });
	return { ...made, port };
}
