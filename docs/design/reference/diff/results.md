# Pixel comparison with the boards

Made by `node docs/design/reference/capture.mjs` against the scratch Obsidian (CLAUDE.md). The region is the plugin's content between the day row and the New task button, shifted by Obsidian's taller chrome; see the script's header.

| Board | Differing pixels, tolerance 32 | Differing pixels, exact |
|---|---|---|
| Screen | 0.026% | 1.687% |
| ScreenLeft | 0.026% | 1.759% |
| ScreenRight | 0.026% | 1.386% |
| ScreenDrag | 2.401% | 7.352% |
| ScreenSoon | 0.026% | 0.598% |
| ScreenMenu | 0.022% | 24.218% |
| ScreenDue | 0.006% | 24.276% |
| ScreenPicker | 0.012% | 20.223% |
| ScreenSheet | 1.088% | 1.669% |
| ScreenSheetSlot | 1.091% | 1.739% |
| ScreenSheetEdit | 1.532% | 2.216% |
| ScreenSheetPicker | 1.098% | 3.140% |
| ScreenSheetLong | 1.348% | 1.979% |
| ScreenSourcesDot | 0.008% | 1.673% |
| ScreenSourcesPopover | 0.046% | 28.225% |
| ScreenSourcesPull | 0.581% | 2.329% |
| ScreenNewSlot | 1.788% | 3.488% |
