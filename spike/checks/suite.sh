#!/bin/zsh
# The drag, timeline, menu and editor checks on one window (TARGET=popout for the pop-out); results in shots/<prefix>-*.
P=${1:-main}
cd "$(dirname $0)"
node gen.mjs ../vault/"TODOs Tasks.md" >/dev/null; sleep 1.5
node b1-drag.mjs > /dev/null && cp ../shots/b1-within.json ../shots/$P-b1-within.json && echo "== $P within column" && node analyze.mjs ../shots/$P-b1-within.json && node -e 'const d=require("../shots/'$P'-b1-within.json"); console.log("order", d.after.inbox.join(","), "| file", JSON.stringify(d.file))'
node b1-cross.mjs > /dev/null && cp ../shots/b1-cross.json ../shots/$P-b1-cross.json && echo "== $P Inbox to Soon" && node analyze.mjs ../shots/$P-b1-cross.json && node -e 'const d=require("../shots/'$P'-b1-cross.json"); console.log("before", d.before.inbox[0], "after soon", d.after.soon.join(","), "| file", JSON.stringify(d.file))'
node b1-command.mjs > /dev/null && cp ../shots/b1-command.json ../shots/$P-b1-command.json && echo "== $P command move" && node analyze.mjs ../shots/$P-b1-command.json && node analyze.mjs ../shots/$P-b1-command.json 0 | sed -n 3p
node q.mjs '(async () => { tcSpike.store.getState().setPlace(1); await new Promise(r => setTimeout(r, 900)); return 1 })()' >/dev/null
node qp.mjs 'document.querySelector(".tcs-timeline").scrollTop = 600' 2>/dev/null >/dev/null; [ "$TARGET" = popout ] || node q.mjs 'document.querySelector(".tcs-timeline").scrollTop = 600' > /dev/null
echo "== $P timeline move"; node b4-drop.mjs mid 0 89
echo "== $P list to timeline"; node b4-drop.mjs "columns.day[0]" 500 260
echo "== $P resize"; node b4-resize.mjs
node q.mjs 'tcSpike.store.getState().setPlace(0)' > /dev/null; sleep 1
echo "== $P menu"; node b7-menu.mjs "" $P-
echo "== $P editor"; node b8-editor.mjs "" $P-
