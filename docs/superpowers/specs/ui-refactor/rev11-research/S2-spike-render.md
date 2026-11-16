# S2 — render spike: can 300 cards meet 16 ms?

Date 2026-11-16. Branch `spike-render` from `ui-refactor-slice3` (13fb8008). It lived in a throwaway worktree that has since been trashed, and nothing was committed. The spike's source is in `spike/source/` next to this file.

## Method

- **Harness.** The slice3 e2e harness (`scripts/e2e/`) with one added command, `spike`. It drove my own test Obsidian (own profile under the worktree's `.e2e/work`, port 9345 or higher, launched in the background). The instance quit at the end of every run, and no other Obsidian was touched.
- **Machine.** Obsidian 1.15.1 (Electron, Chrome 150) on an Apple M4 Pro, CPU throttled 4× via `Emulation.setCPUThrottlingRate`.
- **Load.** The fixture is the copy of Max's tasks file plus 300 `Budget task N 🗂️ Близкие` lines, so the note «Дружба» shows **307 cards** in both Rows and By project. The block has `newBlock` on.
- **Platforms.** Desktop is 1280×800. Phone view is `emulateMobile(true)` at 390×844, which is Chromium with mobile CSS, not WebKit. Both are dark.
- **What renders.** The real `List` and `Card` components (Preact 11.2, memoised `Card`) with the block's real models: `drawnLists(model)` saved in Rows and in By project. They render into a host `div.task-calendar.tc-n-block > .tc-n-stack` standing where the block stands, with the real block hidden. The host is scrolled to the top of the window, so a full viewport of cards is on screen: 20 at 35 px on desktop, 23 on the phone.
- **Hook.** `BlockHost` publishes `globalThis.__spike` (Preact `h`/`render`, `List`, `drawnLists`, the block's `titleField` factory, `EditorView`, `EditorState`). This exists only in the throwaway branch.
- **Measurement.** Each action runs in a task of its own (`setTimeout`), marked with `console.timeStamp`, under a CDP trace (`devtools.timeline`, `toplevel`, `v8.execute`).
  - From the trace I take every main-thread task from the mark onward, each broken into script (FunctionCall, TimerFire, rAF, microtasks, minus forced style and layout), style (UpdateLayoutTree), layout, paint (PrePaint, Paint, Layerize), commit and GC.
  - **longest** is the longest task. **event→commit** runs from the mark to the end of the first Commit after it, which is when the frame reaches the compositor and the user sees it.
- **Runs.** Each case ran 2–3 times. Ranges are given below; every raw value is in `spike/log.txt`, `spike/part2-log.txt` and `spike/part3-log.txt`, with JSON in `*raw.json`.
- **First runs discarded.** `run1-end/` and `run2-end/` are early runs with the host at the window's foot (3 cards in view) and are not used here. Their style and layout numbers agree with the runs used.

## Results (4× CPU, 307 cards)

### 1. Cold render of 307 cards (current `Card`)

| | script task | frame task (style / layout / paint) | longest | event→commit |
|---|---|---|---|---|
| By project, desktop (2772 nodes) | 25–27 ms | 75–80 ms (48 / 9.6 / 14) | **75–80 ms** | 100–108 ms |
| Rows, desktop (1864 nodes) | 17–21 ms | 54–55 ms (34 / 8 / 10) | 54–55 ms | 70–76 ms |
| By project, phone | 25–28 ms | 71–79 ms (48–51 / 9–10 / 12–14) | 71–79 ms | 99–105 ms |
| Rows, phone | 17–20 ms | 53–56 ms | 53–56 ms | 70–73 ms |

- **Style recalculation dominates**, at about 17 µs per element at 4×.
- **It is Obsidian's stylesheet, not ours.** The document has 5077 rules. The same 307 cards in a host *without* the plugin's class, so that none of our rules match, cost the same: frame 62–68 ms, longest 62–73 ms.
- **The reviewer is right.** A cold render of 300 cards cannot fit in 16 ms. Even its script alone (25 ms) does not.

### 2. Reveal of a mounted hidden subtree

The step hides the Rows subtree and shows the By project subtree, both mounted; it runs no script.

| hiding | revealed subtree laid out before? | longest (desktop) | longest (phone) | breakdown |
|---|---|---|---|---|
| `content-visibility: hidden` | no (mounted hidden) | 77–79 ms | 78–80 ms | style 49, layout 10, paint 13: same as cold minus script |
| `content-visibility: hidden` | yes (shown once, then hidden) | **17–19 ms** | **15–17 ms** | style 1.7, layout 0.8, paint 11.5, commit 1.6 |
| `display: none` | no | 76–79 ms | 78–84 ms | full style and layout |
| `display: none` | yes | 78–81 ms | 76–79 ms | `display:none` keeps nothing |

- **`display: none` saves only the script** (about 25 ms). The frame stays at 75–80 ms.
- **`content-visibility: hidden` helps only when the subtree was rendered visibly once before.** Then Chrome keeps its style and layout, and the reveal costs mostly paint of the whole subtree (about 11 ms). That puts it at 15–19 ms, just at or over the 16 ms target.
- **A subtree mounted hidden from the start costs a full cold frame when first revealed.** So the neighbours must actually be laid out once, for example during idle, which is itself one 75 ms frame unless it is chunked.

### 3. Mounted subtrees: memory and the cost of a write

k = the number of 307-card subtrees mounted (one shown, the rest hidden). Heap is measured after GC.

| k | DOM nodes (whole doc, desktop) | JS heap |
|---|---|---|
| 1 | 7 028 | 20.4 MB |
| 2 | 10 114 | 21.7 MB |
| 3 | 12 298 | 22.6 MB |
| 4 | 15 384 | 23.8 MB |

- **Each subtree adds about 2.8k nodes and about 1.2 MB of heap.** Memory is not the problem.

A write that changes one card's face, re-rendering every mounted subtree in one loop (one task: script only, no style or layout cost from the hidden ones):

| k | with structural sharing (other faces the same objects) | without sharing (every face a new object: today's door) |
|---|---|---|
| 1 | 1–2.5 ms | 6–10 ms |
| 2 | 2–3.7 ms | 15–22 ms |
| 3 | 2.3–5.2 ms | 21–24 ms |
| 4 | 3–5.6 ms | 30–38 ms |

- **Hiding by `cv:hidden` or `display:none` makes no difference** to the cost of a write, on desktop or phone.
- **With P9's structural sharing**, keeping 3–4 subtrees updated costs under 6 ms per write.
- **Without structural sharing** the cost is about 8 ms per subtree, so 2 or more subtrees break 16 ms. Keeping neighbours mounted therefore *requires* P9's sharing.

### 4. CodeMirror: a new editor against re-keying a warm one

| | longest task | event→commit |
|---|---|---|
| New Obsidian title field (`obsidianTitleField`: Obsidian's markdown editor), first in the session | 53–63 ms | 70–101 ms |
| New Obsidian title field, later ones | 20–28 ms (script 20–26) | 28–35 ms |
| New bare `EditorView` (no Obsidian extensions) | 14–19 ms (script 10–13) | 24–32 ms |
| **Re-key the warm Obsidian field** (move its node to the next row, `setPlaceholder`, `setText`, `focusEnd`) | **9–11 ms** (script 9–10) | 15–17 ms |

- The spec's estimate of "a new `EditorView` 5–15 ms" is low for Obsidian's editor: it is 20–28 ms, and over 50 ms the first time.
- Re-keying fits 16 ms. Event→commit is 15–17 ms because CodeMirror measures in the next frame.

### 5. Chunked rendering

The first n cards render at once, then `chunk` more each frame, on By project with 307 cards. "What the user sees" compares the cards in the window at the first paint with the cards there at the end.

| variant | longest (desktop) | longest (phone) | first paint | all drawn | in view unchanged? |
|---|---|---|---|---|---|
| plain cards, first 20 / +20 | 21 ms | 20–23 ms | 13 ms | 190–225 ms | desktop yes; **phone no** (23 in view, 20 drawn: 3 pop in a frame later) |
| plain, first 30 / +30 | 26–28 ms | 26–27 ms | 14 ms | 166–195 ms | yes |
| plain, first 40 / +60 | 42–43 ms | 36–40 ms | 17–19 ms | 138–154 ms | yes |
| **cards `content-visibility: auto; contain-intrinsic-size: auto 35px`**, first 20 / +20 | 14–18 ms | 13–14 ms | 2.5–8 ms (in-page) | 127–160 ms | desktop yes; phone no (first chunk smaller than the view) |
| cv:auto, first 20 / +40 | 19–21 ms | 16 ms | 2–8 ms | 86–103 ms | as above |
| cv:auto, first 20 / +60 | 23 ms | 19–21 ms | 3–8 ms | 75–88 ms | as above |

- **Without `cv:auto`, every chunk's frame costs 12–18 ms** even for 20 offscreen cards: style about 4 ms, paint about 3–4 ms, plus the chunk's script.
- **With `cv:auto` on cards, offscreen chunks cost 5–12 ms per frame.** The longest task is the first frame (the visible 20 cards: style 5, paint 4, layout 1.5), plus the next chunk's script when that chunk is rendered inside rAF. Rendering the next chunk after the frame removes that script from it.
- **Phone pitfall.** On the phone, 20 rows did not fill the view; it holds 23. The first chunk must be the view's count plus a margin, from geometry.

Supporting numbers:

- **Cold render with `cv:auto` on every card**, no chunking: script 25–27 ms, frame 25–30 ms (style 12–14). Longest is 25–30 ms, event→commit 51–56 ms.
- **Reveal with `cv:auto` cards** and the subtree laid out before: 17–21 ms on desktop, 17–19 ms on phone. With `display:none`: 21–29 ms. With `cv:hidden` never shown: 23–36 ms.

### 6. A day swipe with the neighbour already drawn beside

The ribbon is two panes, 307 cards each, slid by `transform` over 300 ms.

- **Every variant stays well under 16 ms per frame:** plain 5.5–14 ms, cv:auto cards 5.6–9 ms, cv:auto panes 3.3–9 ms, both 6–8 ms.
- A swipe onto a drawn neighbour is cheap; the cost lies in drawing that neighbour in the first place (see 1, 2 and 5).

### Which design reaches 16 ms

**Mode switch** (a whole new set of 300 cards in place):

- **Cold:** 75–80 ms. Fails.
- **Reviewer's proposal** (other modes mounted with `cv:hidden`, rendered visibly once, updated every write with P9 sharing): reveal 15–19 ms. **Borderline**: it passes on the phone view most runs and fails by 1–3 ms on desktop.
  - It also needs each mounted mode laid out visibly once, a 75 ms frame unless chunked at idle.
- **`display:none` subtrees:** 76–84 ms. Fails.
- **Chunked with `cv:auto` cards** (first viewport plus margin synchronously, then chunks after each frame): 13–18 ms longest, first paint in one frame, all 307 cards in 75–160 ms. **Borderline**, about the same as the reviewer's design, without any retained subtrees.
- **The floor is the same for both:** about 5 ms style plus 4–11 ms paint for about 20 freshly visible cards under Obsidian's 5077 rules, at 4× on an M4 Pro.
- **Nothing measured gets a mode switch under 16 ms reliably.** P9's present budget for a mode switch (under 50 ms, no task over 50 ms) is met by:
  - chunked without `cv:auto`: 20–28 ms;
  - chunked with `cv:auto`: 13–21 ms;
  - the cv:hidden reveal: 15–19 ms.
  - It is not met by a cold render.

**Filter change** (part of the cards leave and others enter): not measured as a separate gesture.

- From the per-card costs above: about 0.08 ms of script plus about 0.24 ms of frame per entering card, and about 0.03 ms per unchanged memoised card.
- Under 16 ms only if few cards enter (fewer than about 40 plain, more with cv:auto).
- For a broad filter the same answer as the mode switch applies: chunked plus cv:auto.
- Pre-mounting every filter result is not practical: filters are open-ended.

**Day swipe:** the neighbour already drawn beside the current day passes easily (3–14 ms per frame).

- Drawing that neighbour at idle must itself be chunked (a cold neighbour is one 55–80 ms task), and kept current by writes with P9 sharing (about 2–5 ms per write for 2–3 contexts).

## Web check: iOS WKWebView

WKWebView uses the system WebKit, so its features follow the Safari version of the same iOS release. That WKWebView matches Safari feature for feature is unverified for these two specific features (no WKPreferences flag found that gates them).

- **`content-visibility`: supported from Safari / iOS 18.**
  - "WebKit for Safari 18.0 adds support for content-visibility." (https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)
  - caniuse: Safari and iOS Safari from 18.0 (https://caniuse.com/css-content-visibility).
  - MDN browser-compat-data (`css/properties/content-visibility.json`): `hidden` from 18. `auto` partial from 18 ("Skipped content is not findable via find-in-page", https://webkit.org/b/283846), full from 26. The Safari 26.0 release notes list the fix (https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes).
  - So: Safari 17 no; 18 yes (`auto` partial, find-in-page only); 26 yes.
- **`requestIdleCallback`: not shipped.** caniuse marks it "Disabled by default" from Safari 13.1 and iOS 13.4 through current, Technology Preview only (https://caniuse.com/requestidlecallback). MDN browser-compat-data (`api/Window.json`) gives Safari `version_added: "preview"` behind the `requestIdleCallback` preference flag. So: Safari 17, 18 and 26: no. The time engine's `idle` needs a fallback (`setTimeout` or `MessageChannel` slices).

## Caveats

- **Engine.** Phone view is Chromium with mobile CSS, not WebKit on an iPhone. The relative costs (style dominated by the global stylesheet, `display:none` keeping nothing, `cv:hidden` keeping layout only after a visible pass) are Blink behaviour. WebKit's `content-visibility` caching was not measured.
- **Machine.** 4× on an M4 Pro is roughly a mid-range phone, not Max's iPhone.
- **Screen.** The host is the note block's frame and stylesheet, not the main screen's columns.

## Shadow root

**Verdict.** A mode switch now reaches 16 ms or less at 4× in both designs tried, provided cards carry `content-visibility:auto`. The Obsidian title field cannot live inside the shadow root; it works as an island outside it.

### Method

Same rules, harness and fixture (307 cards, 4× CPU, desktop and phone view), in a fresh throwaway worktree, `spike-shadow`, which has since been trashed. Nothing was committed. Source: `spike/source-shadow/`; log: `spike/part4-log.txt` and `spike/part5-log.txt`; screenshots: `spike/shadow/`.

The setup:

- **Host.** An open shadow root on `div.sp-shadow`, placed where the block stands. Inside it sit `div.task-calendar.tc-n-block > .tc-n-stack` and the same `List`/`Card` components.
- **Our CSS.** The plugin's `styles.css` text (1,105 rules) is adopted into the root through `adoptedStyleSheets`.
- **Body-class rules.** The 29 rules written as `body.<class> …` are rewritten to `:host(.<class>) …`. A `MutationObserver` copies `body`'s classes onto the host.
- **Tokens.** The `--tc-*` tokens stay defined on `body` by the document's sheet and inherit into the root.

### Numbers (4×, 307 cards; earlier light-DOM numbers from this report in brackets)

| | desktop | phone view |
|---|---|---|
| Cold render, By project: longest | 42–45 ms (75–80) | 39–42 ms (71–79) |
| … breakdown | script 28–30, then frame: style 14.9, layout 10, paint 13 (style was 48) | script 22–23, then frame: style 13.6, layout 9.7, paint 12.6 |
| … event→commit | 72–76 ms (100–108) | 63–66 ms (99–105) |
| Cold render, Rows | 33–38 ms (54–55) | 32 ms (53–56) |
| Cold render with `cv:auto` cards | 28–31 ms (25–30), now script-bound | 24–26 ms (25–28) |
| **Mode switch, `cv:hidden` subtree laid out before, revealed** | 19–21 ms (17–19), paint 13 dominates | 15–18 ms (15–17) |
| **… same with `cv:auto` cards** | **13.9–15.3 ms** (17–21) | **11.4–12.2 ms** (17–19) |
| **Mode switch, chunked + `cv:auto`, first 30, then 20 per frame** | **14.2–16.0 ms**, first paint 6–7 ms in page, all drawn in 123–129 ms | **13.7–15.0 ms**, all drawn in 119–122 ms |
| … first 20 / +20 | 12.2–15.0 ms | 12.6–14.2 ms, but pop-in |
| … first 30 / +40 | 18.9–20.1 ms | 14.4–16.6 ms |
| … chunked first 30 / +20, plain cards (no `cv:auto`) | 15.0–18.7 ms | 14.0–16.0 ms |
| Same session, light DOM, `cv:auto`, first 30 / +20 (reference) | 17.4–19.1 ms | 17.9–20.9 ms |
| Write of one card, shared faces | 1.5–2.7 ms (1–2.5) | 0–1.9 ms |
| Write of one card, every face new | 6.2–8.0 ms (6–10) | 6.4–7.9 ms |

What changes and what does not:

- **Style recalculation falls about 3.3×** (48 → 14–15 ms for 2,772 elements, about 5 µs per element at 4×), because Obsidian's 5,077 rules no longer match inside.
- **Script, layout and paint are unchanged.** Writes are unchanged too: they are script only.
- **Phone first-paint pop-in.** First 20 left cards popping in on the phone (`sameInView` false, 20 drawn of 23 in view). First 30 fixed it on both platforms (`sameInView` true, 23 in view).

### What breaks, and how

- **Card pixels: identical.** I compared screenshots of the same 307 cards in the document and in the shadow root, clipped to the block, at device pixels:
  - desktop dark: 5 px differ, by at most 7/255;
  - desktop light: 10 px differ, by at most 4/255;
  - phone dark: 0 px differ;
  - phone light: 2,549 px (0.3 %) differ, by at most 6/255. That is anti-aliasing noise.
  - The phone shots exclude the top 190 px, where Obsidian's floating header was showing in one shot.
  - So the cards depend on none of Obsidian's rules.
- **Theme change: works.** Toggling `body.theme-dark` and `theme-light` changed the shadow card exactly as a light-DOM card: background `srgb 0.2077` → `0.95`, text white → black. Font, radius and height match.
  - This needs the `:host(.class)` rewrite and the class mirror. `:host-context()` is not an option: MDN browser-compat-data gives Safari `version_added: false`.
  - `adoptedStyleSheets` is in Safari 16.4 and later (MDN browser-compat-data).
- **Events: work inside, are retargeted outside.**
  - A listener inside the root sees the real target: `closest('[data-n-key]')` gives `own/t99`.
  - A document-level listener sees `target` = the shadow host; `composedPath()[0]` still gives the card.
  - What breaks: `Input.enter`, `Input.escape` and `secondPress` listen on `document` and test `e.target instanceof HTMLInputElement` or `root.contains(target)`. Those tests fail across the boundary. They must read `composedPath()[0]` or listen on the shadow root.
- **Focus and keyboard: break as written.**
  - With focus inside, `document.activeElement` is the host. `shadowRoot.activeElement` is the inner element.
  - Every `Focus` method in `drivers/focus.ts` reads `ownerDocument.activeElement`: `take`, `holds`, `inField`, `leave`, and `field`'s check. It also searches `ownerDocument.querySelectorAll`, which does not pierce shadow roots.
  - Keys reach listeners inside the root, and Escape arrives at `document` with `target` = host.
  - The fix: these must use `node.getRootNode()`, meaning `ShadowRoot.activeElement` and `ShadowRoot.querySelectorAll`.
  - Obsidian's own keymap also sees the host as the target, so it cannot tell that a field inside has the focus.
- **Selection: not applicable to cards.** Card titles are `user-select: none`, and a double click selects nothing in either tree. Text selected inside a shadow root is read by `getSelection()` in Chromium. WebKit needs `Selection.getComposedRanges` (Safari 17+, MDN browser-compat-data). I did not test this on WebKit.
- **Hit testing: needs the root.**
  - `document.elementFromPoint` returns the host.
  - `shadowRoot.elementFromPoint` returns the card title, and its `closest('.tc-n-card')` and `closest('.tc-n-block')` work.
  - `getBoundingClientRect` is the same in both trees.
  - `closest()` stops at the root: from inside, `.view-content` and `.markdown-*-view` are not found.
  - So the carry's hit test and the measure driver must query the shadow root.
- **Obsidian's CodeMirror title field inside the root: broken.** Typing and Enter still reach our handlers (`typed`, then `key: "enter"`), but:
  - CodeMirror's root is fixed at construction. `obsidianTitleField` builds the field in a detached `document` node, so CodeMirror's style module mounts in the document. The editor thinks it is unfocused: no `cm-focused`, `field.focused` false. The field shows the browser's default focus ring and no Live Preview styling.
  - `EditorView.setRoot(shadowRoot)` brings back CodeMirror's base theme and focus. Obsidian's own editor CSS (dim `[[`, link colours) still does not apply inside, and the caret turns black.
  - **Typing `[[` opens no note suggestion inside the root, with or without `setRoot`.** Outside it opens one.
  - **The same field mounted outside the root, as an island:** focused, `cm-focused`, Obsidian's link styling, and the `[[` suggestion opened with one item.
  - So the title field and the full card's description editor must stay islands outside the shadow root, placed over the row by geometry.

### Mode switch at 16 ms

- **Yes, within 16 ms, with the screen's lists in a shadow root and `cv:auto` cards:**
  - A pre-laid-out `cv:hidden` subtree, revealed: 11.4–15.3 ms on both platforms.
  - Chunked, with a first chunk of the view's count plus margin (30) and 20 per frame: 13.7–16.0 ms.
  - Both are about 2–5 ms under the light-DOM numbers.
- **A cold render is still 39–45 ms** (24–31 with `cv:auto`), because the script alone takes 22–30 ms. It needs either of the two designs.
- **Caveat: one engine.** All of this is Chromium. WebKit's style cost and its `content-visibility` caching were not measured.
