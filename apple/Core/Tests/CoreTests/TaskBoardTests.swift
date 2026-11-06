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
        let snapshot = try board.snapshot(day: nil, now: Fixtures.date(6, 10))
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
        #expect(snapshot.timeline.now != nil)
        #expect(snapshot.timeline.hours.count == 25)
        #expect(snapshot.column(of: run.id) == "timeline")
    }
}
