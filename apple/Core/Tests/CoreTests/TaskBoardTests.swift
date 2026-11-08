import Foundation
import Testing
@testable import Core

/// The main screen's reads and writes, through the door in JavaScriptCore.
@Suite struct TaskBoardTests {
    static let file = [
        "## Inbox", "", "- [ ] Idea", "",
        "## Now", "", "- [ ] Morning run ⏰ 2026-11-06 07:00-08:00", "- [ ] Parent 📅 2026-11-06", "\t- [ ] Child", "### Errands", "- [ ] Shop", "",
        "## Soon", "", "- [ ] Later 📅 2026-11-09 🔁 every day", "",
        "## Backlog", "", "## Done", "",
    ].joined(separator: "\n")

    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func board(_ vault: FakeVault) -> TaskBoard { TaskBoard(core: core, vault: vault) }

    @Test func readsTheScreenItsListsAndCards() throws {
        let board = board(FakeVault(Self.file))
        let files = try board.files(now: Fixtures.date(6, 10))
        let screen: ScreenView = try board.read("tasks.screen", ["2026-11-06"], over: files)
        #expect(screen.inbox.map(\.title) == ["Idea"])
        #expect(screen.day.slotted.first?.slot == Slot(date: "2026-11-06", start: 420, end: 480))
        let view: ListView = try board.read("rules.listView", [.array(screen.day.list.map(\.json)), true, try .encoding(screen.sections["now"] ?? [])], over: files)
        #expect(view.showsHeaders)
        #expect(view.groups.map(\.name) == [nil, "Errands"])
        #expect(view.groups[0].rows.map(\.level) == [0, 1])
        let later: ScreenView = try board.read("tasks.screen", ["2026-11-09"], over: files)
        let task = try #require(later.day.list.first { $0.title == "Later" })
        let due: CardDue? = try board.read("rules.cardDue", [task.json, "2026-11-06"], over: files)
        #expect(due == CardDue(date: "2026-11-09", repeats: true))
        let onItsDay: CardDue? = try board.read("rules.cardDue", [task.json, "2026-11-09"], over: files)
        #expect(onItsDay == CardDue(date: nil, repeats: true))
    }

    @Test func aMenuIsReadForATaskAsShown() throws {
        let board = board(FakeVault(Self.file))
        let files = try board.files(now: Fixtures.date(6, 10))
        let screen: ScreenView = try board.read("tasks.screen", ["2026-11-06"], over: files)
        let parent = try #require(screen.day.list.first)
        let menu: TaskMenuModel = try board.read("tasks.menu", [parent.json, "day", ["today": "2026-11-06", "day": "2026-11-06", "offer": screen.offer]], over: files)
        #expect(menu.statuses.map(\.id) == ["done", "inProgress", "wontDo"])
        #expect(menu.edits.contains("subtask"))
    }

    @Test func aCardOfSeveralLabelsCarriesEachColourInTheSettingsOrder() throws {
        let vault = FakeVault(Self.file.replacingOccurrences(of: "- [ ] Idea", with: "- [ ] Idea #label/Quick #label/Calm\n- [ ] Plain #label/Calm"))
        vault.settings = #"{"labels":[{"name":"Calm","color":"blue"},{"name":"Quick","color":"green"}]}"#
        let snapshot = try board(vault).snapshot(day: nil, measures: TimelineMeasures(hour: 56, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18), now: Fixtures.date(6, 10))
        let cards = try #require(snapshot.lists[.inbox]).cards
        let blue = try board(vault).rule("rules.shadesOf", ["blue", "dark"], as: Shades.self)
        let green = try board(vault).rule("rules.shadesOf", ["green", "dark"], as: Shades.self)
        let idea = try #require(cards.first { $0.item.title == "Idea" }?.paint)
        #expect(idea.colors.map(\.dark) == [blue, green])
        #expect(!idea.blend)
        #expect(cards.first { $0.item.title == "Plain" }?.paint?.colors.count == 1)
    }

