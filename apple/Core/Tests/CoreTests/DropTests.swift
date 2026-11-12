import Foundation
import Testing
@testable import Core

/// Where a carry over a list may be placed, as the plugin asks it (`ListDrop.placesAnywhere`): the core decides.
@Suite struct PlacesInGapTests {
    let board = TaskBoard(core: try! PhoneCore(script: Fixtures.phoneScript), vault: FakeVault(""))

    /// A list that shows no sections (a past day's) takes a card from another column only at its end: no line mid-list.
    @Test func aListWithNoSectionsTakesAnotherColumnsCardAtItsEnd() throws {
        #expect(try board.placesInGap(column: "day", from: "inbox", grouped: false) == false)
        #expect(try board.placesInGap(column: "day", from: "timeline", grouped: false) == false)
    }

    @Test func itsOwnCardsAndANewTaskGoInAGap() throws {
        #expect(try board.placesInGap(column: "day", from: "day", grouped: false))
        #expect(try board.placesInGap(column: "day", from: "new", grouped: false))
    }

    @Test func aListThatShowsSectionsTakesACardFromAnywhereInAGap() throws {
        #expect(try board.placesInGap(column: "inbox", from: "soon", grouped: true))
    }
}

/// The screen a drop leaves, drawn before the write, equal to the read after it.
@Suite struct DropPreviewTests {
    static let file = [
        "## Inbox", "", "- [ ] Idea", "- [ ] Other", "",
        "## Now", "", "- [ ] Parent", "\t- [ ] Child", "### Evening", "- [ ] Cook", "### Errands", "",
        "## Soon", "", "- [ ] Later", "",
        "## Backlog", "", "- [ ] Someday", "",
        "## Done", "",
    ].joined(separator: "\n")
    static let measures = TimelineMeasures(hour: 50, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)
    let core = try! PhoneCore(script: Fixtures.phoneScript)

    private func card(_ snapshot: BoardSnapshot, _ title: String) throws -> (card: BoardCard, column: BoardColumn) {
        for (column, list) in snapshot.lists {
            if let card = list.cards.first(where: { $0.item.title == title }) { return (card, column) }
        }
        throw BoardError.failed("no \(title)")
    }

    /// The preview of a drop, then the drop written and read: the same screen, every card with the same id.
    /// The app's board: the previews worked out on their own core, apart from the reads' and the pure rules'.
    private func check(_ title: String, to: (BoardSnapshot) throws -> JSONValue) throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file), pure: try PhoneCore(script: Fixtures.phoneScript), preview: try PhoneCore(script: Fixtures.phoneScript))
        // One moment for every read: a minute turning between them would move the now line, not the drop.
        let now = Date()
        let before = try board.snapshot(day: nil, measures: Self.measures, now: now)
        let (lifted, column) = try card(before, title)
        let tasks: JSONValue = [["key": lifted.item.key.json, "from": .string(column.rawValue)]]
        let target = try to(before)
        let preview = try board.dropPreview(tasks, to: target, over: before, measures: Self.measures, now: now)
        #expect(preview.landings.first?.id == lifted.id)
        try board.write("tasks.drop", [tasks, target, .string(before.day)])
        let after = try board.snapshot(day: nil, measures: Self.measures, now: now)
        #expect(preview.snapshot.lists == after.lists)
        #expect(preview.snapshot.timeline == after.timeline)
        #expect(preview.snapshot.tasksText == after.tasksText)
        #expect(preview.snapshot.canUndo)
        #expect(preview.snapshot.motion(from: after) == .still)
    }

    @Test func aDropIntoAnotherListsSection() throws {
        try check("Idea") { _ in ["kind": "place", "column": "day", "place": ["kind": "task", "group": "Evening", "before": .null]] }
    }

    @Test func aDropIntoAnEmptySection() throws {
        try check("Later") { _ in ["kind": "place", "column": "day", "place": ["kind": "task", "group": "Errands", "before": .null]] }
    }

    @Test func aDropAsASubtask() throws {
        try check("Other") { before in
            let parent = try card(before, "Parent").card
            return ["kind": "place", "column": "day", "place": ["kind": "subtask", "parent": parent.item.key.json, "before": .null]]
        }
    }

    @Test func aDropOnAColumnsTitle() throws {
        try check("Cook") { before in try #require(before.screen.titleDrops["backlog"]) }
    }

    @Test func aDropOnTheCalendar() throws {
        try check("Someday") { _ in ["kind": "time", "start": 600] }
    }

    @Test func aDropThatChangesNothingLeavesTheScreenAsItIs() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let before = try board.snapshot(day: nil, measures: Self.measures)
        let (idea, _) = try card(before, "Idea")
        let tasks: JSONValue = [["key": idea.item.key.json, "from": "inbox"]]
        let target: JSONValue = ["kind": "place", "column": "inbox", "place": ["kind": "task", "group": .null, "before": before.lists[.inbox]!.cards[1].item.key.json]]
        let preview = try board.dropPreview(tasks, to: target, over: before, measures: Self.measures)
        #expect(preview.snapshot.lists == before.lists)
    }
}

/// Max, 2026-11-09: a section dragged before Evening showed above No section after the read, though the file had it
/// below. No section is handed back to the core with its null name, so an empty section stands where the file has it.
@Suite struct SectionOrderTests {
    @Test func anEmptySectionAfterTheTasksOutsideAnySectionIsDrawnAfterThem() throws {
        let file = [
            "## Inbox", "", "## Now", "", "- [ ] Morning run", "### Errands", "### Evening", "- [ ] Cook dinner", "### Work", "- [ ] Email Bob", "",
            "## Soon", "", "## Backlog", "", "## Done", "",
        ].joined(separator: "\n")
        let board = TaskBoard(core: try PhoneCore(script: Fixtures.phoneScript), vault: FakeVault(file))
        let screen = try board.snapshot(day: nil, measures: DropPreviewTests.measures)
        #expect(screen.lists[.day]?.groups.map(\.name) == [nil, "Errands", "Evening", "Work"])
    }
}

