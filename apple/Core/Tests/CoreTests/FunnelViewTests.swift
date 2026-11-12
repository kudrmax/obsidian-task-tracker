import Foundation
import Testing
@testable import Core

/// Projects as one view with the funnel, as the app drives it through the door: the panel's pick filters every list of the
/// screen, the cross clears it, the view button's modes are the core's, and a card let go on a row of the panel goes to
/// that project keeping its place.
@Suite struct FunnelViewTests {
    static let measures = ProjectFoldersTests.measures
    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func board(_ vault: FakeVault, kept: DeviceText = MemoryText()) -> TaskBoard {
        TaskBoard(core: core, vault: vault, projectsScreen: kept, clock: { Fixtures.date(7, 9) })
    }

    private func titles(_ snapshot: BoardSnapshot, _ column: BoardColumn) -> [String] {
        snapshot.lists[column]?.cards.map(\.item.title) ?? []
    }

    @Test func withNothingChosenThePhoneShowsColumnsAndTheWholeFunnel() throws {
        let board = board(FakeVault(ProjectsScreenTests.file))
        let view = try board.funnelView()
        #expect(view.filter == nil)
        #expect(view.view.mode == .twoColumns && view.view.wheel)
        #expect(view.view.modes.map(\.label) == ["Columns", "Rows"])
        #expect(view.panel?.open == false && view.panel?.docked == false)
        let snapshot = try board.snapshot(day: nil, measures: Self.measures)
        #expect(snapshot.filter == nil)
        #expect(titles(snapshot, .inbox).count == 2)
    }

    @Test func aPickFiltersEveryListClosesThePanelAndTheCrossClearsIt() throws {
        let board = board(FakeVault(ProjectsScreenTests.file))
        try board.setProjectsPanel(true)
        #expect(try board.funnelView().panel?.open == true)
        try board.pickProjectNode("project:Окружение")
        let view = try board.funnelView()
        #expect(view.filter?.node == "project:Окружение" && view.filter?.title == "Окружение" && view.filter?.clearable == true)
        #expect(view.filter?.project == "Окружение")
        #expect(view.panel?.open == false)
        #expect(view.panel?.rows.first { $0.selected }?.node == "project:Окружение")
        // Rows by default with a project, By project offered.
        #expect(view.view.mode == .rows && !view.view.wheel && view.view.rows == ["inbox", "backlog", "soon", "day"])
        #expect(view.view.modes.map(\.mode) == [.twoColumns, .rows, .byProject])
        let snapshot = try board.snapshot(day: nil, measures: Self.measures)
        #expect(snapshot.filter == "project:Окружение")
        #expect(titles(snapshot, .inbox) == ["Свидание: формат"])
        #expect(titles(snapshot, .soon) == ["Брейншторм"])
        #expect(titles(snapshot, .backlog) == ["Активности"])
        try board.clearProjectFilter()
        #expect(try board.funnelView().filter == nil)
        #expect(titles(try board.snapshot(day: nil, measures: Self.measures), .inbox).count == 2)
    }

    @Test func eachViewKeepsItsOwnMode() throws {
        let board = board(FakeVault(ProjectsScreenTests.file))
        try board.setViewMode(.rows)
        #expect(try board.funnelView().view.mode == .rows)
        try board.pickProjectNode("project:Дружба")
        try board.setViewMode(.byProject)
        #expect(try board.funnelView().view.mode == .byProject)
        try board.clearProjectFilter()
        #expect(try board.funnelView().view.mode == .rows)
    }

    @Test func byProjectReadsTheNodesOwnList() throws {
        let board = board(FakeVault(ProjectsScreenTests.file))
        let view = try board.projectsScreen(node: "project:Окружение")
        #expect(view.title == "Окружение")
        #expect(view.sections.map(\.title) == [nil, "Где знакомиться", "Свидание"])
    }

    @Test func aCardLetGoOnARowGoesToThatProjectKeepingItsPlace() throws {
        let vault = FakeVault(ProjectsScreenTests.file)
        let board = board(vault)
        let snapshot = try board.snapshot(day: nil, measures: Self.measures)
        let loose = try #require(snapshot.lists[.inbox]?.cards.first { $0.item.title == "Loose" })
        try board.dropTasksOnProject([loose.item.key], to: "project:Спорт", filter: nil)
        let inbox = try #require(vault.text.components(separatedBy: "## Inbox").last?.components(separatedBy: "## Projects").first)
        #expect(inbox.contains("- [ ] Loose 🗂️ Спорт"))
    }

