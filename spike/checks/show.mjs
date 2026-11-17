const d = JSON.parse(require("fs").readFileSync(process.argv[2]));
const ids = (d.ids ?? d.watch).slice(0, +(process.argv[3] ?? 3));
let last = "";
for (const r of d.samples) {
	const line = ids.map((id) => `${id}:${JSON.stringify(r[id])}${r[id + "@"]?.length ? "ov" + JSON.stringify(r[id + "@"]) : ""}`).join(" ");
	if (line !== last) console.log(r.t, line);
	last = line;
}
