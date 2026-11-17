#!/bin/zsh
# The four drops sampled for visibility: within a column, Inbox to Soon, onto the timeline, a move by command.
cd "$(dirname $0)"
for k in within cross timeline command; do node gen.mjs ../vault-2/"TODOs Tasks.md" >/dev/null; sleep 1.5; node b14-flicker.mjs $k ${1:-final}; done
