import { Fragment, memo, type ReactNode, useEffect, useMemo, useState } from "react";
import { SearchLayer } from "../layers/Popover";
import type { Found, FoundPart } from "../port";
import { useScreen, useScreenApi } from "../store";
import { CardFace } from "./Card";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { ObsidianEditor } from "./ObsidianEditor";
import { ReadingList } from "./TaskList";

/** A row of the finds: a list's name, or a find under it. */
type FoundRowOf = { readonly kind: "head"; readonly key: string; readonly title: string } | { readonly kind: "hit"; readonly key: string; readonly hit: Found };

/** Where a task stands among the projects, top project first: «Дружба › iPhone». */
const PATH_STEP = " › ";

/**
 * The search (the design's «Поиск», F250–F254): one field and the tasks the port finds for what is typed, grouped under
 * their lists' names. On the phone it covers the view, the field over the keyboard with Cancel, the results above it; on
 * the desktop a panel hangs from the view's top, the arrows walk its rows (stopping at the ends), Enter opens the one
 * walked to. A pick takes the screen to the task (F255).
 */
export const Search = memo(function Search({ view }: { readonly view: Element | null }) {
	const api = useScreenApi();
	const { layerRoot, desk } = useHost();
	const open = useScreen((s) => s.sheet === "search");
	const close = () => api.getState().openSheet(null);
	return (
		<SearchLayer open={open} onClose={close} root={layerRoot} view={view} desk={desk}>
			<SearchBody desk={desk} onCancel={close} />
		</SearchLayer>
	);
});

function SearchBody({ desk, onCancel }: { readonly desk: boolean; readonly onCancel: () => void }) {
	const api = useScreenApi();
	const found = useScreen((s) => s.found);
	/** The finds as the list draws them: each group's name over its finds. */
	const rows = useMemo(
		(): readonly FoundRowOf[] => found.groups.flatMap((group): FoundRowOf[] => [{ kind: "head", key: `head:${group.title}`, title: group.title }, ...group.hits.map((hit): FoundRowOf => ({ kind: "hit", key: `${group.title}:${hit.id}`, hit }))]),
		[found],
	);
	const hits = useMemo(() => rows.flatMap((row) => (row.kind === "hit" ? [row] : [])), [rows]);
	/** The row the arrows walked to: the first of each answer on the desktop, none on the phone. */
	const [walked, setWalked] = useState(0);
	useEffect(() => setWalked(0), [found]);
	const pick = (id: string) => api.getState().goToFound(id);
	const field = (
		<label className="tc-search-field">
			<Icon name="search" />
			<ObsidianEditor
				text=""
				className="tc-quick-field tc-title-field tc-search-input"
				placeholder="Search tasks"
				onChange={(text) => api.getState().searchFor(text)}
				onEnter={() => {
					const hit = hits[walked];
					if (desk && hit) pick(hit.hit.id);
				}}
				onEscape={onCancel}
				onArrow={(step) => setWalked((at) => Math.min(hits.length - 1, Math.max(0, at + step)))}
			/>
		</label>
	);
	const walkedRow = desk && hits[walked] ? rows.indexOf(hits[walked]) : null;
	const results =
		found.query !== "" && rows.length === 0 ? (
			<div className="tc-search-results">
				<div className="tc-search-empty">No tasks found</div>
			</div>
		) : rows.length === 0 ? null : (
			<ReadingList count={rows.length} keyOf={(index) => rows[index].key} reveal={walkedRow} className="tc-search-results">
				{(index) => {
					const row = rows[index];
					return row.kind === "head" ? (
						<div className="tc-group-head">
							<div className="tc-group-name">{row.title}</div>
						</div>
					) : (
						<FoundRow hit={row.hit} walked={index === walkedRow} onPick={() => pick(row.hit.id)} />
					);
				}}
			</ReadingList>
		);
	if (desk)
		return (
			<>
				{field}
				{results}
			</>
		);
	return (
		<>
			{results}
			<div className="tc-search-bar">
				{field}
				<button type="button" className="tc-btn is-text is-accent tc-search-cancel" onClick={onCancel}>
					Cancel
				</button>
			</div>
		</>
	);
}

/** The found words picked out of the text they stand in (the design: weight 600 on the selection's colour). */
function Parts({ parts }: { readonly parts: readonly FoundPart[] }): ReactNode {
	return parts.map((part, i) =>
		part.match ? (
			<mark key={i} className="tc-hit">
				{part.text}
			</mark>
		) : (
			<Fragment key={i}>{part.text}</Fragment>
		),
	);
}

/**
 * A found task as its list's card (F252, F254): the found words picked out of the title; found in its project's name or
 * its notes, that line under the title; a project chosen, the task's place among the projects small over the title.
 */
function FoundRow({ hit, walked, onPick }: { readonly hit: Found; readonly walked: boolean; readonly onPick: () => void }) {
	const title = hit.title.length > 0 ? <Parts parts={hit.title} /> : null;
	return (
		<CardFace
			face={hit.face}
			className={`tc-card tc-hit-card${walked ? " is-picked" : ""}${hit.line ? " has-snippet" : ""}`}
			lines={{
				over: hit.path ? hit.path.join(PATH_STEP) : null,
				title,
				under: hit.line ? (
					<div className={`tc-hit-desc${hit.line.kind === "project" ? " is-project" : ""}`}>
						{hit.line.kind === "notes" ? <Icon name="description" /> : null}
						<Parts parts={hit.line.parts} />
					</div>
				) : null,
			}}
			role="option"
			aria-selected={walked}
			onClick={onPick}
		/>
	);
}
