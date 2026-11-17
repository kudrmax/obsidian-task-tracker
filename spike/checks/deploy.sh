#!/bin/zsh
# Builds the spike and reloads it in the test Obsidian.
set -e
cd /Users/mdmkudryashov/projects/obsidian-my-own-plugins/obsidian-task-tracker/.worktrees/ui-stack-spike
npx tsc -p spike/tsconfig.json
SPIKE_MINIFY=${SPIKE_MINIFY:-1} node spike/build.mjs spike/dist > /dev/null
cp spike/dist/* /private/tmp/claude-501/-Users-mdmkudryashov-projects-obsidian-my-own-plugins-obsidian-task-tracker/10b8c134-2d84-49f9-9c81-48ded7b4dd36/scratchpad/vault/.obsidian/plugins/task-calendar-spike/
cd /private/tmp/claude-501/-Users-mdmkudryashov-projects-obsidian-my-own-plugins-obsidian-task-tracker/10b8c134-2d84-49f9-9c81-48ded7b4dd36/scratchpad/scripts
node q.mjs '(async () => { app.workspace.getLeavesOfType("tc-spike").forEach(l => l.detach()); await app.plugins.disablePlugin("task-calendar-spike"); await app.plugins.enablePlugin("task-calendar-spike"); require("@electron/remote").getCurrentWebContents().setBackgroundThrottling(false); await new Promise(r => setTimeout(r, 300)); await tcSpike.open(false); await new Promise(r => setTimeout(r, 800)); return "reloaded " + document.querySelectorAll(".tcs-card-inner").length; })()'
