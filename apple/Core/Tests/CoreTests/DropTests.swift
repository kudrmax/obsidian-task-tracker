import Foundation
import Testing
@testable import Core

/// The drop the app makes with the system's drag: the gap the system opens read as the core's place over the rows laid
/// out evenly (every gap a place), and the screen the drop leaves, drawn before the write, equal to the read after it.
@Suite struct ListTargetTests {
    let core = try! PhoneCore(script: Fixtures.phoneScript)
    var board: TaskBoard { TaskBoard(core: core, vault: FakeVault("")) }

    /// A day list with tasks outside any section, two sections, a subtask and an empty section with its plate.
    let rows: [DropRow] = [
        .card(level: 0, group: nil, zone: nil),
        .card(level: 1, group: nil, zone: nil),
        .head(group: "Evening", opens: false),
        .card(level: 0, group: "Evening", zone: nil),
        .card(level: 0, group: "Evening", zone: nil),
        .head(group: "Errands", opens: false),
        .other,
    ]

    private func place(_ gap: Int, level: Double = 0) throws -> (index: Int, level: Int, group: String?) {
        let place = try ListTarget(rows: rows).place(at: gap, level: level, board: board)
        #expect(place["kind"].string == "gap")
        return (Int(try #require(place["index"].number)), Int(try #require(place["level"].number)), place["group"].string)
    }

    @Test func everyGapOfTheListIsAPlace() throws {
        for gap in 0...rows.count {
            for level in stride(from: -2.0, through: 3.0, by: 0.5) {
                _ = try place(gap, level: level)
            }
        }
    }

    @Test func aGapUnderAHeaderIsInItsSectionAndOverOneEndsTheSectionBefore() throws {
        #expect(try place(3) == (2, 0, "Evening"))
        #expect(try place(2) == (2, 0, nil))
        #expect(try place(5) == (4, 0, "Evening"))
    }

    @Test func anEmptySectionTakesTheGapOverAndUnderItsPlate() throws {
        #expect(try place(6) == (4, 0, "Errands"))
        #expect(try place(7) == (4, 0, "Errands"))
    }

    @Test func theFingersXPicksTheLevelTheNeighboursAllow() throws {
        #expect(try place(1, level: 1.2) == (1, 1, nil))
        #expect(try place(1, level: 0.3) == (1, 1, nil))
        #expect(try place(2, level: 0.3) == (2, 0, nil))
        #expect(try place(2, level: 3) == (2, 2, nil))
        #expect(try place(4, level: 1) == (3, 1, "Evening"))
        // A header breaks nesting: the first card under it is a task.
        #expect(try place(3, level: 2) == (2, 0, "Evening"))
    }

    /// A card carried within its own list: the gap is where the list lays its row out among the others.
    @Test func theGapOfARowCarriedInItsOwnListIsWhereItStands() {
        #expect(ListTarget.gap(holding: 150, among: [20, 60, 100, 200, 240]) == 3)
        #expect(ListTarget.gap(holding: 0, among: [20, 60]) == 0)
        #expect(ListTarget.gap(holding: 500, among: [20, 60]) == 2)
    }

    @Test func theCardsOwnGapAtItsLevelChangesNothing() throws {
        let cards: JSONValue = [
            ["key": ["line": 1, "text": "A"], "level": 0, "group": .null],
            ["key": ["line": 2, "text": "B"], "level": 0, "group": "Evening"],
        ]
        let home: JSONValue = ["kind": "gap", "index": 1, "level": 0, "group": "Evening"]
        let lifted = ListTarget(rows: [.card(level: 0, group: nil, zone: nil), .head(group: "Evening", opens: false), .card(level: 0, group: "Evening", zone: nil)])
        let there = try lifted.place(at: 2, level: 0, board: board)
        let stays: JSONValue? = try board.rule("rules.placeOfDrop", [cards, there, home])
        #expect(stays == nil || stays == .null)
    }
}

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
    private func check(_ title: String, to: (BoardSnapshot) throws -> JSONValue) throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let before = try board.snapshot(day: nil, measures: Self.measures)
        let (lifted, column) = try card(before, title)
        let tasks: JSONValue = [["key": lifted.item.key.json, "from": .string(column.rawValue)]]
        let target = try to(before)
        let preview = try board.dropPreview(tasks, to: target, over: before, measures: Self.measures)
        #expect(preview.landings.first?.id == lifted.id)
        try board.write("tasks.drop", [tasks, target, .string(before.day)])
        let after = try board.snapshot(day: nil, measures: Self.measures)
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

