#!/bin/zsh
# Everything after the timeline fix, desktop main window: oracle, sequences, drop visibility, blockers 1 and 4, timeline frames.
cd "$(dirname $0)"
fresh() { node gen.mjs ../vault-2/"TODOs Tasks.md" >/dev/null; sleep 1.5; }
echo "== oracle"; fresh; node tl-oracle.mjs 2>&1 | grep -v compdef | cut -c1-130
echo "== sequences"; fresh; node tl-sequences.mjs 2>&1 | grep -v compdef | grep -v '"ok":true'
echo "== drop visibility"; ./vis-suite.sh desk 2>&1 | grep -v compdef | sed 's#, screencast.*##'
echo "== blockers 1 and 4"; ./suite.sh final2 2>&1 | grep -v compdef | grep -v '"path"'
echo "== timeline frames"; fresh; node tl-record.mjs final 2>&1 | grep -v compdef | sed 's#->.*##'; node tl-analyze.mjs final
echo finished
