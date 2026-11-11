import Foundation
import Testing
@testable import Core

/// A task's projects through the menu's Project page, the New Task sheet, the full screen and search, as the app calls
/// them: the page holds the whole tree with checks, a pick toggles, «New project…» makes a project of the tree.
@Suite struct ProjectPageTests {
    static let day = "2030-01-07"
    static let file = [
        "## Inbox", "",
        "- [ ] Idea", "",
        "## Projects", "",
        "- Дружба",
        "  - Small talk",
        "- Health", "",
        "## Now", "",
        "## Soon", "",
        "- [ ] Run 🗂️ Health",
        "\t- [ ] Shoes",
        "- [ ] Chat 🗂️ Дружба 🗂️ Small talk", "",
        "## Backlog", "",
        "## Done", "",
    ].joined(separator: "\n")
    static let measures = TimelineMeasures(hour: 50, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)

    let core = try! PhoneCore(script: Fixtures.phoneScript)
    let at = Fixtures.date(7, 9)

    func board(_ vault: FakeVault) -> TaskBoard { TaskBoard(core: core, vault: vault, clock: { Fixtures.date(7, 9) }) }

    func snapshot(_ board: TaskBoard) throws -> BoardSnapshot {
        try board.snapshot(day: Self.day, measures: Self.measures, now: at)
    }

    func card(_ snapshot: BoardSnapshot, _ title: String) throws -> BoardCard {
        try #require(snapshot.lists.values.flatMap(\.cards).first { $0.item.title == title }, "no card \(title)")
    }

    @Test func thePageHoldsTheWholeTreeWithItsDepthsAndChecks() throws {
        let board = board(FakeVault(Self.file))
        let snapshot = try snapshot(board)
        // The menus are read over the settings alone, the tree handed in with the screen.
        let chat = try #require(snapshot.menus[try card(snapshot, "Chat").item.id]?.project)
        #expect(chat.options.map(\.project.name) == ["Дружба", "Small talk", "Health"])
        #expect(chat.options.map(\.depth) == [0, 1, 0])
        #expect(chat.options.map(\.checked) == [true, true, false])
        #expect(chat.value == "Дружба +1")
        #expect(!chat.none && chat.newLabel == "New project…")
        let idea = try #require(snapshot.menus[try card(snapshot, "Idea").item.id]?.project)
        #expect(idea.none && idea.value == "No project" && !idea.disabled)
    }

    @Test func aSubtasksRowIsItsParentsAndCantBePressed() throws {
        let board = board(FakeVault(Self.file))
        let snapshot = try snapshot(board)
        let run = try card(snapshot, "Run")
        let shoes = try #require(snapshot.lists.values.flatMap(\.cards).first { $0.item.title == "Shoes" })
        let menu = try #require(snapshot.menus[shoes.item.id]?.project)
        #expect(menu.disabled && menu.value == "Health")
        #expect(!shoes.item.can.setProject && run.item.can.setProject)
    }

    @Test func aPickTogglesTheProjectAndNoProjectTakesThemAllOff() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let idea = try card(snapshot(board), "Idea")
        try board.write("tasks.toggleProject", [[idea.item.key.json], "Small talk"])
        #expect(vault.text.contains("- [ ] Idea 🗂️ Small talk\n"))
        let chat = try card(snapshot(board), "Chat")
        try board.write("tasks.toggleProject", [[chat.item.key.json], "Дружба"])
        #expect(vault.text.contains("- [ ] Chat 🗂️ Small talk\n"))
        let again = try card(snapshot(board), "Chat")
        try board.write("tasks.setProject", [[again.item.key.json], .null])
        #expect(vault.text.contains("- [ ] Chat\n"))
        try board.write("history.undo")
        #expect(vault.text.contains("- [ ] Chat 🗂️ Small talk\n"))
    }

    @Test func newProjectMakesAProjectOfTheTreeAndChecksIt() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let idea = try card(snapshot(board), "Idea")
        let made: ProjectRef = try board.write("tasks.newProject", ["Garden", [idea.item.key.json]], as: ProjectRef.self)
        #expect(made.name == "Garden" && made.path == ["Garden"] && made.note == nil)
        #expect(vault.text.contains("- [ ] Idea 🗂️ Garden\n"))
        #expect(vault.text.contains("- Health\n- Garden\n"))
        // A taken name is that project: nothing new in the tree.
        let taken: ProjectRef = try board.write("tasks.newProject", ["health", [try card(snapshot(board), "Idea").item.key.json]], as: ProjectRef.self)
        #expect(taken.name == "Health")
        #expect(vault.text.components(separatedBy: "- Health\n").count == 2)
    }

    @Test func theNewTaskSheetsProjectRowEndsWithNewProject() throws {
        let board = board(FakeVault(Self.file))
        _ = try board.files()
        let none = try board.captureProject(nil)
        #expect(!none.lit && none.page.none && none.page.value == "No project")
        #expect(none.page.newLabel == "New project…")
        #expect(none.page.options.map(\.project.name) == ["Дружба", "Small talk", "Health"])
        let chosen = try board.captureProject("Health")
        #expect(chosen.lit && chosen.page.value == "Health")
    }

    @Test func theNewTaskSheetWritesItsProject() throws {
        let vault = FakeVault(TaskCaptureTests.file)
        let capture = TaskCapture(vault: vault, rules: core, now: { Fixtures.date(6, 14, 32) })
        #expect(capture.capture(list: Fixtures.list("inbox"), text: "Call Anna", recording: nil, project: "Health") == .saved)
        #expect(vault.text.contains("- [ ] Old\n- [ ] Call Anna 🗂️ Health\n"))
    }

    @Test func theFullScreenShowsTheProjectAndASubtaskItsParents() throws {
        let board = board(FakeVault(Self.file))
        let snapshot = try snapshot(board)
        let run = try card(snapshot, "Run").item
        let tree: FullTree = try board.readRule("tasks.fullTree", [run.json])
        #expect(tree.project?.name == "Health")
        let shoes = try #require(tree.rows.first?.item)
        let under: FullTree = try board.readRule("tasks.fullTree", [shoes.json])
        #expect(under.project?.name == "Health")
        let idea: FullTree = try board.readRule("tasks.fullTree", [try card(snapshot, "Idea").item.json])
        #expect(idea.project == nil)
    }

    @Test func theSearchFindsATaskByItsProjectsNameAndGivesItsPath() throws {
        let board = board(FakeVault(Self.file))
        let groups: [SearchGroup] = try board.read("tasks.search", ["дружба"], over: try board.files(now: at))
        let hit = try #require(groups.flatMap(\.hits).first)
        #expect(hit.item.title == "Chat")
        #expect(hit.projectPath == ["Дружба"])
        #expect(hit.project?.contains { $0.match } == true)
        let small: [SearchGroup] = try board.read("tasks.search", ["chat"], over: try board.files(now: at))
        #expect(small.flatMap(\.hits).first?.projectPath == ["Дружба"])
    }

    @Test func theCardsFolderMarkShowsOnTheMainScreen() throws {
        let snapshot = try snapshot(board(FakeVault(Self.file)))
        #expect(try card(snapshot, "Run").item.project?.mark == true)
        #expect(try card(snapshot, "Idea").item.project == nil)
    }
}
