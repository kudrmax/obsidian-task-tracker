import type { JSX } from "preact";
import type { ListModel, ListRow } from "../model/lists";
import { Card } from "./Card";

export interface ListProps {
	readonly list: ListModel;
	readonly classes?: string;
	/** Rows drawn as their place only (a carried card waiting where it stood, a renamed card under its field). */
	readonly hidden?: ReadonlySet<string>;
	/** What stands among the rows besides them (the field typed in this list), by the key it stands before; `end` after the last. */
	readonly extra?: ReadonlyMap<string, JSX.Element>;
	/** The card the search led to: it wears the ring. */
	readonly found?: string | null;
	/** Whose acts its cards' taps are (see `Card`). */
	readonly scope?: string;
}

/**
 * A column of rows, each keyed by who it is (P1): headers of sections, No tasks plates, cards with their subtasks under
 * them a level in, the branches running to each. Motion within it is `motion`'s, by the rows' keys.
 */
export function List({ list, classes, hidden, extra, found, scope }: ListProps): JSX.Element {
	const row = (r: ListRow): JSX.Element => {
		switch (r.kind) {
			case "head":
				return (
					<div key={r.key} class={r.ungrouped ? "tc-n-group-head tc-n-group-head-ungrouped" : "tc-n-group-head"} data-n-key={r.key}>
						<span class="tc-n-group-name">{r.name}</span>
					</div>
				);
			case "plate":
				return (
					<div key={r.key} class="tc-n-plate" data-n-key={r.key} data-n-act="plate">
						{r.words}
					</div>
				);
			case "card":
				return (
					<Card
						key={r.key}
						rowKey={r.key}
						face={r.face}
						branch={r.branch}
						listed
						classes={hidden?.has(r.key) ? "is-away" : found === r.key ? "is-found" : undefined}
						scope={scope}
					/>
				);
		}
	};
	const rows: JSX.Element[] = [];
	for (const r of list.rows) {
		const before = extra?.get(r.key);
		if (before) rows.push(before);
		rows.push(row(r));
	}
	const end = extra?.get("end");
	if (end) rows.push(end);
	return <div class={classes ? `tc-n-list ${classes}` : "tc-n-list"}>{rows}</div>;
}
