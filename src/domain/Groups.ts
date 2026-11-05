/** The `###` sections inside a list: the names a drag offers to start one with, and the name of the tasks outside any. */
export interface GroupSettings {
	/** In the order the zones under a dragged card offer them. */
	readonly presets: readonly string[];
	/** The heading over the tasks outside any section, once a list has sections; `### <this>` in the file is that group. */
	readonly ungrouped: string;
}
