import type { ComponentChildren, JSX } from "preact";
import { Icon, type IconName } from "./icons";

/**
 * The parts of a layer (the old screen's `Overlay`, `Panel`, `LiftedCopy`): the blurred dark sheet, a copy of what was
 * pressed standing over it, and the panel. `motion` places the copy and the panel by their anchor (`data-n-place`) and
 * fades them in and out together; a tap on the sheet closes the layer.
 */
export function Backdrop({ layer, closing }: { readonly layer: number; readonly closing: boolean }): JSX.Element {
	return <div class="tc-n-backdrop" data-n-part="backdrop" data-n-layer={layer} data-n-closing={closing ? "" : undefined} data-n-act="dismiss" />;
}

/** Where `motion` stands a part: over its anchor (`data-n-anchor`), its copy on it, a panel centred on it or by its left edge. */
export type PlaceHow = "copy" | "centre" | "start";

/** What a placed part is: the view button's copy, the capsule's copy, the view menu's panel, «⋯»'s panel. */
export type PlacedKind = "viewCopy" | "capsuleCopy" | "viewPanel" | "morePanel";

export function Placed({ layer, closing, anchor, how, part, kind, children }: { readonly layer: number; readonly closing: boolean; readonly anchor: string; readonly how: PlaceHow; readonly part: string; readonly kind: PlacedKind; readonly children: ComponentChildren }): JSX.Element {
	const at = { "data-n-part": part, "data-n-layer": layer, "data-n-place": anchor, "data-n-how": how, "data-n-closing": closing ? "" : undefined };
	switch (kind) {
		case "viewCopy":
			return (
				<div class="tc-n-btn tc-n-round tc-n-view-btn tc-n-copy" {...at}>
					{children}
				</div>
			);
		case "capsuleCopy":
			return (
				<div class="tc-n-capsule tc-n-copy" {...at}>
					{children}
				</div>
			);
		case "viewPanel":
			return (
				<div class="tc-n-panel tc-n-panel-view" {...at}>
					{children}
				</div>
			);
		case "morePanel":
			return (
				<div class="tc-n-panel tc-n-panel-more" {...at}>
					{children}
				</div>
			);
	}
}

export interface RowSpec {
	readonly label: string;
	readonly icon?: IconName;
	/** One of a list to choose from: its label fades out, its check is the accent. */
	readonly choice?: boolean;
	/** What a tap on it is (`data-n-act`), and the value it carries (`data-n-value`). */
	readonly act: string;
	readonly value?: string;
}

/** A row of a panel: the label, the icon on the right. */
export function MenuRow({ spec }: { readonly spec: RowSpec }): JSX.Element {
	return (
		spec.choice ? (
			<button class="tc-n-btn tc-n-menu-row tc-n-menu-choice" data-n-act={spec.act} data-n-value={spec.value}>
				<span class="tc-n-menu-label">{spec.label}</span>
				{spec.icon ? <Icon name={spec.icon} /> : null}
			</button>
		) : (
			<button class="tc-n-btn tc-n-menu-row" data-n-act={spec.act} data-n-value={spec.value}>
				<span class="tc-n-menu-label">{spec.label}</span>
				{spec.icon ? <Icon name={spec.icon} /> : null}
			</button>
		)
	);
}

export function MenuGroup({ rows }: { readonly rows: readonly RowSpec[] }): JSX.Element {
	return (
		<div class="tc-n-menu-group">
			{rows.map((row) => (
				<MenuRow key={row.label} spec={row} />
			))}
		</div>
	);
}
