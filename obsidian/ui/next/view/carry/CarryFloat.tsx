import type { JSX } from "preact";
import type { BlockModel } from "../../model/block";
import { floatFace } from "../../model/carryView";
import { Card } from "../Card";
import { Icon } from "../icons";

/**
 * The copy of the carried card under the finger (the old screen's `FloatingCard`): fixed over everything, moved by
 * `motion` alone (the transient channel, no render per move); a task carrying subtasks, or several picked, as a stack
 * of layers under it, their number on its corner.
 */
export function CarryFloat({ model }: { readonly model: BlockModel }): JSX.Element | null {
	const carry = model.carry;
	if (carry?.kind === "plus")
		return (
			<div class="tc-n-btn tc-n-round tc-n-float-plus" data-n-float="card" data-n-float-kind="plus">
				<Icon name="plus" />
			</div>
		);
	if (carry?.kind === "section" && carry.section)
		return (
			<div class="tc-n-section-float" data-n-float="card" data-n-float-kind="section">
				<div class="tc-n-stack-layer tc-n-stack-layer-2" />
				<div class="tc-n-stack-layer tc-n-stack-layer-1" />
				<div class="tc-n-section-card">
					<span class="tc-n-section-card-name">{carry.section.name}</span>
					<span class="tc-n-section-card-count">{String(carry.section.count)}</span>
				</div>
			</div>
		);
	const float = floatFace(model);
	if (!float) return null;
	return (
		<>
			{float.stacked ? <div class="tc-n-float-under tc-n-float-under-2" data-n-float="under" /> : null}
			{float.stacked ? <div class="tc-n-float-under tc-n-float-under-1" data-n-float="under" /> : null}
			<div class="tc-n-float" data-n-float="card">
				<Card rowKey="float" face={float.face} branch={null} as="float" />
			</div>
			{float.count > 1 ? (
				<div class="tc-n-float-count" data-n-float="count">
					{String(float.count)}
				</div>
			) : null}
		</>
	);
}
