import Foundation
import Testing
@testable import Core

/// Who a card is from one drawing to the next (the core's ids, kept by the board between calls), and how the screen moves
/// between two drawings.
@Suite struct IdentityTests {
    static let file = [
        "## Inbox", "", "- [ ] Idea", "- [ ] Twin", "- [ ] Twin", "",
        "## Now", "", "- [ ] Parent 📅 2026-11-06", "\t- [ ] Child", "### Errands", "- [ ] Shop", "",
        "## Soon", "", "- [ ] Later 📅 2026-11-09", "",
        "## Backlog", "", "## Done", "",
    ].joined(separator: "\n")

    static let measures = TimelineMeasures(hour: 50, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)
    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func screen(_ board: TaskBoard) throws -> BoardSnapshot {
        try board.snapshot(day: "2026-11-06", measures: Self.measures, now: Fixtures.date(6, 10))
    }

    func card(_ snapshot: BoardSnapshot, _ title: String) throws -> BoardCard {
        try #require(snapshot.lists.values.flatMap(\.cards).first { $0.item.title == title })
    }

    @Test func aCardKeepsItsIdThroughWritesToItsLine() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let before = try card(try screen(board), "Idea")
        try board.write("tasks.togglePriority", [.array([before.item.key.json]), "p1"])
        let prioritized = try card(try screen(board), "Idea")
        #expect(prioritized.id == before.id)
        #expect(prioritized.item.key.raw != before.item.key.raw)
        try board.write("tasks.pickStatus", [.array([prioritized.item.key.json]), "inProgress"])
        #expect(try card(try screen(board), "Idea").id == before.id)
        try board.write("tasks.rename", [try card(try screen(board), "Idea").item.key.json, "Better idea"])
        #expect(try card(try screen(board), "Better idea").id == before.id)
    }

    @Test func aCardKeepsItsIdWhenItMovesToAnotherList() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let shop = try card(try screen(board), "Shop")
        try board.write("tasks.postponeAll", [.array([shop.item.key.json]), "2026-11-09"])
        let moved = try board.snapshot(day: "2026-11-09", measures: Self.measures, now: Fixtures.date(6, 10))
        #expect(try card(moved, "Shop").id == shop.id)
        #expect(moved.column(of: shop.id) == "day")
    }

    @Test func undoGivesTheCardItsIdBack() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let idea = try card(try screen(board), "Idea")
        try board.write("tasks.pickStatus", [.array([idea.item.key.json]), "done"])
        #expect(try screen(board).item(idea.id) == nil)
        try board.write("history.undo")
        #expect(try card(try screen(board), "Idea").id == idea.id)
    }

    @Test func twinsAreTwoCards() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let twins = try screen(board).lists[.inbox]?.cards.filter { $0.item.title == "Twin" } ?? []
        #expect(twins.count == 2)
        #expect(Set(twins.map(\.id)).count == 2)
    }

    @Test func aSectionHeaderKeepsItsIdThroughARename() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let errands = try #require(try screen(board).lists[.day]?.groups.first { $0.name == "Errands" })
        try board.write("tasks.renameGroup", ["now", "Errands", "Chores"])
        let renamed = try #require(try screen(board).lists[.day]?.groups.first { $0.name == "Chores" })
        #expect(renamed.id == errands.id)
        #expect(try screen(board).lists[.day]?.groups.first { $0.name == nil }?.id == "none")
    }

    @Test func aReadMadeBeforeAWriteNeverTakesTheWritesIdsBack() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        let idea = try card(try screen(board), "Idea")
        let older = try board.files(now: Fixtures.date(6, 10))
        try board.write("tasks.togglePriority", [.array([idea.item.key.json]), "p1"])
        let _: ScreenView = try board.read("tasks.screen", ["2026-11-06"], over: older)
        #expect(try card(try screen(board), "Idea").id == idea.id)
    }

    @Test func anEditElsewhereKeepsTheLinesItLeavesInPlace() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        let idea = try card(try screen(board), "Idea")
        vault.text = vault.text.replacingOccurrences(of: "- [ ] Later", with: "- [ ] Typed in Obsidian\n- [ ] Later")
        let after = try screen(board)
        #expect(try card(after, "Idea").id == idea.id)
        #expect(try card(after, "Typed in Obsidian").id != idea.id)
    }

    @Test func aFileTheDoorTidiesKeepsItsIdsAcrossReads() throws {
        let untidied = IdentityTests.file.replacingOccurrences(of: "- [ ] Parent", with: "- [x] Finished\n- [ ] Parent")
        let vault = FakeVault(untidied)
        let board = TaskBoard(core: core, vault: vault)
        let first = try screen(board)
        let second = try screen(board)
        #expect(vault.text == untidied)
        for title in ["Idea", "Parent", "Child", "Shop"] {
            #expect(try card(second, title).id == card(first, title).id)
        }
    }

    @Test func aRuleOverNoFileLeavesTheIdsAlone() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let idea = try card(try screen(board), "Idea")
        let _: TaskMenuModel = try board.read("tasks.menu", [idea.item.json, "inbox", ["today": "2026-11-06", "day": "2026-11-06", "offer": .null]], over: board.settingsOnly())
        let _: String = try board.rule("rules.dayTitle", ["2026-11-06", "today", "2026-11-06"])
        #expect(try card(try screen(board), "Idea").id == idea.id)
    }
}

