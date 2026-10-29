// Compares two PNGs pixel by pixel: node diff.mjs a.png b.png [out.png] [--tolerance N] [--offset dx,dy] [--region x,y,w,h]
// Prints the share of pixels that differ by more than `tolerance` in any channel. `offset` shifts b against a
// (a pixel at (x, y) in a is compared with (x + dx, y + dy) in b); `region` restricts the comparison, in a's pixels.
// The diff PNG shows a dimmed, with the differing pixels in red.
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(name);
	if (i < 0) return fallback;
	const [value] = args.splice(i, 2).slice(1);
	return value;
};
const tolerance = Number(option("--tolerance", "0"));
const [dx, dy] = option("--offset", "0,0").split(",").map(Number);
const region = option("--region", null)?.split(",").map(Number) ?? null;
const [aPath, bPath, outPath] = args;

export function diffImages(a, b, { tolerance = 0, dx = 0, dy = 0, region = null } = {}) {
	const [rx, ry, rw, rh] = region ?? [0, 0, a.width, a.height];
	const out = new Uint8Array(a.width * a.height * 4);
	let compared = 0, differing = 0;
	for (let y = 0; y < a.height; y++) {
		for (let x = 0; x < a.width; x++) {
			const i = (y * a.width + x) * 4;
			const inRegion = x >= rx && x < rx + rw && y >= ry && y < ry + rh;
			const bx = x + dx, by = y + dy;
			const inB = bx >= 0 && bx < b.width && by >= 0 && by < b.height;
			const dim = Math.round((a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3 / 3);
			out[i] = out[i + 1] = out[i + 2] = dim;
			out[i + 3] = 255;
			if (!inRegion || !inB) continue;
			compared++;
			const j = (by * b.width + bx) * 4;
			const delta = Math.max(Math.abs(a.data[i] - b.data[j]), Math.abs(a.data[i + 1] - b.data[j + 1]), Math.abs(a.data[i + 2] - b.data[j + 2]));
			if (delta > tolerance) {
				differing++;
				out[i] = 255;
				out[i + 1] = 40;
				out[i + 2] = 40;
			}
		}
	}
	return { compared, differing, percent: compared ? (differing / compared) * 100 : 0, image: { width: a.width, height: a.height, data: out } };
}

if (aPath && bPath) {
	const a = decodePng(readFileSync(aPath));
	const b = decodePng(readFileSync(bPath));
	const result = diffImages(a, b, { tolerance, dx, dy, region });
	if (outPath) writeFileSync(outPath, encodePng(result.image));
	console.log(`${result.differing} of ${result.compared} pixels differ (${result.percent.toFixed(3)}%), tolerance ${tolerance}`);
}
