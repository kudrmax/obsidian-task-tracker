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

@Suite struct CarryTurnsTests {
    @Test func aCarryEndsOnceWithItsSession() {
        var turns = CarryTurns()
        let first = turns.begin()
        let ended1 = turns.end(first)
        #expect(ended1)
        let ended2 = turns.end(first)
        #expect(!ended2)
        #expect(turns.current == nil)
    }

    /// The drop side and the drag side both end a carry; whichever comes first ends it, the other changes nothing.
    @Test func bothSidesEndingACarryEndItOnce() {
        var turns = CarryTurns()
        let token = turns.begin()
        let dropSide = turns.end(token)
        let dragSide = turns.end(token)
        #expect(dropSide)
        #expect(!dragSide)
        let next = turns.begin()
        let late = turns.end(token)
        #expect(!late)
        #expect(turns.current == next)
    }

    /// The next card lifted while the last one's copy still settles: the last session's end ends nothing of the new carry.
    @Test func anEarlierSessionsEndNeverEndsTheNextCarry() {
        var turns = CarryTurns()
        let first = turns.begin()
        let second = turns.begin()
        let ended3 = turns.end(first)
        #expect(!ended3)
        #expect(turns.current == second)
        let ended4 = turns.end(second)
        #expect(ended4)
    }
}

@Suite struct CarryFlowTests {
    @Test func aCarryGoesThroughItsPhasesAndLandsOnce() {
        var flow = CarryFlow()
        let token = flow.lift()!
        #expect(flow.phase == .lifted(token))
        let moved = flow.move(token)
        #expect(moved)
        #expect(flow.phase == .carrying(token))
        let let1 = flow.letGo(token)
        #expect(let1)
        #expect(flow.phase == .landing(token))
        let landed1 = flow.landed(token)
        let landed2 = flow.landed(token)
        #expect(landed1)
        #expect(!landed2)
        #expect(flow.phase == .idle)
    }

    /// A press while the last copy still flies lifts nothing; once it is down the next lift goes.
    @Test func noLiftWhileACopyLands() {
        var flow = CarryFlow()
        let first = flow.lift()!
        _ = flow.letGo(first)
        #expect(flow.lift() == nil)
        _ = flow.landed(first)
        let second = flow.lift()
        #expect(second != nil && second != first)
    }

    /// A lift let go before it moved (a long press released in place) lands like any carry.
    @Test func aLiftLetGoUnmovedLands() {
        var flow = CarryFlow()
        let token = flow.lift()!
        let went = flow.letGo(token)
        #expect(went)
        let landed = flow.landed(token)
        #expect(landed)
    }

    /// Every order of late signals: a move or a let-go of an ended carry, or a landing heard twice, changes nothing of the
    /// next carry.
    @Test func lateSignalsOfAnEndedCarryChangeNothing() {
        var flow = CarryFlow()
        let first = flow.lift()!
        _ = flow.letGo(first)
        _ = flow.landed(first)
        let second = flow.lift()!
        let lateMove = flow.move(first)
        let lateLetGo = flow.letGo(first)
        let lateLanding = flow.landed(first)
        #expect(!lateMove)
        #expect(!lateLetGo)
        #expect(!lateLanding)
        #expect(flow.phase == .lifted(second))
        let notYet = flow.landed(second)
        #expect(!notYet)
        #expect(flow.current == second)
    }
}

/// A press reads whether it may lift without changing anything: a refused press never sets the landing copy down.
@Suite struct CarryFlowLiftTests {
    @Test func aPressMayLiftWhileACopySettlesAndAskingChangesNothing() {
        var flow = CarryFlow()
        let first = flow.lift()!
        #expect(!flow.mayLift)
        _ = flow.letGo(first)
        #expect(flow.mayLift)
        #expect(flow.mayLift)
        #expect(flow.phase == .landing(first))
        #expect(flow.settling == first)
    }

