#!/bin/zsh
# Repeated round-two runs: VIEW, rate, measuring per line.
cd "$(dirname $0)"
OUT=../shots/round2-more.jsonl
: > $OUT
run() { node gen.mjs ../vault/"TODOs Tasks.md" >/dev/null; sleep 1.2; VIEW=$1 node b13-round2.mjs $2 1 $3 >> $OUT; }
for r in 1 1 1 4 4; do run alt $r whileDragging; done
for r in 1 1 1 4 4; do run classic $r beforeDragging; done
echo finished
