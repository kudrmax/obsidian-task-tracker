declare module "lethargy" {
	/** Lethargy (npm `lethargy`): tells a wheel delta a person made (1 / -1) from the inertia the OS adds after the fingers lift (false). */
	export class Lethargy {
		constructor(stability?: number, sensitivity?: number, tolerance?: number, delay?: number);
		check(event: { deltaY: number }): 1 | -1 | false;
	}
}
