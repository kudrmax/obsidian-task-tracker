import { memo } from "react";
import { type IconName, ICONS } from "../../shared/icons";

/** One of the design's icons (`kit/icons`): strokes in currentColor, a solid part filled. */
export const Icon = memo(function Icon({ name, className }: { readonly name: IconName; readonly className?: string }) {
	const spec = ICONS[name];
	const strokes = typeof spec.d === "string" ? [spec.d] : spec.d;
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			{strokes.map((d) => (
				<path key={d} d={d} />
			))}
			{spec.fill ? <path d={spec.fill} fill="currentColor" stroke="none" /> : null}
		</svg>
	);
});
