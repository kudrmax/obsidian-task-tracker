# Pixel comparison with the boards

Made by `node docs/design/reference/capture.mjs` against the scratch Obsidian (CLAUDE.md). The region is the plugin's content between the day row and the New task button, shifted by Obsidian's taller chrome; see the script's header.

| Board | Differing pixels, tolerance 32 | Differing pixels, exact |
|---|---|---|
| Screen | 0.026% | 1.687% |
| ScreenLeft | 0.416% | 2.243% |
| ScreenRight | 0.026% | 1.386% |
| ScreenDrag | 2.401% | 7.352% |
| ScreenSoon | 0.026% | 0.598% |
| ScreenMenu | 0.082% | 24.262% |
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
| ScreenLight | 0.155% | 13.954% |
| ScreenLightSoon | 0.128% | 0.477% |
| ScreenLightDrag | 1.794% | 22.658% |
| ScreenLightMenu | 0.091% | 38.243% |
| ScreenLightDue | 0.009% | 38.202% |
| ScreenLightPicker | 0.509% | 32.996% |
| ScreenLightSheet | 1.288% | 1.694% |
| ScreenLightSheetPicker | 1.873% | 2.904% |
| ScreenLightSources | 0.189% | 39.254% |
