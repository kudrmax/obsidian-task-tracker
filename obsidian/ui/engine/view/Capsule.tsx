import { memo, useState } from "react";
import { isIconName } from "../../shared/icons";
import { useOriginSetter } from "../layers/Layers";
import { Popover } from "../layers/Popover";
import { useScreen, useScreenApi } from "../store";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { RowGroup, type RowSpec } from "./MenuRows";

/**
 * The capsule opposite the plus (the design's «Отмена» and «Поиск»; F259, F267): two cells, Undo taking the screen's last
 * action back, its icon dim while there is none, and «⋯» opening its menu over the capsule (F261), its dots a spinning
 * ring while the assistant's run waits (F262). In Select tasks the same capsule holds the cross that ends it and how many
 * are picked (F136, the design's «Выбор задач»). It hides with the plus: while a task is typed, a card or the plus is
 * carried.
 */
export const Capsule = memo(function Capsule() {
	const picking = useScreen((s) => s.picking);
	const hidden = useScreen((s) => s.entry !== null || s.gesture === "drag");
	const [capsule, setCapsule] = useState<HTMLDivElement | null>(null);
	return (
		<>
			<div ref={setCapsule} className={`tc-capsule${hidden || picking ? " is-hidden" : ""}`}>
				<UndoMore />
			</div>
			<div className={`tc-capsule tc-select-capsule${hidden || !picking ? " is-hidden" : ""}`}>
				<CrossCount />
			</div>
			<MoreMenu capsule={capsule} />
		</>
	);
});

/** The capsule's cells: Undo, dim with nothing to take back, and «⋯», a spinning ring while the assistant's question waits. */
function UndoMore() {
	const api = useScreenApi();
	const canUndo = useScreen((s) => s.canUndo);
	const busy = useScreen((s) => s.busy);
	return (
		<>
			<button type="button" className={`tc-btn is-icon is-plain tc-undo${canUndo ? "" : " is-off"}`} aria-label="Undo" title="Undo" aria-disabled={!canUndo} onClick={() => api.getState().undo()}>
				<Icon name="undo" />
			</button>
			<button type="button" className={`tc-btn is-icon is-plain tc-more-open${busy ? " is-busy" : ""}`} aria-label="More" title="More" onClick={() => api.getState().openSheet("more")}>
				{busy ? <span className="tc-spinner" /> : <Icon name="more" />}
			</button>
		</>
	);
}

/** Select tasks' cells of the same capsule: the cross that ends it, and how many are picked, dim at none, opening their menu. */
function CrossCount() {
	const api = useScreenApi();
	const count = useScreen((s) => s.picked.length);
	const standBy = useOriginSetter();
	return (
		<>
			<button type="button" className="tc-btn is-icon is-plain tc-select-exit" aria-label="Stop selecting" title="Stop selecting" onClick={() => api.getState().setPicking(false)}>
				<Icon name="cross" />
			</button>
			<button
				type="button"
				className={`tc-btn is-icon is-plain tc-select-num${count === 0 ? " is-off" : ""}`}
				aria-label="Picked tasks"
				aria-disabled={count === 0}
				onClick={(event) => {
					standBy(event.currentTarget);
					api.getState().openBulk();
				}}
			>
				{count}
			</button>
		</>
	);
}

/** The copy over a layer's backdrop of what it opened from (the design's copies of the capsule and the circle over the blur). */
export function ControlCopy({ of }: { readonly of: "capsule" | "picks" | "circle" }) {
	if (of === "circle") return <PickedCircle off={false} hidden={false} onPress={() => undefined} />;
	return <div className="tc-capsule">{of === "capsule" ? <UndoMore /> : <CrossCount />}</div>;
}

/**
 * «⋯»'s menu over the capsule (the design's «Выбор задач»: two rows, then the assistant's): Search, Select tasks, and the
 * rows the assistant offers, Best task with its sparkles or Stop with the spinning ring while its run waits (F261–F263).
 * While it is open the assistant's rows follow the port: a run that ends turns Stop back into Best task.
 */
function MoreMenu({ capsule }: { readonly capsule: Element | null }) {
	const api = useScreenApi();
	const { layerRoot } = useHost();
	const open = useScreen((s) => s.sheet === "more");
	const offered = useScreen((s) => s.moreRows);
	const rows: RowSpec[] = [
		{ label: "Search", icon: "search", onPick: () => api.getState().openSheet("search") },
		{ label: "Select tasks", icon: "select", onPick: () => api.getState().setPicking(true) },
		...offered.map((row): RowSpec => ({ label: row.label, ...(row.running ? { busy: true } : isIconName(row.icon) ? { icon: row.icon } : {}), className: "tc-assistant-row", onPick: () => api.getState().pressMore(row.id) })),
	];
	return (
		<Popover open={open} onClose={() => api.getState().openSheet(null)} root={layerRoot} reference={capsule} placement="top-start" label="More" className="is-more" copy={<ControlCopy of="capsule" />}>
			<RowGroup rows={rows} />
		</Popover>
	);
}

/**
 * The circle in the plus's place in Select tasks (the design's «Выбор задач», `SelectRow` variant 2): «⋯» on the accent,
 * opening the menu for every picked task over it; dim while none is picked (F136, F137).
 */
export const PickedButton = memo(function PickedButton() {
	const api = useScreenApi();
	const none = useScreen((s) => s.picked.length === 0);
	const hidden = useScreen((s) => !s.picking || s.gesture === "drag");
	const standBy = useOriginSetter();
	return (
		<PickedCircle
			off={none}
			hidden={hidden}
			onPress={(button) => {
				standBy(button);
				api.getState().openBulk();
			}}
		/>
	);
});

function PickedCircle({ off, hidden, onPress }: { readonly off: boolean; readonly hidden: boolean; readonly onPress: (button: HTMLElement) => void }) {
	return (
		<button
			type="button"
			data-picked-menu=""
			className={`tc-btn is-round is-accent tc-select-menu${off ? " is-off" : ""}${hidden ? " is-hidden" : ""}`}
			aria-label="Actions for picked tasks"
			aria-disabled={off}
			onClick={(event) => onPress(event.currentTarget)}
		>
			<Icon name="more" />
		</button>
	);
}