    @Test func theSwipeWalksTheFunnelWithoutProjects() throws {
        let board = board(FakeVault(ProjectsScreenTests.file))
        #expect(try board.stepFunnel(mode: "inbox", date: "2026-11-07", shift: -1) == nil)
        #expect(try board.stepFunnel(mode: "inbox", date: "2026-11-07", shift: 1)?.mode == "soon")
        #expect(try board.stepFunnel(mode: "done", date: "2026-11-07", shift: 1)?.mode == "inbox")
    }
}

/// The core's follow-ups the app reads: the plates per list, the view before the first read, whether a filter hides a find.
@Suite struct FunnelViewFollowUpTests {
    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func board(_ vault: FakeVault) -> TaskBoard {
        TaskBoard(core: core, vault: vault, projectsScreen: MemoryText(), clock: { Fixtures.date(7, 9) })
    }

    @Test func platesAreTheCoresUnderAFilterAndInRows() throws {
        let board = board(FakeVault(ProjectsScreenTests.file))
        let plain = try board.funnelView().view
        #expect(plain.plate("inbox") == nil)
        #expect(plain.emptyLabel == "No tasks")
        try board.pickProjectNode("project:Спорт")
        #expect(try board.funnelView().view.plate("inbox") == "No tasks")
    }

    @Test func theFirstViewIsTheKeptOne() throws {
        let board = board(FakeVault(ProjectsScreenTests.file))
        #expect(try board.firstView().mode == .twoColumns)
        try board.pickProjectNode("project:Спорт")
        #expect(try board.firstView().mode == .rows)
    }

    @Test func aFindTheFilterHidesIsSaidSo() throws {
        let board = board(FakeVault(ProjectsScreenTests.file))
        let loose = try #require(try board.snapshot(day: nil, measures: FunnelViewTests.measures).lists[.inbox]?.cards.first { $0.item.title == "Loose" })
        try board.pickProjectNode("project:Спорт")
        #expect(try board.filterHides(loose.item, filter: "project:Спорт"))
        #expect(try !board.filterHides(loose.item, filter: nil))
    }

    @Test func aCarryLetGoNowhereAfterAHoverPutsTheFilterBack() throws {
        let board = board(FakeVault(ProjectsScreenTests.file))
        try board.pickProjectNode("project:Дружба")
        let card = try #require(try board.snapshot(day: nil, measures: FunnelViewTests.measures).lists[.soon]?.cards.first)
        try board.startCarry(keys: [card.item.key])
        let start = Date(timeIntervalSince1970: 1000)
        let wait = try #require(try board.carryAt(edge: true, node: nil, now: start))
        _ = try board.carryAt(edge: true, node: nil, now: start.addingTimeInterval(wait / 1000))
        #expect(try board.funnelView().panel?.reason == "carry")
        _ = try board.carryAt(edge: false, node: "project:Спорт", now: start.addingTimeInterval(1))
        _ = try board.carryAt(edge: false, node: "project:Спорт", now: start.addingTimeInterval(2))
        #expect(try board.funnelView().filter?.node == "project:Спорт")
        try board.endCarry("nowhere")
        let after = try board.funnelView()
        #expect(after.filter?.node == "project:Дружба")
        #expect(after.panel?.open == false)
    }

    @Test func everyCarriedTaskGoesToTheRowUnderTheLiftsFilter() throws {
        let vault = FakeVault(ProjectsScreenTests.file)
        let board = board(vault)
        let inbox = try #require(try board.snapshot(day: nil, measures: FunnelViewTests.measures).lists[.inbox]?.cards)
        try board.startCarry(keys: inbox.map(\.item.key))
        try board.carryOnNode("project:Спорт")
        #expect(vault.text.contains("- [ ] Loose 🗂️ Спорт"))
        #expect(vault.text.components(separatedBy: "🗂️ Спорт").count - 1 >= 3)
    }

    @Test func aDropEndsSelectTasksWhateverItsPathAndAViewSaysWhatThePlusDoes() throws {
        let board = board(FakeVault(ProjectsScreenTests.file))
        #expect(board.endsSelection("dropped"))
        #expect(!board.endsSelection("nowhere"))
        #expect(!board.endsSelection("naming"))
        #expect(try board.funnelView().plus.tap == "newTask")
        try board.pickProjectNode("project:Окружение")
        try board.setViewMode(.byProject)
        let view = try board.funnelView()
        #expect(view.plus.tap == "inPlace" && view.plus.list == "projects")
        #expect(view.view.source == "projectsScreen")
        try board.setProjectsPanel(true)
        #expect(try board.funnelView().panel?.dimCloses == true)
    }

    @Test func theKeptPlaceIsTheCores() throws {
        let board = board(FakeVault(ProjectsScreenTests.file))
        #expect(try board.firstPlace() == "calendar")
        try board.setFunnelPlace(.number(-1))
        #expect(try board.firstPlace() == "inbox")
        try board.setFunnelPlace("soon")
        #expect(try board.firstPlace() == "soon")
    }

}
