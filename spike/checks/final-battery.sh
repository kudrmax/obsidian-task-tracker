#!/bin/zsh
# Everything, desktop main window: oracle (future and past hours, zooms), sequences, drop visibility and handover, blockers 1 and 4, timeline frames, recorded input.
cd "$(dirname $0)"
fresh() { node gen.mjs ../vault-2/"TODOs Tasks.md" >/dev/null; sleep 1.5; }
echo "== oracle"; fresh; node tl-oracle.mjs 2>&1 | grep -v compdef | cut -c1-200
echo "== sequences"; fresh; node tl-sequences.mjs 2>&1 | grep -v compdef | grep -v '"ok":true'
echo "== drop visibility and handover"; ./vis-suite.sh desk 2>&1 | grep -v compdef | sed 's#; screencast.*##'
echo "== blockers 1 and 4"; node q.mjs 'tcSpike.store.getState().setPlace(0)' >/dev/null; sleep 1; ./suite.sh final 2>&1 | grep -v compdef | grep -v '"path"' | cut -c1-220
echo "== timeline frames"; fresh; node tl-record.mjs final 2>&1 | grep -v compdef | sed 's#->.*##'; node tl-analyze.mjs final
echo "== recorded input"; ./replay-all.sh
echo finished
