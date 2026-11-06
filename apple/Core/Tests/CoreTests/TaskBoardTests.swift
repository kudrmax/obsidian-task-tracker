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
        #expect(day.groups[0].cards[1].branch == .last)
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
        #expect(try board.gridMarks(hour: 28, measures: measures).isEmpty)
        let half = try board.gridMarks(hour: 112, measures: measures)
        #expect(half.contains(GridMark(minute: 30, label: ":30")))
        let fine = try board.gridMarks(hour: 224, measures: measures)
        #expect(fine.contains(GridMark(minute: 15, label: ":15")))
        #expect(fine.contains { $0.minute == 5 })
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
