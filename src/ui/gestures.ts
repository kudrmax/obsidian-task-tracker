/** One gesture at a time: a drag, a resize or a pinch claims the screen, and the others wait. */
export class GestureArbiter {
	private holder: string | null = null;
	private readonly idleListeners: (() => void)[] = [];

	get busy(): boolean {
		return this.holder !== null;
	}

	claim(name: string): boolean {
		if (this.holder !== null) return false;
		this.holder = name;
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