    @Test func severalLabelsBlendWhenTheSettingsSaySo() throws {
        let vault = FakeVault(Self.file.replacingOccurrences(of: "- [ ] Idea", with: "- [ ] Idea #label/Quick #label/Calm"))
        vault.settings = #"{"labels":[{"name":"Calm","color":"blue"},{"name":"Quick","color":"green"}],"labelPaint":"blend"}"#
        let snapshot = try board(vault).snapshot(day: nil, measures: TimelineMeasures(hour: 56, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18), now: Fixtures.date(6, 10))
        #expect(try #require(snapshot.lists[.inbox]).cards.first { $0.item.title == "Idea" }?.paint?.blend == true)
    }

    @Test func aPressedCardsCopyGrowsAsTheCoreSays() throws {
        let board = board(FakeVault(Self.file))
        let whole = try board.wholeWidth(card: TitleFit(width: 170, titleWidth: 140, textWidth: 100, fade: 16), room: 390, margin: 10)
        #expect(whole == nil)
        let grown = try board.wholeWidth(card: TitleFit(width: 170, titleWidth: 140, textWidth: 200, fade: 16), room: 390, margin: 10)
        #expect(grown == GrownWidth(width: 230, cut: false))
        let cut = try board.wholeWidth(card: TitleFit(width: 170, titleWidth: 140, textWidth: 540, fade: 16), room: 390, margin: 10)
        #expect(cut == GrownWidth(width: 370, cut: true))
        #expect(try board.grownStart(200, size: 180, grown: 230, room: 390, margin: 10) == 150)
        #expect(try board.grownStart(10, size: 170, grown: 230, room: 390, margin: 10) == 10)
    }

    @Test func aSwipeOnTheCalendarLeadsWhereTheCoreSays() throws {
        let board = board(FakeVault(Self.file))
        let files = board.settingsOnly(now: Fixtures.date(6, 10))
        let on: JSONValue = try board.read("days.stepScreen", [["mode": "calendar", "date": "2026-11-06"], 1], over: files)
        #expect(on == ["mode": "calendar", "date": "2026-11-07"])
        let back: JSONValue = try board.read("days.stepScreen", [["mode": "calendar", "date": "2026-11-06"], -1], over: files)
        #expect(back == ["mode": "soon", "date": "2026-11-06"])
        let walk: JSONValue = try board.read("days.stepScreen", [["mode": "calendar", "date": "2026-11-08"], -1], over: files)
        #expect(walk == ["mode": "calendar", "date": "2026-11-07"])
    }