@Suite struct BoardMotionTests {
    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func screen(_ board: TaskBoard, _ day: String = "2026-11-06") throws -> BoardSnapshot {
        try board.snapshot(day: day, measures: IdentityTests.measures, now: Fixtures.date(6, 10))
    }

    @Test func theFirstDrawingAndTheSameDrawingStandStill() throws {
        let board = TaskBoard(core: core, vault: FakeVault(IdentityTests.file))
        let first = try screen(board)
        #expect(first.motion(from: nil) == .still)
        #expect(try screen(board).motion(from: first) == .still)
    }

    @Test func aWriteMovesTheCards() throws {
        let board = TaskBoard(core: core, vault: FakeVault(IdentityTests.file))
        let before = try screen(board)
        let idea = try #require(before.lists[.inbox]?.cards.first)
        try board.write("tasks.pickStatus", [.array([idea.item.key.json]), "done"])
        #expect(try screen(board).motion(from: before) == .change)
    }

    @Test func anotherDayTurnsByItsDirection() throws {
        let board = TaskBoard(core: core, vault: FakeVault(IdentityTests.file))
        let today = try screen(board)
        #expect(try screen(board, "2026-11-07").motion(from: today) == .turn(forward: true))
        #expect(try screen(board, "2026-11-05").motion(from: today) == .turn(forward: false))
    }
}

@Suite struct CarryEndTests {
    @Test func aCancelEndsOnceTheCopyIsHome() {
        var end = CarryEnd(writes: false)
        #expect(!end.done)
        let ends = end.land()
        #expect(ends)
    }

    @Test func aDropEndsOnlyOnceItLandedAndItsWriteIsDrawn() {
        var drawnFirst = CarryEnd(writes: true)
        let afterDraw = drawnFirst.draw()
        let afterLanding = drawnFirst.land()
        #expect(!afterDraw && afterLanding)
        var landedFirst = CarryEnd(writes: true)
        let landed = landedFirst.land()
        let drawn = landedFirst.draw()
        #expect(!landed && drawn)
    }
}

/// Every order a carry's signals come in ends it exactly once, and only when its copy is down and its write drawn.
@Suite struct CarryLifeTests {
    enum Signal: CaseIterable { case letGoWrites, letGoNone, landed, drawn, cardDropped, boardPerformed, boardNotPerformed }

    /// Plays `signals` and counts the endings; `boardOpen` is whether the board still has a session when the card speaks.
    private func play(_ signals: [Signal], kind: CarryLife.Kind = .card, boardOpen: Bool = true) -> (ends: Int, life: CarryLife) {
        var life = CarryLife(kind: kind)
        var ends = 0
        var open = boardOpen
        for signal in signals {
            let ended: Bool
            switch signal {
            case .letGoWrites: life.letGo(writes: true); ended = false
            case .letGoNone: life.letGo(writes: false); ended = false
            case .landed: ended = life.landed()
            case .drawn: ended = life.drawn()
            case .cardDropped: ended = life.cardDropped(boardOpen: open)
            case .boardPerformed: ended = life.boardEnded(performed: true); open = false
            case .boardNotPerformed: ended = life.boardEnded(performed: false); open = false
            }
            if ended { ends += 1 }
        }
        return (ends, life)
    }

