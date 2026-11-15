import type { DoorHost } from "../../../core/application/PhoneCalls";

/** Where the door runs: on iOS (Obsidian on the iPhone or iPad) the phone's and Google's calendar files meet. */
export function hostOf(isIosApp: boolean): DoorHost {
	return isIosApp ? "ios" : "obsidian";
}

/** What the host must have before the replica is built (P8): the layout, and Obsidian's metadata cache resolved. */
export type HostReadiness = "layout" | "metadata";

/** The host's readiness as messages arrive: ready once every fact is in, told once. */
export class Readiness {
	private readonly arrived = new Set<HostReadiness>();
	private told = false;

	constructor(private readonly onReady: () => void) {}

	arrive(fact: HostReadiness): void {
		this.arrived.add(fact);
		if (this.told || !this.ready) return;
		this.told = true;
		this.onReady();
	}

	get ready(): boolean {
		return this.arrived.has("layout") && this.arrived.has("metadata");
	}

	has(fact: HostReadiness): boolean {
		return this.arrived.has(fact);
	}
}
