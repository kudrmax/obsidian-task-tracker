import Foundation
import Testing
@testable import Core

/// The core's view as the app decides by it: one mode for every filter, each mode its own body, a read in another filter
/// or mode drawn still, and the rows' heights measured from the rows, the core sharing the room.
@Suite struct FunnelPresentationTests {
    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func board(_ vault: FakeVault = FakeVault(ProjectsScreenTests.file)) -> TaskBoard {
        TaskBoard(core: core, vault: vault, projectsScreen: MemoryText(), clock: { Fixtures.date(7, 9) })
    }

    func presentation(_ board: TaskBoard) throws -> FunnelPresentation {
        FunnelPresentation(try board.funnelView())
    }

    @Test func eachModeHasItsOwnBody() throws {
        let board = board()
        let columns = try presentation(board)
        #expect(columns.body == .ribbon && columns.swipes && columns.wheel && columns.isRibbon)
        #expect(columns.source == .screen && columns.plusTap == .newTask)
        try board.setViewMode(.rows)
        let rows = try presentation(board)
        #expect(rows.body == .rows(lists: [.inbox, .backlog, .soon, .day], scrolls: true))
        #expect(!rows.swipes && !rows.wheel && rows.divider && !rows.isRibbon)
        try board.setViewMode(.byProject)
        let byProject = try presentation(board)
        #expect(byProject.body == .byProject && !byProject.swipes)
        // All is no filter: By project reads every task.
        #expect(byProject.source == .projects(node: nil))
        #expect(byProject.projectsNode == .some(nil))
        #expect(columns.projectsNode == nil)
    }

    /// Max, 2026-11-12: the mode is one choice; a pick or a clear never changes it.
    @Test func aPickKeepsTheModeAndIsAnotherContext() throws {
        let board = board()
        try board.setViewMode(.rows)
        let plain = try presentation(board)
        try board.pickProjectNode("project:Окружение")
        let picked = try presentation(board)
        #expect(picked.mode == .rows && picked.chosen == .rows)
        #expect(picked.context != plain.context)
        try board.setProjectsPanel(true)
        let panel = try presentation(board)
        #expect(panel.panelShown)
        // The panel opened is the same context: nothing is drawn still for it.
        #expect(panel.context == picked.context)
        try board.setProjectsPanel(false)
        try board.setViewMode(.byProject)
        let byProject = try presentation(board)
        #expect(byProject.source == .projects(node: "project:Окружение"))
        #expect(byProject.plusTap == .inPlace && byProject.plusList == .projects)
        #expect(byProject.context != panel.context)
        try board.pickProjectNode("all")
        #expect(try board.funnelView().filter == nil)
        #expect(try presentation(board).chosen == .byProject)
    }

    @Test func anotherContextIsDrawnStill() throws {
        let board = board()
        let before = try board.snapshot(day: nil, measures: FunnelViewTests.measures)
        try board.setViewMode(.rows)
        let after = try board.snapshot(day: nil, measures: FunnelViewTests.measures)
        #expect(after.motion(from: before) == .context)
        #expect(after.motion(from: after) == .still)
        // The view alone changed: the same lists under the new view, no file read again.
        let swapped = before.with(funnel: try board.funnelView())
        #expect(swapped.lists == before.lists && swapped.funnel.view.mode == .rows)
        #expect(swapped.motion(from: before) == .context)
    }

    /// A pick closes the panel at once; its filter is drawn with the lists read for it, never over the old ones.
    @Test func aPicksPanelGoesBeforeItsFilter() throws {
        let board = board()
        try board.setProjectsPanel(true)
        let open = try board.funnelView()
        try board.pickProjectNode("project:Окружение")
        let picked = try board.funnelView()
        let closing = open.with(panelOf: picked)
        #expect(closing.panel?.open == false && closing.filter == nil)
        #expect(closing.view.context == open.view.context)
    }

    @Test func aListIsMeasuredFromItsRows() {
        let measured = StackedList.measuring(head: 30, rows: [
            .init(height: 22, top: 0, card: false),
            .init(height: 35, top: 0, card: true),
            .init(height: 35, top: 2, card: true),
        ])
        #expect(measured == StackedList(wanted: 124, stops: [87, 124]))
        #expect(StackedList.measuring(head: 30, rows: []) == StackedList(wanted: 30, stops: []))
    }

    @Test func theRowsShareTheRoomAsTheCoreSays() throws {
        let board = board()
        let lists = [StackedList(wanted: 380, stops: [90, 160, 230, 300, 370]), StackedList(wanted: 90, stops: [])]
        #expect(try board.stackedLists(lists, room: 300, fade: 20) == [180, 90])
        #expect(try board.stackedLists(lists, room: 1000, fade: 20) == [380, 90])
    }
}

