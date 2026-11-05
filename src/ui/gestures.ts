/** One gesture at a time: a drag, a resize or a pinch claims the screen, and the others wait. */
export class GestureArbiter {
	private holder: string | null = null;
	private readonly idleListeners: (() => void)[] = [];

	/** Temporary, for the gesture trace: which gesture holds the screen. */
	get owner(): string | null {
		return this.holder;
	}

	get busy(): boolean {
		return this.holder !== null;
	}

	claim(name: string): boolean {
		if (this.holder !== null) return false;
		this.holder = name;
		return true;
	}

	/** `from` hands the screen straight to `to`: no moment in between when it is free and what waits runs. */
	pass(from: string, to: string): boolean {
		if (this.holder !== from) return false;
		this.holder = to;
		return true;
	}

	release(name: string): void {
		if (this.holder !== name) return;
		this.holder = null;
		for (const listener of this.idleListeners) listener();
	}

	/** Called each time the screen is free again: what waited for the gesture to end runs now. */
	onIdle(listener: () => void): void {
		this.idleListeners.push(listener);
	}
}
