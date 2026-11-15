import type { JSX } from "preact";
import type { ListModel, ListRow } from "../model/lists";
import { Branches, Card } from "./Card";
import { titleParts } from "../model/card";

/** How the carry and the picks show on a list's rows. */
export interface RowMarks {
	/** Carried cards waiting as dashed places where they stood. */
	readonly waiting: ReadonlySet<string>;
	/** The card a drop lands on, drawn as its place until the float is down on it. */
	readonly arriving: string | null;
	/** The No tasks plate lit under a carried card. */
	readonly hot: string | null;
	/** Select tasks: every card shows its circle. */
	readonly picking: boolean;
	readonly picked: ReadonlySet<string>;
}

export const NO_MARKS: RowMarks = { waiting: new Set(), arriving: null, hot: null, picking: false, picked: new Set() };

export interface ListProps {
	readonly list: ListModel;
	readonly classes?: string;
	/** The list's column (or `projects`): what the carry's measure reads it as (`data-n-list`), the entry's name for it (a double click on its free room types a task at its end). */
	readonly column?: string;
	readonly marks?: RowMarks;
	/** Rows drawn as their place only (a carried card waiting where it stood, a renamed card under its field). */
	readonly hidden?: ReadonlySet<string>;
	/** What stands among the rows besides them (the field typed in this list), by the key it stands before; `end` after the last. */
	readonly extra?: ReadonlyMap<string, JSX.Element>;
}

/**
 * A column of rows, each keyed by who it is (P1): headers of sections, No tasks plates, cards with their subtasks under
 * them a level in, the branches running to each. Motion within it is `motion`'s, by the rows' keys.
 */
export function List({ list, classes, column, marks = NO_MARKS, hidden, extra }: ListProps): JSX.Element {
	const cardClasses = (key: string): string | undefined => {
		const all = [
			marks.picking ? "tc-n-card-picking" : "",
			marks.picked.has(key) ? "is-picked" : "",
			marks.waiting.has(key) ? "is-waiting" : "",
			marks.arriving === key ? "is-arriving" : "",
			hidden?.has(key) ? "is-away" : "",
		].filter(Boolean);
		return all.length > 0 ? all.join(" ") : undefined;
	};
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
					<div key={r.key} class={marks.hot === r.key ? "tc-n-plate is-hot" : "tc-n-plate"} data-n-key={r.key} data-n-act="plate">
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
						classes={cardClasses(r.key)}
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
		<div class={classes ? `tc-n-list ${classes}` : "tc-n-list"} data-n-list={column} data-n-dblact={column === undefined ? undefined : "room"} data-n-value={column}>
			{rows}
		</div>
	);
}

/** A line typed and not yet written: a plain card, its title alone. */
function unwritten(text: string) {
	return { tint: null, stripes: [], folded: false, status: "todo" as const, over: null, title: titleParts(text), project: null, meta: null, due: null, stage: null };
}
