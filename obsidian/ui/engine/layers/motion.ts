/**
 * How long a layer takes to open and to close: the design's `--tc-duration-menu` and `--tc-duration-collapse` (the sheet,
 * the copy over it and the panel fade together, F297). Floating UI's transition status keeps a closing layer mounted this
 * long; `tests/ui/engine/layerMotion.test.ts` holds them equal to the tokens.
 */
export const LAYER_MS = { open: 200, close: 150 } as const;

/** The curve a list's rows and every part of a layer move on: the design's `--tc-ease-out`, held equal by the same test. */
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

/** A card let go flies into its place (Decision 121): the design's `--tc-duration-fly` on its `--tc-ease-fly`, held equal by the same test. */
export const FLY = { ms: 180, ease: [0.2, 0, 0, 1] } as const;

/** Every row that changes place glides there the same way (stage 0's spring). */
export const GLIDE = { type: "spring", stiffness: 520, damping: 42, mass: 0.9 } as const;

/** A cubic Bézier as CSS writes it. */
export const cssEase = (ease: readonly number[]): string => `cubic-bezier(${ease.join(", ")})`;