    @Test func nothingMayLiftWhileCarried() {
        var flow = CarryFlow()
        let token = flow.lift()!
        _ = flow.move(token)
        #expect(!flow.mayLift)
        #expect(flow.settling == nil)
    }
}

@Suite struct EdgeScrollStepTests {
    let step = EdgeScrollStep(band: 48, speed: 540)

    @Test func itScrollsFasterTheNearerTheEdgeAndNotBetweenTheBands() {
        #expect(step.velocity(fromTop: 0, fromBottom: 500) == -540)
        #expect(step.velocity(fromTop: 24, fromBottom: 500) == -270)
        #expect(step.velocity(fromTop: 300, fromBottom: 300) == 0)
        #expect(step.velocity(fromTop: 500, fromBottom: 12) == 405)
        #expect(step.velocity(fromTop: 500, fromBottom: -10) == 540)
    }

    /// By the second: two 120 Hz frames go as far as one 60 Hz frame.
    @Test func itGoesAsFarInASecondAtAnyFrameRate() {
        let sixty = EdgeScrollStep.next(offset: 100, velocity: 540, elapsed: 1.0 / 60, least: 0, most: 1000)!
        let half = EdgeScrollStep.next(offset: 100, velocity: 540, elapsed: 1.0 / 120, least: 0, most: 1000)!
        let twice = EdgeScrollStep.next(offset: half, velocity: 540, elapsed: 1.0 / 120, least: 0, most: 1000)!
        #expect(abs(sixty - twice) < 0.0001)
        #expect(abs(sixty - 109) < 0.0001)
    }

    /// At its end the scroll stops asking for frames.
    @Test func itStopsWhereItCanGoNoFurther() {
        #expect(EdgeScrollStep.next(offset: 0, velocity: -300, elapsed: 0.016, least: 0, most: 1000) == nil)
        #expect(EdgeScrollStep.next(offset: 1000, velocity: 300, elapsed: 0.016, least: 0, most: 1000) == nil)
        #expect(EdgeScrollStep.next(offset: 995, velocity: 540, elapsed: 0.1, least: 0, most: 1000) == 1000)
        #expect(EdgeScrollStep.next(offset: 10, velocity: 0, elapsed: 0.016, least: 0, most: 1000) == nil)
        // A list shorter than its box can't scroll either way.
        #expect(EdgeScrollStep.next(offset: 0, velocity: 300, elapsed: 0.016, least: 0, most: -20) == nil)
    }
}

@Suite struct PrefetchTests {
    /// The let-go on the place worked out finds it ready; on another place it is worked out by the caller.
    @Test func aPlaceWorkedOutIsReadyAndAnotherIsNot() {
        let prefetch = Prefetch<String, Int>(label: "test")
        prefetch.want("a") { 1 }
        #expect(prefetch.take("a") == 1)
        #expect(prefetch.take("b") == nil)
    }

    /// A let-go on the place under way waits for its rest, never works it out twice.
    @Test func aTakeWaitsForThePieceUnderWay() {
        let prefetch = Prefetch<String, Int>(label: "test")
        let gate = DispatchSemaphore(value: 0)
        prefetch.want("a") {
            gate.wait()
            return 7
        }
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.05) { gate.signal() }
        #expect(prefetch.take("a") == 7)
    }

    /// The places a carry passes over while one is worked out are never worked out: only the latest waits.
    @Test func onlyTheLatestWaitingPlaceIsWorkedOut() {
        let prefetch = Prefetch<String, Int>(label: "test")
        let gate = DispatchSemaphore(value: 0)
        let counter = Counter()
        prefetch.want("a") {
            gate.wait()
            return 1
        }
        prefetch.want("b") { counter.add(); return 2 }
        prefetch.want("c") { counter.add(); return 3 }
        gate.signal()
        #expect(prefetch.take("a") == 1)
        var waited = 0
        while prefetch.take("c") == nil, waited < 200 {
            Thread.sleep(forTimeInterval: 0.005)
            waited += 1
        }
        #expect(prefetch.take("c") == 3)
        #expect(prefetch.take("b") == nil)
        #expect(counter.count == 1)
    }

    @Test func clearedItHoldsNothing() {
        let prefetch = Prefetch<String, Int>(label: "test")
        prefetch.want("a") { 1 }
        _ = prefetch.take("a")
        prefetch.clear()
        #expect(prefetch.take("a") == nil)
    }

    private final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private(set) var count = 0
        func add() {
            lock.lock()
            count += 1
            lock.unlock()
        }
    }
}