/// The carry to a project as the app drives it: calls in order, the finger told only when it moves elsewhere, told again
/// once the core's pause is over, and the session's end said once.
@MainActor
@Suite struct CarrySessionTests {
    final class Calls: CarryCalls, @unchecked Sendable {
        private let lock = NSLock()
        private var made: [String] = []
        var wait: Double? = 300

        var log: [String] { lock.withLock { made } }

        private func note(_ call: String) { lock.withLock { made.append(call) } }

        func startCarry(keys: [TaskKey], cards: [JSONValue], plus: Bool, wide: Bool) throws { note(plus ? "start plus" : "start \(keys.count)") }
        func carryAt(edge: Bool, node: String?, now: Date) throws -> Double? {
            note("at \(edge) \(node ?? "-") \(Int(now.timeIntervalSince1970))")
            return lock.withLock { wait }
        }
        func carryOnNode(_ node: String) throws { note("on \(node)") }
        func endCarry(_ how: String) throws { note("end \(how)") }
        func endProjectName() throws { note("name ended") }
    }

    final class Clock: CarryClock {
        var at = Date(timeIntervalSince1970: 1000)
        private var waiting: [Int: @MainActor () -> Void] = [:]
        private var made = 0

        var pending: Int { waiting.count }

        func now() -> Date { at }

        func after(ms: Double, _ work: @escaping @MainActor () -> Void) -> () -> Void {
            made += 1
            let id = made
            waiting[id] = work
            return { [weak self] in self?.waiting[id] = nil }
        }

        /// The pauses still waiting run, as their time comes.
        func pass() {
            let due = waiting.values
            waiting = [:]
            at = at.addingTimeInterval(1)
            for work in due { work() }
        }
    }

    final class Redraws {
        var count = 0
    }

    func session(_ calls: Calls, _ clock: Clock, _ redraws: Redraws) -> CarrySession {
        CarrySession(calls: calls, clock: clock, redraw: { redraws.count += 1 }, problem: { _ in })
    }

    @Test func theFingerIsToldOnlyWhereItMovesAndAgainAfterThePause() async {
        let calls = Calls(), clock = Clock(), redraws = Redraws()
        let carry = session(calls, clock, redraws)
        carry.start(keys: [])
        carry.moved(to: .init(edge: true, node: nil))
        carry.moved(to: .init(edge: true, node: nil))
        await carry.idle()
        #expect(calls.log == ["start 0", "at true - 1000"])
        #expect(clock.pending == 1)
        clock.pass()
        await carry.idle()
        #expect(calls.log == ["start 0", "at true - 1000", "at true - 1001"])
        // The pause over brought the panel out: the screen is read again.
        #expect(redraws.count == 1)
    }

    @Test func movingElsewhereCallsThePauseOff() async {
        let calls = Calls(), clock = Clock(), redraws = Redraws()
        let carry = session(calls, clock, redraws)
        carry.start(keys: [])
        carry.moved(to: .init(edge: true, node: nil))
        await carry.idle()
        carry.moved(to: .init(edge: false, node: "project:A"))
        await carry.idle()
        clock.pass()
        await carry.idle()
        #expect(calls.log.filter { $0.hasPrefix("at true") }.count == 1)
        #expect(calls.log.last == "at false project:A 1001")
    }

    @Test func theEndIsSaidOnceAfterEveryCall() async {
        let calls = Calls(), clock = Clock(), redraws = Redraws()
        let carry = session(calls, clock, redraws)
        carry.start(keys: [], plus: true)
        carry.moved(to: .init(edge: true, node: nil))
        carry.wentNowhere()
        #expect(carry.close() == .nowhere)
        #expect(carry.close() == nil)
        await carry.idle()
        #expect(calls.log == ["start plus", "at true - 1000", "end nowhere"])
        #expect(redraws.count == 1)
        // A pause that comes due after the end tells nothing.
        clock.pass()
        await carry.idle()
        #expect(calls.log.count == 3)
    }

    @Test func aDropOnARowEndsTheSessionItself() async {
        let calls = Calls(), clock = Clock(), redraws = Redraws()
        let carry = session(calls, clock, redraws)
        carry.start(keys: [])
        carry.onNode("project:A")
        #expect(carry.close() == .closed)
        await carry.idle()
        #expect(calls.log == ["start 0", "on project:A"])
        let dropped = session(calls, clock, redraws)
        dropped.start(keys: [])
        #expect(dropped.close() == .dropped)
        await dropped.idle()
        #expect(calls.log.last == "end dropped")
    }
}
