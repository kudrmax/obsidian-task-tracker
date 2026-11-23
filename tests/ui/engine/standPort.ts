import { keptDevice } from "../../../obsidian/memoryCore";
import type { MockFile } from "../../../obsidian/stand/mockData";
import { type StandSource, standSource, type WriteDelay } from "../../../obsidian/stand/standSource";

/** The stand's screen data as the engine's tests take it: `CorePort` over the core over `file` (the whole made-up file around `now` when absent) in memory, its writes landing after `delay` ms. */
export async function standPort(now: Date, file?: MockFile, delay: WriteDelay = 0): Promise<StandSource> {
	let kept: unknown = null;
	const source = await standSource(
		keptDevice(
			() => kept,
			(value) => (kept = value),
		),
		(error) => {
			throw error;
		},
		() => now,
		file,
	);
	source.setDelay(delay);
	return source;
}

/** Lets the core's read after a write or an edit from outside reach the port. */
export const settled = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
