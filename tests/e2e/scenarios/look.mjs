/**
 * Screenshots of every place and mode, for a person to look at against the design and the released screen (a look is
 * not a pass: the scenarios check behaviour; these are the frames someone looks at). Fails only on a page error.
 */
export default {
	name: "look",
	features: ["F10", "F12", "F16", "F17", "F24", "F27", "F294"],
	async run(t) {
		for (const place of ["inbox", "soon", "calendar"]) {
			await t.setPlace(place);
			await t.open();
			await t.shot(`two-columns-${place}`);
		}
		const modes = t.platform === "desktop" ? ["allColumns", "rows", "byProject"] : ["rows", "byProject"];
		for (const mode of modes) {
			await t.setMode(mode);
			await t.sleep(500);
			await t.shot(mode);
		}
	},
};
