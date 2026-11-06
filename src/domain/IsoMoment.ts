const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const MINUTE_MS = 60_000;

/**
 * A moment written as ISO 8601, as the calendars' writers write it (`toISOString`): a date alone is UTC midnight, a time
 * with no offset the device's clock, as ECMAScript reads them. Anything else is an invalid date. Read field by field, so
 * Electron and JavaScriptCore read the same: `new Date(text)` leaves other formats to the engine.
 */
export function isoMoment(text: string): Date {
	const m = ISO.exec(text.trim());
	if (!m) return new Date(Number.NaN);
	const [, y, mo, d, h, mi, s, fraction, zone] = m;
	const ms = fraction === undefined ? 0 : Math.floor(Number(`0.${fraction}`) * 1000);
	const fields = [Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0), ms] as const;
	if (!valid(fields)) return new Date(Number.NaN);
	if (h === undefined) return new Date(Date.UTC(...fields));
	if (zone === undefined) return new Date(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5], fields[6]);
	return new Date(Date.UTC(...fields) - offsetMinutes(zone) * MINUTE_MS);
}

function valid([, month, day, hour, minute, second]: readonly number[]): boolean {
	return month <= 11 && day >= 1 && day <= 31 && hour <= 24 && minute <= 59 && second <= 59;
}

/** `Z`, `+03:00`, `-0500`: minutes ahead of UTC. */
function offsetMinutes(zone: string): number {
	if (zone === "Z") return 0;
	const digits = zone.slice(1).replace(":", "");
	const minutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2));
	return zone.startsWith("-") ? -minutes : minutes;
}
