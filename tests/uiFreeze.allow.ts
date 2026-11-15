/**
 * Growth of the frozen old screen that Max asked for (spec §Guards, `uiFreeze`): a fix on the old screen while the new one
 * grows. Each entry names the commit that made the fix and why, and how much it may grow:
 *
 * - `{ commit, reason, dir: "obsidian/ui/menu", lines: 12 }`: that directory may hold 12 lines more;
 * - `{ commit, reason, file: "obsidian/ui/menu/NewPart.ts" }`: a new file of the old screen (its lines go in a `dir` entry);
 * - `{ commit, reason, cssBytes: 300 }`: the old CSS, above the next marker, may hold 300 bytes more.
 *
 * Slice 7 deletes the old screen and this file.
 */
export type FreezeAllowance =
	| { readonly commit: string; readonly reason: string; readonly dir: string; readonly lines: number }
	| { readonly commit: string; readonly reason: string; readonly file: string }
	| { readonly commit: string; readonly reason: string; readonly cssBytes: number };

export const ALLOWED: readonly FreezeAllowance[] = [];
