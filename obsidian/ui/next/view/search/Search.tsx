import type { FoundPart, SearchHit } from "../../../../../core/application/contracts";
import type { JSX } from "preact";
import { type BlockModel, noteView, settings } from "../../model/block";
import { cardFace } from "../../model/card";
import { pathOf, pickedRow, searchGroups, snippetOf } from "../../model/search";
import { Card, colourAttributes, Title } from "../Card";
import { Icon } from "../icons";

/** The found words picked out of the text they stand in. */
function Parts({ parts }: { readonly parts: readonly FoundPart[] }): JSX.Element {
	return <>{parts.map((part, i) => (part.match ? <mark key={i} class="tc-n-hit">{part.text}</mark> : part.text))}</>;
}

/**
 * A found task as its card (the old `searchRows`): the found words picked out of the title; found in its project's name,
 * that name's line under the title, else found in the description, the description's line. With paths (a filter is
 * chosen, as in the note's block), the task's place among the projects stands small over its title after the folder.
 */
function HitCard({ hit, row, picked, paths }: { readonly hit: SearchHit; readonly row: number; readonly picked: boolean; readonly paths: boolean }): JSX.Element {
	const face = cardFace(hit.item, null);
	const path = pathOf(hit, paths);
	const ring = picked ? " is-picked" : "";
	if (path === null && face.over !== null) {
		return (
			<div class={`tc-n-hit-row${ring}`} data-n-act="search:pick" data-n-value={String(row)}>
				<Card rowKey={`hit:${row}`} face={face} branch={null} listed={false} classes="tc-n-hit-card" bare />
			</div>
		);
	}
	const snippet = path === null ? snippetOf(hit) : null;
	const title = (
		<div class="tc-n-card-title">{hit.title.length > 0 && !(path !== null && hit.item.card.step) ? <Parts parts={hit.title} /> : <Title parts={face.title} />}</div>
	);
	const cls = ["tc-n-card", "tc-n-hit-card", path !== null ? "tc-n-card-two" : "", snippet ? "tc-n-card-snippet" : ""].filter(Boolean).join(" ");
	return (
		<div class={`tc-n-hit-row${ring}`} data-n-act="search:pick" data-n-value={String(row)}>
			<div class={cls} data-status={face.status} {...colourAttributes(face)}>
				<span class="tc-n-progress-dot" />
				{path !== null ? (
					<div class="tc-n-card-lines">
						<div class="tc-n-card-over">
							<Icon name="project" />
							<span class="tc-n-card-over-text">{path}</span>
						</div>
						{title}
					</div>
				) : snippet ? (
					<div class="tc-n-hit-text">
						{title}
						<div class={hit.project ? "tc-n-hit-desc tc-n-hit-project" : "tc-n-hit-desc"}>
							<Parts parts={snippet} />
						</div>
					</div>
				) : (
					title
				)}
				{path === null && face.project !== null ? (
					<span class="tc-n-project-mark" aria-label={face.project} title={face.project}>
						<Icon name="project" />
					</span>
				) : null}
				{face.meta ? (
					<span class={face.meta.count !== null && face.meta.description ? "tc-n-meta tc-n-meta-pair" : "tc-n-meta"}>
						{face.meta.count !== null ? <span class="tc-n-count">{face.meta.count}</span> : null}
						{face.meta.description ? <Icon name="description" cls="tc-n-desc-mark" /> : null}
					</span>
				) : null}
				{face.due ? (
					<span class={face.due.day === null ? "tc-n-due tc-n-due-repeat-only" : "tc-n-due"}>
						{face.due.repeats ? (
							<span class="tc-n-due-top">
								{face.due.day !== null ? <span class="tc-n-due-day">{face.due.day}</span> : null}
								<Icon name="repeat" cls="tc-n-due-repeat" />
							</span>
						) : face.due.day !== null ? (
							<span class="tc-n-due-day">{face.due.day}</span>
						) : null}
						{face.due.month !== null ? <span class="tc-n-due-mon">{face.due.month}</span> : null}
					</span>
				) : null}
			</div>
		</div>
	);
}

/** The found tasks, grouped by section, each group under its section's name (`listNames`). */
function Results({ model }: { readonly model: BlockModel }): JSX.Element | null {
	const groups = model.search?.closing ? [] : searchGroups(model.answers);
	const paths = noteView(model)?.searchPaths ?? false;
	const picked = pickedRow(model.wide, model.search, model.answers);
	const names = new Map(Object.entries(settings(model)?.sections ?? {}));
	let row = 0;
	const rows: JSX.Element[] = [];
	for (const group of groups) {
		rows.push(
			<div key={`head:${group.list}`} class="tc-n-group-head">
				<div class="tc-n-group-name">{names.get(group.list) ?? group.list}</div>
			</div>,
		);
		for (const hit of group.hits) {
			rows.push(<HitCard key={`${group.list}:${hit.item.id}`} hit={hit} row={row} picked={row === picked} paths={paths} />);
			row++;
		}
	}
	const empty = groups.length === 0 && (model.search?.query ?? "") !== "" && !model.search?.closing;
	if (rows.length === 0 && !empty) return null;
	return (
		<div class="tc-n-search-results">
			{rows}
			{empty ? <div class="tc-n-search-empty">No tasks found</div> : null}
		</div>
	);
}

function Field(): JSX.Element {
	return (
		<label class="tc-n-search-field">
			<Icon name="search" />
			<input class="tc-n-search-input" type="text" placeholder="Search tasks" aria-label="Search tasks" data-n-field="search" />
		</label>
	);
}

/**
 * The phone's search, over the block itself: the found tasks above, the field over the keyboard at the bottom with Cancel.
 * Nothing on the desktop, whose search is a panel over the screen (`SearchOver`).
 */
export function SearchInBlock({ model }: { readonly model: BlockModel }): JSX.Element | null {
	if (!model.search || model.wide) return null;
	return (
		<div class="tc-n-search" data-n-part="search" data-n-layer="-1" data-n-closing={model.search.closing ? "" : undefined}>
			<Results model={model} />
			<div class="tc-n-search-bar">
				<Field />
				<button class="tc-n-btn tc-n-text tc-n-search-cancel" data-n-act="search:cancel">
					Cancel
				</button>
			</div>
		</div>
	);
}

/** The desktop's search: a panel hanging from the top of the block, in its middle, over the dimmed screen; the arrows walk its rows. */
export function SearchOver({ model }: { readonly model: BlockModel }): JSX.Element | null {
	if (!model.search || !model.wide) return null;
	const closing = model.search.closing ? "" : undefined;
	return (
		<>
			<div class="tc-n-backdrop" data-n-part="backdrop" data-n-layer="-1" data-n-closing={closing} data-n-act="search:dismiss" />
			<div class="tc-n-search tc-n-search-desk" data-n-part="panel" data-n-layer="-1" data-n-place="block" data-n-how="top" data-n-closing={closing}>
				<Field />
				<Results model={model} />
			</div>
		</>
	);
}
