import json, collections, sys
C = {}
def put(f, lines, cls, why):
    for l in lines: C[(f, l)] = (cls, why)
put("model/block.ts", [248, 251], "b", "zero/emptiness test (level > 0, keys > 0)")
put("model/card.ts", [81, 89], "a", "how many colours a card shows and when it stripes: the core's look")
put("model/carryPlace.ts", [58], "c", "finger inside a list's box (within)")
put("model/carryPlace.ts", [66], "b", "more than one carried (count > 1)")
put("model/carryPlace.ts", [91, 92, 93, 98, 99, 100, 101], "c", "drop line's left/right/y from measured boxes")
put("model/carryPlace.ts", [94, 95], "b", "the card at / before the gap by index (neighbour)")
put("model/carryPlace.ts", [110], "c", "finger near the plus's ring (hypot)")
put("model/carryPlace.ts", [128], "c", "list end = last box top + height")
put("model/carryPlace.ts", [138], "c", "nearest section slot to the finger (decides an outcome: spec makes it a core rule)")
put("model/carryView.ts", [38], "b", "slot top at index")
put("model/carryView.ts", [45], "c", "line width = max(0, right - left)")
put("model/carryView.ts", [69], "b", "counts > 0 / > 1")
put("model/entry.ts", [170, 171, 173, 182, 187, 190], "a", "where the entry's field stands (section span, field index): spec names it a core rule")
put("model/entry.ts", [220], "a", "which plates the field removes")
put("model/entry.ts", [219, 221, 222, 225, 236], "b", "splice the field into rows at a given index")
put("model/entry.ts", [274, 276], "a", "tiles in rows of at most three, as even as they go (the menus' rule)")
put("model/entry.ts", [293], "b", "group non-empty")
put("model/lists.ts", [104], "a", "branch lines' passes (spec names it a core rule)")
put("model/monthGrid.ts", [13, 21, 22, 27, 33, 34, 35, 38], "a", "month grid / month arithmetic (spec: rules.monthGrid)")
put("model/search.ts", [82], "a", "picked row clamped into the results (search's step)")
put("model/taskMenu.ts", [255], "a", "status tiles: four or not (> 3)")
put("model/taskMenu.ts", [268, 270], "a", "tileRows again: a SECOND copy of entry.ts's rule")
put("model/taskMenu.ts", [311, 316, 326], "b", "tiles non-empty")
put("update/acts.ts", [19, 20, 69, 71], "b", "string key parsing (split at ':', strip prefix)")
put("update/block.ts", [31], "b", "sequence stamp seq + 1")
put("update/block.ts", [48], "b", "pairwise compare by index")
put("update/carry.ts", [39, 40], "a", "a card's subtree: following rows with a deeper level")
put("update/carry.ts", [74, 213, 255], "c", "grab offset = finger - box")
put("update/carry.ts", [82, 120, 323, 324], "b", "counts > 0 / > 1")
put("update/carry.ts", [226, 227, 228], "a", "a section's rows up to the next header (spec: section's span is core)")
put("update/carry.ts", [267, 268], "b", "parallel arrays by index; prefix strip")
put("update/entry.ts", [37, 153], "b", "counter / key sequence + 1")
put("update/full.ts", [22], "b", "findIndex sentinel < 0")
put("update/full.ts", [101, 172], "b", "stack depth > 1")
put("update/full.ts", [155], "b", "sequence stamp + 1")
put("update/fullActs.ts", [7], "b", "prefix strip")
put("update/menu.ts", [19], "b", "sequence stamp + 1")
put("update/search.ts", [41], "a", "search's step through results, clamped (spec names it)")
put("update/search.ts", [45], "b", "sentinel < 0")
put("update/section.ts", [12], "b", "prefix strip")
put("update/select.ts", [35, 46], "b", "picked non-empty")
put("update/select.ts", [39], "a", "Shift range of a pick (spec names it)")
put("view/Card.tsx", [87], "b", "stripes non-empty")
put("view/Card.tsx", [241], "b", "pairwise array equality by index")
put("view/carry/CarryFloat.tsx", [40], "b", "count > 1")
put("view/entry/Bar.tsx", [76], "b", "tiles non-empty")
put("view/full/FullCard.tsx", [61], "b", "subtasks non-empty")
put("view/menu/TaskMenu.tsx", [298, 324, 326, 346], "b", "split parts at an index the measure gave")
put("view/search/Search.tsx", [25], "b", "title non-empty")
put("view/search/Search.tsx", [95], "b", "running row counter")
hits = json.load(open(sys.argv[1]))
tot = collections.Counter(); sites = collections.defaultdict(set); kinds = collections.defaultdict(collections.Counter); miss = []
for h in hits:
    f = h["path"].replace("obsidian/ui/next/", ""); k = (f, h["line"])
    if k not in C: miss.append(k); continue
    cls = C[k][0]; tot[cls] += 1; sites[cls].add(k); kinds[cls][h["rule"]] += 1
print("unclassified:", miss)
for cls in "abc": print(f"({cls}) hits={tot[cls]} sites={len(sites[cls])} by rule={dict(kinds[cls])}")
# (b) sub-buckets
sub = collections.Counter(C[k][1] for k in sites["b"])
bb = collections.Counter()
for h in hits:
    f = h["path"].replace("obsidian/ui/next/", ""); k = (f, h["line"])
    if C.get(k, ("",))[0] == "b":
        why = C[k][1]
        g = ("sequence/counter" if any(w in why for w in ["seq", "counter"]) else
             "emptiness/count" if any(w in why for w in ["non-empty", "> 0", "> 1", "zero", "count", "depth"]) else
             "string key parsing" if any(w in why for w in ["prefix", "string"]) else
             "index/neighbour/split" )
        bb[g] += 1
print("(b) buckets by hits:", dict(bb))