    @Test func aSectionMovesWhereTheCorePlacesItsSlot() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let place: JSONValue = try board.rule("rules.groupPlaceOf", [[.null, "Errands"], 1, 0])
        #expect(place == ["before": .null])
        let still: JSONValue = try board.rule("rules.groupPlaceOf", [[.null, "Errands"], 1, 2])
        #expect(still == .null)
        try board.write("tasks.moveGroup", ["now", "Errands", place])
        let now = try #require(vault.text.range(of: "## Now"))
        let errands = try #require(vault.text.range(of: "### Errands"))
        let run = try #require(vault.text.range(of: "Morning run"))
        #expect(now.upperBound < errands.lowerBound && errands.upperBound < run.lowerBound)
    }

    @Test func aWriteGoesToTheFileAndUndoTakesItBack() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let screen: ScreenView = try board.read("tasks.screen", ["2026-11-06"], over: try board.files())
        try board.write("tasks.setStatus", [screen.inbox[0].key.json, "done"])
        #expect(!vault.text.contains("- [ ] Idea"))
        #expect(board.canUndo)
        try board.write("history.undo")
        #expect(vault.text.contains("- [ ] Idea"))
    }

    @Test func aWriteOverAFileChangedInBetweenIsMadeAgain() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let screen: ScreenView = try board.read("tasks.screen", ["2026-11-06"], over: try board.files())
        vault.changeBeforeWrite = Self.file + "- [ ] Typed in Obsidian\n"
        try board.write("tasks.setStatus", [screen.inbox[0].key.json, "done"])
        #expect(vault.text.contains("Typed in Obsidian"))
        #expect(!vault.text.contains("- [ ] Idea"))
    }

    @Test func aTaskGoneIsStale() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let screen: ScreenView = try board.read("tasks.screen", ["2026-11-06"], over: try board.files())
        vault.text = Self.file.replacingOccurrences(of: "- [ ] Idea", with: "- [ ] Other")
        #expect(throws: BoardError.refused(code: "staleTask", message: "stale task")) {
            try board.write("tasks.setStatus", [screen.inbox[0].key.json, "done"])
        }
    }

    @Test func paintsAreTheCoresInEitherTheme() throws {
        let board = board(FakeVault(Self.file))
        let files = try board.files()
        let dark: Shades = try board.read("rules.shadesOf", ["red", "dark"], over: files)
        #expect(dark.ink == "#FF453A")
        let title: String = try board.read("rules.dayTitle", ["2026-11-10", "other", "2026-11-06"], over: files)
        #expect(title == "Tue, 10 Nov")
        let due: DueLabel = try board.read("rules.dueLabel", ["2026-11-10"], over: files)
        #expect(due == DueLabel(day: "10", month: "NOV"))
    }

    @Test func theSnapshotIsTheScreenAsDrawn() throws {
        let board = board(FakeVault(Self.file))
        let snapshot = try board.snapshot(day: nil, measures: TimelineMeasures(hour: 50, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18), now: Fixtures.date(6, 10))
        #expect(snapshot.day == "2026-11-06")
        #expect(snapshot.dayTitle == "Today")
        let day = try #require(snapshot.lists[.day])
        #expect(day.showsHeaders)
        #expect(day.groups.map(\.header) == ["No section", "Errands"])
        #expect(day.groups[0].cards.map(\.level) == [0, 1])
        #expect(day.groups[0].cards[1].branch == Branch(last: true, through: []))
        // A section lifts to move among its list's sections, No section does not; the list is the core's name for it.
        #expect(day.groups.map(\.reorder) == [false, true])
        #expect(day.sectionsOf == "now")
        #expect(snapshot.lists[.inbox]?.title == "Inbox")
        let run = try #require(snapshot.timeline.slots.first)
        #expect(run.card.item.title == "Morning run")
        #expect(run.end.map { $0 - run.start } == 60)
        // Its start has passed: it rides the now line (10:00, five hours into a day that starts at 5), its hour kept.
        #expect(run.box.top == 251)
        #expect(run.box.height == 48)
        #expect(snapshot.timeline.now != nil)
        #expect(snapshot.timeline.hours.count == 25)
        #expect(snapshot.column(of: run.id) == "timeline")
    }
}

/// The timeline's zoom, its grid and its paints, as the core answers them.
@Suite struct TimelineZoomTests {
    let board = TaskBoard(core: try! PhoneCore(script: Fixtures.phoneScript), vault: FakeVault(TaskBoardTests.file))
    let measures = GridMeasures(divisions: [5, 15, 30], labelGap: 40, tickMinutes: 5, tickGap: 16)

    @Test func theGridGetsFinerAsTheHourGrows() throws {
        #expect(try board.gridMarks(board.grid(hour: 28, measures: measures)).isEmpty)
        let half = try board.gridMarks(board.grid(hour: 112, measures: measures))
        #expect(half.contains(GridMark(minute: 30, label: ":30")))
        let fine = try board.gridMarks(board.grid(hour: 224, measures: measures))
        #expect(fine.contains(GridMark(minute: 15, label: ":15")))
        #expect(fine.contains { $0.minute == 5 })
    }

