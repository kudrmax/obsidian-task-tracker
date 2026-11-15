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

/** Which list it is: a row's list (Rows), the parts By subprojects, the full card's subtasks. */
export type ListKind = "row" | "projects" | "full";

export interface ListProps {
	readonly list: ListModel;
	readonly kind: ListKind;
	/** The list's column (or `projects`): what the carry's measure reads it as (`data-n-list`), the entry's name for it (a double click on its free room types a task at its end). */
	readonly column?: string;
	readonly marks?: RowMarks;
	/** Rows drawn as their place only (a carried card waiting where it stood, a renamed card under its field). */
	readonly hidden?: ReadonlySet<string>;
	/** What stands among the rows besides them (the field typed in this list), by the key it stands before; `end` after the last. */
	readonly extra?: ReadonlyMap<string, JSX.Element>;
	/** The card the search led to: it wears the ring. */
	readonly found?: string | null;
	/** A section's name typed in place of its header: the header's row key, and the name it starts from. */
	readonly renaming?: { readonly head: string; readonly name: string } | null;
}

/**
 * A column of rows, each keyed by who it is (P1): headers of sections, No tasks plates, cards with their subtasks under
 * them a level in, the branches running to each. Motion within it is `motion`'s, by the rows' keys.
 */
export function List({ list, kind, column, marks = NO_MARKS, hidden, extra, found, renaming }: ListProps): JSX.Element {
	const row = (r: ListRow): JSX.Element => {
		switch (r.kind) {
			case "head":
				if (renaming?.head === r.key)
					return (
						<div key={r.key} class="tc-n-group-field" data-n-key={r.key}>
							<input
								type="text"
								class="tc-n-group-input"
								placeholder=" "
								aria-label="Section name"
								defaultValue={renaming.name}
								enterKeyHint="done"
								data-n-field="section"
								data-n-enter="section:named"
								data-n-escape="section:unnamed"
							/>
							<span class="tc-n-group-hint">Section name</span>
						</div>
					);
				return (
					<div key={r.key} class={`tc-n-group-head ${r.ungrouped ? "is-ungrouped" : ""} ${marks.waiting.has(r.key) ? "is-waiting" : ""}`} data-n-key={r.key} data-n-anchor={r.key} data-n-act={r.menu !== null || r.reorder ? "head" : undefined}>
						<span class="tc-n-group-name">{r.name}</span>
					</div>
				);
			case "plate":
				return (
					<div key={r.key} class={`tc-n-plate ${marks.hot === r.key ? "is-hot" : ""} ${marks.waiting.has(r.key) ? "is-waiting" : ""}`} data-n-key={r.key} data-n-act="plate">
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
						as="listed"
						full={kind === "full"}
						states={{ picking: marks.picking, picked: marks.picked.has(r.key), waiting: marks.waiting.has(r.key), arriving: marks.arriving === r.key, away: hidden?.has(r.key) === true, found: found === r.key }}
					/>
				);
			case "unwritten":
				return <Card key={r.key} rowKey={r.key} face={unwritten(r.text)} branch={r.branch} as="plain" />;
			case "field":
				return r.section ? (
					<div key={r.key} class="tc-n-entry-row tc-n-entry-section" data-n-key={r.key} data-status={r.status ?? undefined}>
						<span class="tc-n-progress-dot" />
						<div class="tc-n-field tc-n-section-field" data-priority={r.tint ?? undefined} data-n-island="field" />
						{r.branch ? <Branches branch={r.branch} rowKey={r.key} /> : null}
					</div>
				) : (
					<div key={r.key} class="tc-n-entry-row" data-n-key={r.key} data-status={r.status ?? undefined}>
						<span class="tc-n-progress-dot" />
						<div class="tc-n-field" data-priority={r.tint ?? undefined} data-n-island="field" />
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
	const room = column === undefined ? undefined : "room";
	switch (kind) {
		case "row":
			return (
				<div class="tc-n-list tc-n-row-list" data-n-list={column} data-n-dblact={room} data-n-value={column}>
					{rows}
				</div>
			);
		case "projects":
			return (
				<div class="tc-n-list tc-n-projects-list" data-n-list={column} data-n-dblact={room} data-n-value={column}>
					{rows}
				</div>
			);
		case "full":
			return (
				<div class="tc-n-list tc-n-full-list" data-n-list={column} data-n-dblact={room} data-n-value={column}>
					{rows}
				</div>
			);
	}
}

/** A line typed and not yet written: a plain card, its title alone. */
function unwritten(text: string) {
	return { tint: null, stripes: [], folded: false, status: "todo" as const, over: null, title: titleParts(text), project: null, meta: null, due: null, stage: null };
}
