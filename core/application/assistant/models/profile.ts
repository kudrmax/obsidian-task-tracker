import type { FailureKind } from "../model";

/** A setting of a model, drawn by the Assistant page. */
export interface SettingField {
	/** "model", "path": its key in the model's settings. */
	readonly key: string;
	readonly label: string;
	readonly kind: "text" | "choice";
	/** Offered; typing another is allowed. */
	readonly choices?: readonly string[];
	readonly default: string;
	readonly note?: string;
}

/** What each failure tells Max to do: every kind but `stopped`, which shows nothing. `{timeout}` is filled from the settings. */
export type FailureWords = Readonly<Record<Exclude<FailureKind, "stopped">, string>>;

/** A model as the core knows it: data only. How to ask it is the host's transport. */
export interface ModelProfile {
	readonly id: string;
	readonly name: string;
	readonly fields: readonly SettingField[];
	readonly words: FailureWords;
	/** Why it isn't offered on a host that doesn't serve it. */
	readonly unavailable: string;
}
