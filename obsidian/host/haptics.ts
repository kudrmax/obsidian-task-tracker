export interface Haptics {
	tap(): void;
}

interface CapacitorHapticsPlugin {
	impact(options: { style: "LIGHT" | "MEDIUM" | "HEAVY" }): Promise<void>;
}

export interface HapticsHost {
	Capacitor?: { Plugins?: { Haptics?: Partial<CapacitorHapticsPlugin> } };
	navigator: { vibrate?: (pattern: number) => boolean };
}

const VIBRATION_TICK_MS = 15;

class CapacitorHaptics implements Haptics {
	constructor(private readonly plugin: CapacitorHapticsPlugin) {}

	tap(): void {
		this.plugin.impact({ style: "LIGHT" }).catch(() => undefined);
	}
}

class VibrationHaptics implements Haptics {
	constructor(private readonly vibrate: (pattern: number) => boolean) {}

	tap(): void {
		this.vibrate(VIBRATION_TICK_MS);
	}
}

class NoHaptics implements Haptics {
	tap(): void {}
}

/** Capacitor's light impact on the phone, the Vibration API where there is one, silence elsewhere. */
export function detectHaptics(host: HapticsHost): Haptics {
	const plugin = host.Capacitor?.Plugins?.Haptics;
	if (typeof plugin?.impact === "function") return new CapacitorHaptics(plugin as CapacitorHapticsPlugin);
	const vibrate = host.navigator.vibrate;
	if (typeof vibrate === "function") return new VibrationHaptics(vibrate.bind(host.navigator));
	return new NoHaptics();
}