/// Lead, 11-09: a timed block dropped on a past day's list went to Soon, off the screen, and its copy flew back to its old
/// spot and vanished. The copy goes where the card now is when that shows, else it fades where it was let go.
@Suite struct LandingPickTests {
    let screen = CGRect(x: 0, y: 0, width: 400, height: 800)

    @Test func theCardsOwnListFirstWhenItShows() {
        let pick = LandingPick.first([("day", CGRect(x: 10, y: 100, width: 180, height: 35), screen), ("soon", CGRect(x: 210, y: 100, width: 180, height: 35), screen)])
        #expect(pick == "day")
    }

    /// Soon partly on the screen: the copy flies there.
    @Test func anotherListThatShowsTakesIt() {
        let pick = LandingPick.first([("day", CGRect(x: 10, y: 900, width: 180, height: 35), screen), ("soon", CGRect(x: 380, y: 100, width: 180, height: 35), screen)])
        #expect(pick == "soon")
    }

    /// Off the screen everywhere (a column scrolled away, a list that ends above it): no place, the copy fades.
    @Test func nothingOnTheScreenIsNoPlace() {
        let pick = LandingPick.first([("soon", CGRect(x: 420, y: 100, width: 180, height: 35), screen), ("inbox", CGRect(x: -300, y: 100, width: 180, height: 35), screen)])
        #expect(pick == nil)
    }

    /// A list's rows scrolled out of its own box do not show, though the box is on the screen.
    @Test func aRowScrolledOutOfItsListDoesNotShow() {
        let list = CGRect(x: 0, y: 150, width: 200, height: 300)
        let pick = LandingPick.first([("day", CGRect(x: 10, y: 600, width: 180, height: 35), list)])
        #expect(pick == nil)
    }
}

@Suite struct DropReadsTests {
    /// Drops' writes run in order, but a write that finished later with a lower count never lowers the floor.
    @Test func aWriteFinishedOutOfOrderNeverLetsAnOlderReadDraw() {
        var reads = DropReads()
        reads.previewDrawn()
        reads.previewDrawn()
        reads.written(readsStarted: 10)
        reads.written(readsStarted: 5)
        #expect(!reads.mayDraw(6))
        #expect(!reads.mayDraw(10))
        #expect(reads.mayDraw(11))
    }

    @Test func aWriteMoreThanPreviewsNeverGoesBelowNone() {
        var reads = DropReads()
        reads.written(readsStarted: 1)
        reads.previewDrawn()
        #expect(!reads.mayDraw(5))
        reads.written(readsStarted: 5)
        #expect(reads.mayDraw(6))
    }

    @Test func aReadBegunBeforeTheWriteNeverDrawsOverThePreview() {
        var reads = DropReads()
        #expect(reads.mayDraw(1))
        reads.previewDrawn()
        #expect(!reads.mayDraw(2))
        reads.written(readsStarted: 2)
        #expect(!reads.mayDraw(2))
        #expect(reads.mayDraw(3))
    }

    @Test func twoDropsLetReadsDrawOnlyOnceBothAreWritten() {
        var reads = DropReads()
        reads.previewDrawn()
        reads.previewDrawn()
        reads.written(readsStarted: 4)
        #expect(!reads.mayDraw(5))
        reads.written(readsStarted: 6)
        #expect(!reads.mayDraw(6))
        #expect(reads.mayDraw(7))
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
