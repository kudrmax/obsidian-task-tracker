# Projects entry

## Decisions

### Obsidian frontend

1. **The screen never scrolls.** The plugin's view and its strip's columns clip what lies beyond them (`overflow: clip`) and are no scroll containers, so the browser can never slide the screen sideways to bring a caret, a focused field or a found row into sight. The places stand only where the wheel, a swipe or a turn put them. Before this, a field opened in an unseen column slid the Projects screen half off to the left for good on the first key typed (`scrollLeft` of the view root, which nothing resets). Guarded by `tests/styles.test.ts`. The Swift app has no such scroll: nothing to carry over.
2. **A turn that goes wrong as it lands still frees the screen.** `ScreenPager` resolves its settle and forgets its way whatever the track does as it lands, the swipe lets the gesture arbiter go even when the settle fails, and the arrows' chain of day turns reports a failure and goes on instead of dropping every later turn. Nothing a turn takes (the swipe's hold, the pager's way, the next turn) stays held after it. Guarded by `tests/ui/ScreenPager.test.ts` and `tests/ui/Swipe.test.ts`.
