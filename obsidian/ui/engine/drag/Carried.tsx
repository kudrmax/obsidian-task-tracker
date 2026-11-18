import { type CSSProperties, memo } from "react";
import { DESIGN, PROPERTY } from "../../design";
import { Card } from "../Card";
import { useHost, useScreen } from "../ScreenContext";
import type { Lifted } from "./dragState";

/**
 * The carried copy of a task's card, by the task it is given (dnd-kit keeps the overlay's last children through its drop
 * animation, so nothing here follows the store's drag): its card at full width, stretched right to show its whole title;
 * a task with subtasks over a stack of layers.
 */
export const Carried = memo(function Carried({ lifted }: { readonly lifted: Extract<Lifted, { kind: "task" }> }) {
	const { width } = useHost();
	const date = useScreen((s) => s.date);
	return (
		<div className="tc-carried" data-carried={lifted.id} style={{ [PROPERTY.carriedMax]: `${width - DESIGN.dividerWidth}px` } as CSSProperties}>
			{Array.from({ length: lifted.layers }, (_, i) => (
				<span key={i} className={`tc-carried-layer is-${lifted.layers - i}`} />
			))}
			<Card id={lifted.id} day={lifted.from === "day" ? date : null} copy />
		</div>
	);
});
