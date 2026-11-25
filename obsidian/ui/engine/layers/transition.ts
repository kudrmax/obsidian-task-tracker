import { useEffect, useRef } from "react";

/** How a part of a layer stands while it opens, is open and closes (Floating UI's transition status): the design's classes its CSS transitions run between. */
export const motionClass = (status: string, ready: boolean): string => (status === "open" && ready ? " is-shown" : status === "close" ? " is-closing" : "");

/**
 * A layer that was there has gone: faded out (Floating UI's `isMounted` false) or taken off before it had; `onGone` runs
 * once each time, so what was tapped in it may happen now (F132), or what holds it may let it go.
 */
export function useGone(isMounted: boolean, onGone: (() => void) | undefined): void {
	const gone = useRef(onGone);
	gone.current = onGone;
	const there = useRef(false);
	if (isMounted) there.current = true;
	useEffect(() => {
		if (isMounted || !there.current) return;
		there.current = false;
		gone.current?.();
	}, [isMounted]);
	useEffect(
		() => () => {
			if (!there.current) return;
			there.current = false;
			gone.current?.();
		},
		[],
	);
}
