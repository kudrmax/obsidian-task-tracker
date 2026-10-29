// A PNG codec for the reference tooling: 8-bit RGB and RGBA, no interlace, nothing else. No dependencies.
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Int32Array(256).map((_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c;
});

const crc32 = (buf) => {
	let c = -1;
	for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
};

const paeth = (a, b, c) => {
	const p = a + b - c;
	const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** { width, height, data: Uint8Array RGBA }. */
export function decodePng(buffer) {
	if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
	let offset = 8, width = 0, height = 0, colorType = 0;
	const idat = [];
	while (offset < buffer.length) {
		const length = buffer.readUInt32BE(offset);
		const type = buffer.toString("ascii", offset + 4, offset + 8);
		const body = buffer.subarray(offset + 8, offset + 8 + length);
		if (type === "IHDR") {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			colorType = body[9];
			if (body[8] !== 8 || body[12] !== 0 || (colorType !== 2 && colorType !== 6)) throw new Error("only 8-bit RGB/RGBA non-interlaced PNG is supported");
		} else if (type === "IDAT") idat.push(body);
		offset += 12 + length;
	}
	const channels = colorType === 6 ? 4 : 3;
	const stride = width * channels;
	const raw = inflateSync(Buffer.concat(idat));
	const data = new Uint8Array(width * height * 4);
	let previous = new Uint8Array(stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
		for (let i = 0; i < stride; i++) {
			const a = i >= channels ? line[i - channels] : 0;
			const b = previous[i];
			const c = i >= channels ? previous[i - channels] : 0;
			if (filter === 1) line[i] = (line[i] + a) & 0xff;
			else if (filter === 2) line[i] = (line[i] + b) & 0xff;
			else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
			else if (filter === 4) line[i] = (line[i] + paeth(a, b, c)) & 0xff;
		}
		for (let x = 0; x < width; x++) {
			const s = x * channels, d = (y * width + x) * 4;
			data[d] = line[s];
			data[d + 1] = line[s + 1];
			data[d + 2] = line[s + 2];
			data[d + 3] = channels === 4 ? line[s + 3] : 255;
		}
		previous = line;
	}
	return { width, height, data };
}

const chunk = (type, body) => {
	const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
	const out = Buffer.alloc(12 + body.length);
	out.writeUInt32BE(body.length, 0);
	typed.copy(out, 4);
	out.writeUInt32BE(crc32(typed), 8 + body.length);
	return out;
};

export function encodePng({ width, height, data }) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (width * 4 + 1)] = 0;
		Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
	}
	return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
