import Foundation
import Testing
@testable import Core

/// Folders as the app reads and drives them through the door (Max, 2026-11-11: a folder only holds subprojects, no task
/// can be put straight into it): the project menu's Folder switch, the Project page's folder option, the tree's row and
/// the folder's own part, all the core's answers.
@Suite struct ProjectFoldersTests {
    static let day = "2026-11-11"
    static let file = [
        "## Inbox", "",
        "- [ ] Отчёт за октябрь 🗂️ Отчёты",
        "- [ ] Без проекта", "",
        "## Projects", "",
        "- Работа 🗃️",
        "\t- Отчёты",
        "\t- Найм",
        "- Дружба", "",
        "## Now", "",
        "## Soon", "",
        "- [ ] Позвонить 🗂️ Дружба", "",
        "## Backlog", "",
        "- [ ] Резюме 🗂️ Найм", "",
        "## Done", "",
    ].joined(separator: "\n")
    static let measures = TimelineMeasures(hour: 50, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)

    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func board(_ vault: FakeVault) -> TaskBoard {
        TaskBoard(core: core, vault: vault, projectsScreen: MemoryText(), clock: { Fixtures.date(7, 9) })
    }

    func chosen(_ node: String, _ file: String = Self.file) throws -> ProjectsView {
        let board = board(FakeVault(file))
        try board.selectProjectNode(node)
        return try board.projectsScreen()
    }

    @Test func theSwitchIsOnForAFolderAndDisabledWithTheReasonForAProjectWithTasksOfItsOwn() throws {
        let folder = try #require(try chosen("project:Работа").menu?.folder)
        #expect(folder.label == "Folder" && folder.on && !folder.disabled && folder.reason == nil)
        let busy = try #require(try chosen("project:Дружба").menu?.folder)
        #expect(!busy.on && busy.disabled && busy.reason == "Has tasks of its own")
    }

    @Test func theSwitchWritesTheMarkAndIsRefusedWhileTheProjectHasTasksOfItsOwn() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        #expect(try board.setProjectFolder("Работа", false))
        #expect(vault.text.contains("## Projects\n\n- Работа\n\t- Отчёты\n"))
        #expect(try board.setProjectFolder("Работа", true))
        #expect(vault.text.contains("- Работа 🗃️\n"))
        let before = vault.text
        #expect(try !board.setProjectFolder("Дружба", true))
        #expect(vault.text == before)
    }

    @Test func theProjectPageShowsTheFolderButCantPickIt() throws {
        let board = board(FakeVault(Self.file))
        let snapshot = try board.snapshot(day: Self.day, measures: Self.measures, now: Fixtures.date(7, 9))
        let card = try #require(snapshot.lists.values.flatMap(\.cards).first { $0.item.title == "Без проекта" })
        let page = try #require(snapshot.menus[card.item.id]?.project)
        #expect(page.options.map(\.project.name) == ["Работа", "Отчёты", "Найм", "Дружба"])
        #expect(page.options.map(\.disabled) == [true, false, false, false])
        #expect(page.options.map(\.project.folder) == [true, false, false, false])
    }

    @Test func theFoldersRowTakesNoCardAndItsListNoPlus() throws {
        let view = try chosen("project:Работа")
        #expect(view.rows.first { $0.title == "Работа" }?.acceptsTask == false)
        #expect(view.rows.first { $0.title == "Отчёты" }?.acceptsTask == true)
        #expect(view.newTask == nil)
        // The empty own part is left out: the first subproject's part is the list's top, with its own plus.
        #expect(view.sections.map(\.title) == ["Отчёты", "Найм"])
        #expect(view.sections.allSatisfy { $0.takes && $0.newTask?.project != "Работа" })
    }

    @Test func aTaskGivenTheFolderByHandShowsInItsOwnPartWhichTakesNothing() throws {
        let file = Self.file.replacingOccurrences(of: "- [ ] Без проекта", with: "- [ ] Без проекта 🗂️ Работа")
        let view = try chosen("project:Работа", file)
        let own = try #require(view.sections.first { $0.title == nil })
        #expect(own.cards.map(\.item.title) == ["Без проекта"])
        #expect(!own.takes && own.newTask == nil && !own.plate)
    }

    /// What the plus reads: a tap opens New Task only where the list has a `newTask`, a let-go in a part only where that
    /// part has one, never the list's in its stead.
    @Test func thePlusHasNothingToWriteInAFolderOrDone() throws {
        let board = board(FakeVault(Self.file))
        try board.selectProjectNode("project:Работа")
        try board.setProjectsMode("byStage")
        let stages = try board.projectsScreen()
        #expect(stages.newTask == nil)
        #expect(stages.sections.allSatisfy { $0.newTask == nil })
        try board.selectProjectNode("done")
        #expect(try board.projectsScreen().newTask == nil)
        try board.selectProjectNode("project:Дружба")
        #expect(try board.projectsScreen().newTask?.project == "Дружба")
    }
}