    @Test func aBoardDropEndsOnceLandedAndDrawnInEitherOrder() {
        // The board's perform lets it go writing; its copy's landing, the card's end, the session end and the drawing come
        // in any order.
        let tails: [[Signal]] = [
            [.cardDropped, .landed, .boardPerformed, .drawn],
            [.cardDropped, .drawn, .landed, .boardPerformed],
            [.drawn, .cardDropped, .boardPerformed, .landed],
            [.landed, .cardDropped, .drawn, .boardPerformed],
            [.boardPerformed, .drawn, .cardDropped, .landed],
        ]
        for tail in tails {
            let (ends, life) = play([Signal.letGoWrites] + tail)
            #expect(ends == 1, "\(tail)")
            #expect(life.finished)
        }
    }

    @Test func aWritingDropNeverEndsBeforeItsWriteIsDrawn() {
        let (ends, life) = play([.letGoWrites, .cardDropped, .landed, .boardPerformed])
        #expect(ends == 0 && !life.finished)
        var drawn = life
        let ends2 = drawn.drawn()
        #expect(ends2)
    }

    @Test func theCardSpeakingBeforeTheBoardWaitsForTheBoard() {
        // UIKit ends the card's session with a drop before the board's perform comes: nothing ends yet, the board's drop
        // still lets it go writing, and it ends once landed and drawn.
        let (ends, life) = play([.cardDropped, .letGoWrites, .landed, .boardPerformed, .drawn])
        #expect(ends == 1 && life.finished)
        let (early, waiting) = play([.cardDropped])
        #expect(early == 0 && !waiting.released)
    }

    @Test func aDropTakenByAnotherReceiverEndsOnce() {
        // The board never had a session: the card's end ends it at once, nothing written here.
        let (alone, life) = play([.cardDropped, .landed, .drawn], boardOpen: false)
        #expect(alone == 1 && life.finished)
        // The board had a session (the finger passed over it) but did not perform: its end ends it.
        let (passed, _) = play([.cardDropped, .boardNotPerformed, .landed])
        #expect(passed == 1)
        let (boardFirst, _) = play([.boardNotPerformed, .cardDropped], boardOpen: false)
        #expect(boardFirst == 1)
    }

    @Test func aCancelEndsWhenItsCopyIsHomeNotWhenTheBoardEnds() {
        let (ends, _) = play([.letGoNone, .boardNotPerformed])
        #expect(ends == 0)
        let (home, life) = play([.letGoNone, .boardNotPerformed, .landed])
        #expect(home == 1 && life.finished)
    }

    @Test func aSectionEndsWithTheBoardsSession() {
        let (none, _) = play([.boardNotPerformed], kind: .section)
        #expect(none == 1)
        let (moved, _) = play([.letGoWrites, .boardPerformed, .drawn], kind: .section)
        #expect(moved == 1)
    }

    @Test func anEndedCarryEndsNoMoreAndAFinishCountsOnce() {
        for signal in Signal.allCases {
            let (ends, life) = play([.letGoNone, .landed, signal, signal])
            #expect(ends == 1 && life.finished, "\(signal)")
        }
        var life = CarryLife(kind: .card)
        let first = life.finish()
        let second = life.finish()
        let landed = life.landed()
        #expect(first && !second && !landed)
    }

    @Test func everyOrderOfACardsSignalsEndsAtMostOnceAndAWritingOneOnlyAfterItsWrite() {
        // All orders of the four signals that follow a drop the board took.
        func orders(_ items: [Signal]) -> [[Signal]] {
            guard items.count > 1 else { return [items] }
            return items.indices.flatMap { i -> [[Signal]] in
                var rest = items
                let head = rest.remove(at: i)
                return orders(rest).map { [head] + $0 }
            }
        }
        for order in orders([.cardDropped, .landed, .boardPerformed, .drawn]) {
            let (ends, life) = play([Signal.letGoWrites] + order)
            #expect(ends == 1 && life.finished, "\(order)")
        }
        for order in orders([.cardDropped, .landed, .boardNotPerformed]) {
            let (ends, _) = play(order)
            #expect(ends == 1, "\(order)")
        }
    }
}

