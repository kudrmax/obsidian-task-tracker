import type { Replica } from "../replica/Replica";

/** What the runtime uses of `PluginSettings`: the settings now (the synced file's and the device's), a patch, a change. */
export interface SettingsSource<T extends object> {
	get(): T;
	update(patch: Partial<T>): Promise<void>;
	onChange(listener: () => void): () => void;
}

type Json = Readonly<Record<string, unknown>>;

const parsed = (text: string): Json => (text.trim() === "" ? {} : (JSON.parse(text) as Json));

/** The keys of `after` whose values differ from `before`'s, with `after`'s values. */
export function changedKeys(before: Json, after: Json): Json {
	return Object.fromEntries(Object.entries(after).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])));
}

/**
 * The replica's settings (P3): `PluginSettings.get()` as text, refreshed on its `onChange`, so every outside writer
 * (Sync, Google's token, the old screen) reaches it. A call that changed the settings is written as a per-key patch:
 * only the keys it changed, merged by `PluginSettings` over a fresh read; device keys go to the device's storage, never
 * data.json, by `PluginSettings`' own partition. A change that brings the same settings back (our own echo) changes nothing.
 */
export class SettingsLink<T extends object> {
	constructor(
		private readonly source: SettingsSource<T>,
		private readonly replica: Replica,
		private readonly failed: (error: unknown) => void,
	) {}

	/** Follows the settings until the answer is called. */
	follow(): () => void {
		this.refresh();
		return this.source.onChange(() => this.refresh());
	}

	/** A call answered `text` over the settings it was handed as `handed`: the keys it changed are saved. */
	save(text: string, handed: string): void {
		const patch = changedKeys(parsed(handed), parsed(text));
		if (Object.keys(patch).length === 0) return;
		this.source.update(patch as Partial<T>).catch((e: unknown) => this.failed(e));
		this.refresh();
	}

	get settings(): T {
		return this.source.get();
	}

	private refresh(): void {
		this.replica.update({ settings: JSON.stringify(this.source.get()) });
	}
}
