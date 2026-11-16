import type { AssistantSettings } from "../../settings";
import type { HostModels, TransportLoader } from "./model";
import type { ModelProfile, SettingField } from "./models/profile";

/**
 * The profiles joined with the models a host serves. The chosen model is the one the settings name, if this host serves
 * it, else none: no other is asked in its place.
 */
export class ModelChoice {
	constructor(
		private readonly profiles: readonly ModelProfile[],
		private readonly host: HostModels,
		private readonly settings: () => AssistantSettings,
	) {}

	/** The profiles whose model this host serves, in the profiles' order. */
	available(): readonly ModelProfile[] {
		return this.profiles.filter((profile) => this.host.ids.includes(profile.id));
	}

	/** The profile the settings name; null for an id no profile has. */
	named(): ModelProfile | null {
		return this.profileOf(this.settings().model);
	}

	/** The profile the settings name, if this host serves it; else null. */
	chosen(): ModelProfile | null {
		const named = this.named();
		return named && this.host.ids.includes(named.id) ? named : null;
	}

	profileOf(id: string): ModelProfile | null {
		return this.profiles.find((profile) => profile.id === id) ?? null;
	}

	/** How this host asks the model; undefined where the host asks it itself, or doesn't serve it. */
	loader(id: string): TransportLoader | undefined {
		return this.host.ids.includes(id) ? this.host.transport?.(id) : undefined;
	}

	/** A model's settings: each field's value saved, a blank one or none its default; keys no field has kept as saved. */
	settingsOf(profile: ModelProfile): Readonly<Record<string, string>> {
		const saved = this.settings().models[profile.id] ?? {};
		return { ...saved, ...Object.fromEntries(profile.fields.map((field) => [field.key, valueOf(field, saved)])) };
	}
}

/** A field's value as saved; blank or missing: its default. */
export function valueOf(field: SettingField, saved: Readonly<Record<string, string>>): string {
	const value = saved[field.key];
	return value !== undefined && value.trim() !== "" ? value : field.default;
}
