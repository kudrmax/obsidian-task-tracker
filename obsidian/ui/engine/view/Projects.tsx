import { type CSSProperties, type FocusEvent, useRef } from "react";
import { PROPERTY } from "../../design";
import type { ProjectChoice } from "../port";
import { Icon } from "./Icon";
import { ObsidianEditor } from "./ObsidianEditor";

/**
 * A Project page's choices, the menu's and the bar's alike (F122, F123, F187; the plugin's `projectChooser`): the tree in
 * its order, a subproject a step further in, a check on each the task has, a folder dim unless the task has it; No
 * project last.
 */
export function ProjectRows({ projects, onToggle, onNone }: { readonly projects: readonly ProjectChoice[]; readonly onToggle: (name: string) => void; readonly onNone: () => void }) {
	return (
		<div className="tc-menu-group">
			{projects.map((option) => (
				<button key={option.name} type="button" role="menuitem" className="tc-btn tc-menu-row is-choice tc-project-option" style={{ [PROPERTY.level]: String(option.depth) } as CSSProperties} disabled={option.folder && !option.on} onClick={() => onToggle(option.name)}>
					<span className="tc-menu-label">{option.name}</span>
					{option.on ? <Icon name="check" /> : null}
				</button>
			))}
			<button type="button" role="menuitem" className="tc-btn tc-menu-row is-choice is-quiet" onClick={onNone}>
				<span className="tc-menu-label">No project</span>
				{projects.some((option) => option.on) ? null : <Icon name="check" />}
			</button>
		</div>
	);
}

/** «New project…», apart under the projects as New section is (F220). */
export function NewProjectRow({ onPick }: { readonly onPick: () => void }) {
	return (
		<button type="button" role="menuitem" className="tc-btn tc-menu-row is-apart is-add tc-new-project" onClick={onPick}>
			<span className="tc-menu-label">New project…</span>
			<Icon name="plus" />
		</button>
	);
}

/**
 * «New project…»'s name, in place of the projects (F220; the plugin's `projectNamePage`): the way back, then one line in a
 * capsule ringed in the accent, «Project name» while empty, the caret in it. Enter ends it with the name, Escape and the
 * way back with none; it ends once.
 * `onLeave`: the focus went elsewhere before it ended.
 */
export function ProjectNameField({ onEnd, onLeave }: { readonly onEnd: (name: string | null) => void; readonly onLeave?: (event: FocusEvent<HTMLDivElement>) => void }) {
	const ended = useRef(false);
	const end = (name: string | null) => {
		if (ended.current) return;
		ended.current = true;
		onEnd(name);
	};
	return (
		<div>
			<button type="button" role="menuitem" className="tc-btn tc-menu-back" onClick={() => end(null)}>
				<Icon name="chevronLeft" />
				New project
			</button>
			<div className="tc-menu-group tc-project-name">
				<ObsidianEditor text="" className="tc-quick-field tc-title-field tc-project-name-field" placeholder="Project name" onEnter={end} onEscape={() => end(null)} onLeave={onLeave ? (event) => (ended.current ? undefined : onLeave(event)) : undefined} />
			</div>
		</div>
	);
}
