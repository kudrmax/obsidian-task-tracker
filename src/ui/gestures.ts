/** One gesture at a time: a drag, a resize or a pinch claims the screen, and the others wait. */
export class GestureArbiter {
	private holder: string | null = null;

	get busy(): boolean {
		return this.holder !== null;
	}

	claim(name: string): boolean {
		if (this.holder !== null) return false;
		this.holder = name;
		return true;
	}

	release(name: string): void {
		if (this.holder === name) this.holder = null;
	}
}
