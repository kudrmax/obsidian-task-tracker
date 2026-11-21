/**
 * How long a layer takes to open and to close: the design's `--tc-duration-menu` and `--tc-duration-collapse` (the sheet,
 * the copy over it and the panel fade together, F297). Floating UI's transition status keeps a closing layer mounted this
 * long; `tests/ui/engine/layerMotion.test.ts` holds them equal to the tokens.
 */
export const LAYER_MS = { open: 200, close: 150 } as const;

/** The curve a list's rows and every part of a layer move on: the design's `--tc-ease-out`, held equal by the same test. */
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;
