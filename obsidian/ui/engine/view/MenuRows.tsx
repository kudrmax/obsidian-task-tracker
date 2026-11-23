import type { CSSProperties } from "react";
import type { IconName } from "../../shared/icons";
import { PROPERTY } from "../../shared/design";
import { Icon } from "./Icon";

/** The menu's rows, drawn alike wherever a list of rows stands: the task menu's pages and the bar's Project panel. */
export interface RowSpec {
	readonly label: string;
	readonly icon?: IconName;
	readonly value?: string;
	readonly disabled?: boolean;
	/** One of a list to choose from: its check in the accent. */
	readonly choice?: boolean;
	readonly quiet?: boolean;
	/** Takes the focus as it mounts: what asked a question taken back by Cancel. */
	readonly focus?: boolean;
	/** How many steps in it stands: a subproject under its project. */
	readonly depth?: number;
	/** Its run waits: a spinning ring in the icon's place (the assistant's Stop, F263). */
	readonly busy?: boolean;
	/** The row's own classes beside `tc-menu-row`. */
	readonly className?: string;
	readonly onPick: () => void;
}

export function RowGroup({ rows }: { readonly rows: readonly RowSpec[] }) {
	return (
		<div className="tc-menu-group">
			{rows.map((row) => (
				<Row key={row.label} {...row} />
			))}
		</div>
	);
}

/** A row: the label, a value beside it, the icon on the right; or, as the way back, the icon leading the label. */
export function Row({ label, icon, value, disabled, choice, quiet, focus, depth, busy, onPick, className = "", lead = false }: RowSpec & { readonly lead?: boolean }) {
	const root = className.includes("tc-menu-back") ? className : `tc-menu-row ${className}`;
	return (
		<button type="button" role="menuitem" className={`tc-btn ${root}${choice ? " is-choice" : ""}${quiet ? " is-quiet" : ""}`.trim()} style={depth === undefined ? undefined : ({ [PROPERTY.level]: String(depth) } as CSSProperties)} disabled={disabled} autoFocus={focus} onClick={onPick}>
			{lead ? (
				<>
					{icon ? <Icon name={icon} /> : null}
					{label}
				</>
			) : (
				<>
					<span className="tc-menu-label">{label}</span>
					{value ? <span className="tc-menu-value">{value}</span> : null}
					{busy ? <span className="tc-spinner" /> : icon ? <Icon name={icon} /> : null}
				</>
			)}
		</button>
	);
}

