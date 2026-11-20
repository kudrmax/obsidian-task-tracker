/** A file's text, bundled into main.js. */
declare module "*?raw" {
	const text: string;
	export default text;
}

/** `import binary from "./x.node"`: the file's bytes in base64, as esbuild's `base64` loader embeds them. */
declare module "*.node" {
	const base64: string;
	export default base64;
}
