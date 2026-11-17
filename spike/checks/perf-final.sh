#!/bin/zsh
cd "$(dirname $0)"
OUT=../shots/round3-final.jsonl
: > $OUT
for r in 1 1 1 4 4; do node gen.mjs ../vault-2/"TODOs Tasks.md" >/dev/null; sleep 1.2; VIEW=classic node b13-round2.mjs $r 1 whileDragging >> $OUT; done
echo finished