/// Where a drop lands, asked of the core before the write: the copy flies there.
@Suite struct LandingTests {
    let core = try! PhoneCore(script: Fixtures.phoneScript)

    @Test func aDropOnThePastOfTodayRidesTheNowLineAndTheWriteAgrees() throws {
        let vault = FakeVault(IdentityTests.file)
        let board = TaskBoard(core: core, vault: vault)
        // The write is made at the moment it runs: the screen is read at that moment too.
        let before = try board.snapshot(day: nil, measures: IdentityTests.measures)
        let today = before.day
        let idea = try #require(before.lists[.inbox]?.cards.first { $0.item.title == "Idea" })
        let tasks: JSONValue = [["key": idea.item.key.json, "from": "inbox"]]
        let to: JSONValue = ["kind": "time", "start": 0]
        let landed = try #require(try board.landing(tasks, to: to, over: before).first)
        #expect(landed.kind == "timeline")
        #expect(landed.id == idea.id)
        #expect(landed.ridesNow == true)
        let box = try #require(try board.box(of: landed, events: before.timeline.events, measures: IdentityTests.measures))
        try board.write("tasks.drop", [tasks, to, .string(today)])
        let after = try board.snapshot(day: nil, measures: IdentityTests.measures)
        let slot = try #require(after.timeline.slots.first { $0.id == idea.id })
        #expect(slot.start == landed.span?.start)
        #expect(slot.box == box)
    }

    @Test func aListLandingIsTheRoomBeforeItsIndexInItsSection() throws {
        let board = TaskBoard(core: core, vault: FakeVault(IdentityTests.file))
        let screen = try board.snapshot(day: "2026-11-06", measures: IdentityTests.measures, now: Fixtures.date(6, 10))
        let cards = try #require(screen.lists[.day]?.cards)
        let shop = try #require(cards.firstIndex { $0.item.title == "Shop" })
        let parent = try #require(cards.first { $0.item.title == "Parent" })
        let child = try #require(cards.firstIndex { $0.item.title == "Child" })
        let list: DropLanding = try JSONValue.object(["kind": "list", "id": "x", "item": .null, "column": "day", "group": "Errands", "index": 0]).decode()
        #expect(list.gap(in: .day, among: cards) == LandingGap(at: shop, level: 0, group: "Errands"))
        let last: DropLanding = try JSONValue.object(["kind": "list", "id": "x", "item": .null, "column": "day", "group": "Errands", "index": 1]).decode()
        #expect(last.gap(in: .day, among: cards) == LandingGap(at: shop + 1, level: 0, group: "Errands"))
        #expect(list.gap(in: .soon, among: cards) == nil)
        let sub: DropLanding = try JSONValue.object(["kind": "subtask", "id": "x", "item": .null, "parent": .string(parent.id), "index": 0]).decode()
        #expect(sub.gap(in: .day, among: cards) == LandingGap(at: child, level: 1, group: parent.item.group))
    }
}

@Suite struct TaskPageTests {
    @Test func aPageIsReadWholeBeforeItShows() throws {
        let board = TaskBoard(core: try PhoneCore(script: Fixtures.phoneScript), vault: FakeVault(IdentityTests.file))
        let screen = try board.snapshot(day: nil, measures: IdentityTests.measures)
        let parent = try #require(screen.lists.values.flatMap(\.cards).first { $0.item.title == "Parent" })
        let menuScreen: JSONValue = ["today": .string(screen.today), "day": .string(screen.day), "offer": screen.screen.offer]
        let page = try board.page(parent.item, screen: menuScreen)
        #expect(page.task.id == parent.id)
        let child = try #require(page.tree?.rows.first { $0.item.title == "Child" })
        #expect(page.subtaskMenus[child.item.id] != nil)
        #expect(page.menu != nil)
        #expect(page.cards[child.item.id] != nil)
        #expect(!page.gone)
    }
}
