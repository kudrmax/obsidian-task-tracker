#!/bin/zsh
# Every recording of real input in spike/recordings/ replayed and checked (swipes one place each, drops visible). Exit 1 on any fault.
cd "$(dirname $0)"
REC=${RECORDINGS:-/Users/mdmkudryashov/projects/obsidian-my-own-plugins/obsidian-task-tracker/.worktrees/ui-stack-spike/spike/recordings}
fail=0
for f in $REC/*.json; do
	[[ $f == *.expect.json ]] && continue
	node gen.mjs ../vault-2/"TODOs Tasks.md" >/dev/null; sleep 1.5
	out=$(node replay.mjs $f ${START_PLACE:-1} 2>&1 | grep -v compdef)
	echo "$out" | python3 -c '
import json,sys
d=json.load(sys.stdin)
ok = d["sequence"] is not False and not d["dropFaults"] and all(r["tailMovedFrames"]==0 for r in d["ribbon"]) and d["stalledFrames"]==0
print(("PASS" if ok else "FAIL"), d["recording"], "places", d["observedPlaces"], "expected", d["expectedPlaces"], "drags", d["dragsReplayed"], "drop faults", len(d["dropFaults"]), "stalls", d["stalledFrames"])
for r in d["ribbon"]: print("   stroke", r)
sys.exit(0 if ok else 1)' || fail=1
done
exit $fail
