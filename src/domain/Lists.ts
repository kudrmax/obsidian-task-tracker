import type { GroupName } from "./Task";

/** The lists that hold sections. */
export type GroupedList = "inbox" | "backlog" | "soon" | "now";

/** The lists a task is put at the end of: a drop on such a column from another one, or at the end of its own. */
export type EndList = "inbox" | "backlog" | "soon";

/** Where a section goes among the sections of its list: before another one, or last. */
export type GroupPlace = { readonly before: GroupName } | "end";
