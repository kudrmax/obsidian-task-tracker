/** The end of a switch over a union's kinds: a kind left unhandled is a type error here (§Guards, messages). */
export function assertNever(value: never): never {
	throw new Error(`unhandled ${JSON.stringify(value)}`);
}