    @Test func aListDropIsTheCoresPlace() throws {
        let cards = [PlacedCard(level: 0, group: nil, top: 0, height: 35), PlacedCard(level: 0, group: nil, top: 37, height: 35)]
        let place = try board.placeAt(cards, y: 50, level: 0, shift: 0, room: .null, heads: [], held: .null, hysteresis: 6)
        #expect(place["index"].number == 1)
        #expect(try board.levelAt(x: 150, left: 0, width: 200, indent: 20) == 2.5)
        #expect(try board.carriedMiddle(y: 100, grab: 10, cardHeight: 35) == 107.5)
        #expect(try board.branchOf(levels: [0, 1, 1], index: 1) == Branch(last: false, through: []))
        #expect(try board.gapBranch(levels: [0, 1], gap: ["kind": "gap", "index": 2, "level": 1, "group": .null]) == Branch(last: true, through: []))
        #expect(try board.labelHides(y: 100, now: 103, lift: 7, pill: 16))
        #expect(try !board.labelHides(y: 100, now: nil, lift: 7, pill: 16))
    }

    @Test func aPinchMovesFromTheWholeDayToTheLargestLevel() throws {
        let levels = [28.0, 56, 112, 224]
        #expect(try board.zoomRange(wholeDay: 30, levels: levels) == [30, 56, 112, 224])
        #expect(try board.zoomAfterPinch(hour: 30, wholeDay: 30, levels: levels) == nil)
        #expect(try board.zoomAfterPinch(hour: 80, wholeDay: 30, levels: levels) == 80)
        #expect(try board.zoomShown(saved: "wholeDay", wholeDay: 30, levels: levels) == 30)
        #expect(try board.zoomShown(saved: .null, wholeDay: 30, levels: levels) == 56)
    }

    @Test func theSnapshotCarriesThePastPaintAndTheLevels() throws {
        let snapshot = try board.snapshot(day: nil, measures: TimelineMeasures(hour: 56, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18), now: Fixtures.date(6, 10))
        #expect(snapshot.timeline.zoomLevels == [28, 56, 112, 224])
        #expect(snapshot.timeline.pastPaint.dark.bg.hasPrefix("#"))
        #expect(snapshot.timeline.pastPaint.dark.bar == snapshot.timeline.pastPaint.dark.text)
        let restacked = try board.stack(snapshot.timeline, measures: TimelineMeasures(hour: 224, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18))
        #expect(restacked.map(\.id) == snapshot.timeline.slots.map(\.id))
        #expect(restacked[0].box.height > snapshot.timeline.slots[0].box.height)
    }
}

