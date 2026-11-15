import type { JSX } from "preact";
import type { BlockModel } from "../../model/block";
import { floatFace } from "../../model/carryView";
import { Card } from "../Card";

/**
 * The copy of the carried card under the finger (the old screen's `FloatingCard`): fixed over everything, moved by
 * `motion` alone (the transient channel, no render per move); a task carrying subtasks, or several picked, as a stack
 * of layers under it, their number on its corner.
 */
export function CarryFloat({ model }: { readonly model: BlockModel }): JSX.Element | null {
	const float = floatFace(model);
	if (!float) return null;
	return (
		<>
			{float.stacked ? <div class="tc-n-float-under tc-n-float-under-2" data-n-float="under" /> : null}
			{float.stacked ? <div class="tc-n-float-under tc-n-float-under-1" data-n-float="under" /> : null}
			<div class="tc-n-float" data-n-float="card">
				<Card rowKey="float" face={float.face} branch={null} listed={false} copy />
			</div>
			{float.count > 1 ? (
				<div class="tc-n-float-count" data-n-float="count">
					{String(float.count)}
				</div>
			) : null}
		</>
	);
}
