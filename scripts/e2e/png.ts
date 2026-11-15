import { deflateSync, inflateSync } from "node:zlib";

/** An image as RGBA bytes, row by row. */
export interface Image {
	readonly width: number;
	readonly height: number;
	readonly data: Uint8Array;
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

const paeth = (a: number, b: number, c: number) => {
	const p = a + b - c;
	const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Reads the PNGs Chromium writes: 8-bit RGB or RGBA, not interlaced. */
export function decodePng(file: Uint8Array): Image {
	const buf = Buffer.from(file);
	if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
	let width = 0;
	let height = 0;
	let channels = 4;
	const idat: Buffer[] = [];
	for (let at = 8; at < buf.length; ) {
		const length = buf.readUInt32BE(at);
		const type = buf.toString("ascii", at + 4, at + 8);
		const body = buf.subarray(at + 8, at + 8 + length);
		if (type === "IHDR") {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			const [depth, color, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
			if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) throw new Error(`unsupported PNG: depth ${depth}, colour ${color}, interlace ${interlace}`);
			channels = color === 6 ? 4 : 3;
		} else if (type === "IDAT") idat.push(body);
		else if (type === "IEND") break;
		at += 12 + length;
	}
	const raw = inflateSync(Buffer.concat(idat));
	const stride = width * channels;
	const rows = new Uint8Array(height * stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
		for (let x = 0; x < stride; x++) {
			const a = x >= channels ? rows[y * stride + x - channels] : 0;
			const b = y > 0 ? rows[(y - 1) * stride + x] : 0;
			const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0;
			const v = line[x];
			rows[y * stride + x] = (filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 0xff;
		}
	}
	if (channels === 4) return { width, height, data: rows };
	const data = new Uint8Array(width * height * 4);
	for (let i = 0, j = 0; i < rows.length; i += 3, j += 4) {
		data[j] = rows[i];
		data[j + 1] = rows[i + 1];
		data[j + 2] = rows[i + 2];
		data[j + 3] = 255;
	}
	return { width, height, data };
}

function chunk(type: string, body: Uint8Array): Buffer {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(body.length, 0);
	head.write(type, 4, "ascii");
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
	return Buffer.concat([head, body, crc]);
}

export function encodePng(image: Image): Buffer {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(image.width, 0);
	header.writeUInt32BE(image.height, 4);
	header.set([8, 6, 0, 0, 0], 8);
	const stride = image.width * 4;
	const raw = Buffer.alloc(image.height * (stride + 1));
	for (let y = 0; y < image.height; y++) raw.set(image.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
	return Buffer.concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())]);
}
