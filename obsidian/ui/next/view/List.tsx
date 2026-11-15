import type { JSX } from "preact";
import type { ListModel, ListRow } from "../model/lists";
import { Branches, Card } from "./Card";
import { titleParts } from "../model/card";

export interface ListProps {
	readonly list: ListModel;
	readonly classes?: string;
	/** Rows drawn as their place only (a carried card waiting where it stood, a renamed card under its field). */
	readonly hidden?: ReadonlySet<string>;
	/** What stands among the rows besides them (the field typed in this list), by the key it stands before; `end` after the last. */
	readonly extra?: ReadonlyMap<string, JSX.Element>;
	/** The entry's name for the list: a double click on its free room types a task at its end. */
	readonly column?: string;
}

/**
 * A column of rows, each keyed by who it is (P1): headers of sections, No tasks plates, cards with their subtasks under
 * them a level in, the branches running to each. Motion within it is `motion`'s, by the rows' keys.
 */
export function List({ list, classes, hidden, extra, column }: ListProps): JSX.Element {
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
						classes={hidden?.has(r.key) ? "is-away" : undefined}
					/>
				);
			case "unwritten":
				return <Card key={r.key} rowKey={r.key} face={unwritten(r.text)} branch={r.branch} listed={false} />;
			case "field":
				return (
					<div key={r.key} class={r.section ? "tc-n-entry-row tc-n-entry-section" : "tc-n-entry-row"} data-n-key={r.key} data-status={r.status ?? undefined}>
						<span class="tc-n-progress-dot" />
						<div class={r.section ? "tc-n-field is-section" : "tc-n-field"} data-priority={r.tint ?? undefined} data-n-island="field" />
						{r.branch ? <Branches branch={r.branch} rowKey={r.key} /> : null}
					</div>
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
	/** The field's room at the list's end: on the phone the bar over the keyboard stands there. */
	if (list.rows.some((r) => r.kind === "field")) rows.push(<div key="entry-room" class="tc-n-entry-room" />);
	return (
		<div class={classes ? `tc-n-list ${classes}` : "tc-n-list"} data-n-dblact={column === undefined ? undefined : "room"} data-n-value={column}>
			{rows}
		</div>
	);
}

/** A line typed and not yet written: a plain card, its title alone. */
function unwritten(text: string) {
	return { tint: null, stripes: [], folded: false, status: "todo" as const, over: null, title: titleParts(text), project: null, meta: null, due: null, stage: null };
}