extension TaskBoardTests {
    /// The quick entry as the app drives it: the session and the screen's look handed in, Enter queueing a job, the job
    /// written through `tasks.<method>`, shown, and done, the next field open the whole time.
    @Test func aTaskTypedInPlaceIsWrittenByItsJob() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let files = try board.files(now: Fixtures.date(6, 10))
        let screen: ScreenView = try board.read("tasks.screen", ["2026-11-06"], over: files)
        func look(_ inbox: [TaskItem]) -> JSONValue {
            let cards = JSONValue.array(inbox.map { ["key": $0.key.json, "level": 0, "group": .null] })
            return ["cards": ["inbox": cards], "sections": ["inbox": [.null]], "sectioned": ["inbox": true], "day": "2026-11-06", "shown": ["inbox"]]
        }
        var session = JSONValue.null
        func call(_ method: String, _ arguments: [JSONValue], _ inbox: [TaskItem]) throws -> JSONValue {
            let reply = try board.entry(method, [session, look(inbox)] + arguments)
            session = reply["session"]
            return reply
        }
        _ = try call("openIn", ["inbox", .null], screen.inbox)
        _ = try call("type", ["Fresh"], screen.inbox)
        let entered = try call("enter", [], screen.inbox)
        #expect(entered["state"]["text"].string == "")
        #expect(isList(entered["state"]["pending"], of: ["Fresh"]))
        guard case .array(let jobs) = session["jobs"], let id = jobs.first?["id"].string else { Issue.record("no job queued"); return }
        let job = try call("call", [.string(id)], screen.inbox)["value"]
        #expect(job["method"].string == "createInPlace")
        guard case .array(let args) = job["args"] else { Issue.record("no arguments"); return }
        let key = try board.write("tasks.createInPlace", args)
        #expect(vault.text.contains("- [ ] Fresh"))
        let after: ScreenView = try board.read("tasks.screen", ["2026-11-06"], over: try board.files(now: Fixtures.date(6, 10)))
        let coming = JSONValue.object(["inbox": .array(after.inbox.map { ["key": $0.key.json, "level": 0, "group": .null] })])
        let shown = try call("shown", [.string(id), key, coming], after.inbox)
        #expect(isList(shown["state"]["pending"], of: []))
        let done = try call("done", [.string(id)], after.inbox)
        #expect(done["state"]["text"].string == "")
        #expect(isList(done["session"]["jobs"], count: 0))
    }

    @Test func aTaskTypedIsFoundByItsIdWhateverWroteBeforeTheDrawing() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let screen: ScreenView = try board.read("tasks.screen", ["2026-11-06"], over: try board.files(now: Fixtures.date(6, 10)))
        func cards(_ inbox: [TaskItem]) -> JSONValue { .array(inbox.map { ["id": .string($0.id), "key": $0.key.json, "level": 0, "group": .null] }) }
        func look(_ inbox: [TaskItem]) -> JSONValue {
            ["cards": ["inbox": cards(inbox)], "sections": ["inbox": [.null]], "sectioned": ["inbox": true], "day": "2026-11-06", "shown": ["inbox"]]
        }
        var session = JSONValue.null
        func call(_ method: String, _ arguments: [JSONValue], _ inbox: [TaskItem]) throws -> JSONValue {
            let reply = try board.entry(method, [session, look(inbox)] + arguments)
            session = reply["session"]
            return reply
        }
        _ = try call("openIn", ["inbox", .null], screen.inbox)
        _ = try call("type", ["Fresh"], screen.inbox)
        _ = try call("enter", [], screen.inbox)
        guard case .array(let jobs) = session["jobs"], let id = jobs.first?["id"].string else { Issue.record("no job queued"); return }
        let job = try call("call", [.string(id)], screen.inbox)["value"]
        guard job["method"].string == "createInPlace", case .array(let args) = job["args"] else { Issue.record("no create"); return }
        let made = try board.write("tasks.createWithId", args)
        let madeId = try #require(made["id"].string)
        // Another write lands before the screen is drawn: a line put above it moves the new task's key.
        vault.text = vault.text.replacingOccurrences(of: "## Inbox\n", with: "## Inbox\n- [ ] Synced from the Mac\n")
        let after: ScreenView = try board.read("tasks.screen", ["2026-11-06"], over: try board.files(now: Fixtures.date(6, 10)))
        let fresh = try #require(after.inbox.first { $0.title == "Fresh" })
        #expect(fresh.id == madeId)
        #expect(fresh.key.json != made["key"])
        let shown = try call("shown", [.string(id), made, .object(["inbox": cards(after.inbox)])], after.inbox)
        #expect(isList(shown["state"]["pending"], of: []))
        let done = try call("done", [.string(id)], after.inbox)
        #expect(isList(done["session"]["jobs"], count: 0))
    }

    private func isList(_ value: JSONValue, of texts: [String]) -> Bool {
        guard case .array(let items) = value else { return false }
        return items.map { $0["text"].string ?? "" } == texts
    }

    private func isList(_ value: JSONValue, count: Int) -> Bool {
        guard case .array(let items) = value else { return false }
        return items.count == count
    }
}
