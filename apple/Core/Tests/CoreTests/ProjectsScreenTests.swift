import Foundation
import Testing
@testable import Core

/// The Projects screen as the app reads and drives it through the door: the tree, the chosen node's tasks By project and
/// By stage, the device's state kept, drops on the tree, the plus in the tree, rename and the note.
@Suite struct ProjectsScreenTests {
    static let file = [
        "## Inbox", "",
        "- [ ] Свидание: формат 🗂️ Свидание",
        "- [ ] Loose", "",
        "## Projects", "",
        "- Окружение",
        "  - Где знакомиться",
        "  - Свидание",
        "- Дружба [[Notes/Дружба]]",
        "  - Small talk",
        "- Спорт", "",
        "## Now", "",
        "## Soon", "",
        "- [ ] Брейншторм 🗂️ Окружение",
        "- [ ] Гугл 🗂️ Small talk", "",
        "## Backlog", "",
        "- [ ] Активности 🗂️ Где знакомиться",
        "- [ ] Бегать 🗂️ Спорт", "",
        "## Done", "",
    ].joined(separator: "\n")

    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func board(_ vault: FakeVault, kept: DeviceText = MemoryText()) -> TaskBoard {
        TaskBoard(core: core, vault: vault, projectsScreen: kept, clock: { Fixtures.date(7, 9) })
    }

    @Test func theTreeComesTopToBottomWithAllNoProjectAndDone() throws {
        let view = try board(FakeVault(Self.file)).projectsScreen()
        #expect(view.rows.map(\.title) == ["All", "Окружение", "Где знакомиться", "Свидание", "Дружба", "Small talk", "Спорт", "No project", "Done"])
        #expect(view.rows.map(\.depth) == [0, 0, 1, 1, 0, 1, 0, 0, 0])
        #expect(view.rows.filter(\.tile).map(\.title) == ["All", "Окружение", "Дружба", "Спорт", "No project", "Done"])
        #expect(view.rows.first { $0.title == "Спорт" }?.waiting == true)
        #expect(view.rows.first { $0.title == "Окружение" }?.waiting == false)
        #expect(view.selected == "all" && view.mode == "byProject")
        #expect(view.modes.map(\.label) == ["By project", "By stage"])
    }

    @Test func aTapChoosesANodeAndTheDeviceKeepsIt() throws {
        let kept = MemoryText()
        let board = board(FakeVault(Self.file), kept: kept)
        try board.tapProjectNode("project:Окружение")
        let view = try board.projectsScreen()
        #expect(view.selected == "project:Окружение" && view.title == "Окружение")
        #expect(view.sections.map(\.title) == [nil, "Где знакомиться", "Свидание"])
        #expect(view.sections.first?.cards.first?.stage?.kind == "soon")
        #expect(view.sections[1].cards.first?.stage?.kind == "backlog")
        #expect(view.menu?.project.name == "Окружение")
        #expect(kept.load()?.contains("Окружение") == true)
        // A second tap folds its branch.
        try board.tapProjectNode("project:Окружение")
        let folded = try board.projectsScreen()
        #expect(folded.rows.first { $0.title == "Окружение" }?.folded == true)
        #expect(!folded.rows.contains { $0.title == "Где знакомиться" })
    }

    @Test func byStageGivesTheStagesAndEachCardsSubproject() throws {
        let board = board(FakeVault(Self.file))
        try board.selectProjectNode("project:Окружение")
        try board.setProjectsMode("byStage")
        let view = try board.projectsScreen()
        #expect(view.mode == "byStage")
        #expect(view.sections.map(\.title) == ["Soon", "Inbox", "Backlog"])
        #expect(view.sections[1].cards.first?.over == "Свидание")
        #expect(view.sections[0].cards.first?.over == nil)
    }

    @Test func aCardDroppedOnTheTreeChangesThatProjectAndStaysInTheFunnel() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        try board.selectProjectNode("project:Окружение")
        let card = try #require(try board.projectsScreen().sections[1].cards.first)
        #expect(card.from == "Где знакомиться" && card.canDrop)
        try board.dropOnProject([card.item.key], from: card.from, to: "project:Small talk")
        #expect(vault.text.contains("## Backlog\n\n- [ ] Активности 🗂️ Small talk\n"))
    }

    @Test func thePlusInTheTreeMakesAProjectWhereTheGapSays() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let view = try board.projectsScreen()
        // Before «Дружба» (row 4), one deeper than «Свидание»: nested under «Окружение», last.
        let levels = try board.projectsLevels(view.rowsJSON, gap: 4)
        #expect(levels.min == 0 && levels.max == 2)
        let landing = try #require(try board.projectsGap(view.rowsJSON, gap: 4, depth: 1))
        #expect(landing.depth == 1)
        let made = try #require(try board.createProject("Клубы", at: landing.place))
        #expect(made.path == ["Окружение", "Клубы"])
        #expect(vault.text.contains("  - Свидание\n  - Клубы\n- Дружба"))
        #expect(try board.projectsScreen().selected == "project:Клубы")
        #expect(try board.createProject("клубы", at: landing.place) == nil)
    }

    @Test func aLiftedProjectMovesAndNests() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        let view = try board.projectsScreen()
        let landing = try #require(try board.projectsGap(view.rowsJSON, gap: 7, depth: 1, lifted: "project:Спорт"))
        try board.moveProject("Спорт", to: landing.place)
        #expect(vault.text.contains("  - Small talk\n  - Спорт\n"))
    }

    @Test func renameCarriesTheFieldsAndTheChoice() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        try board.selectProjectNode("project:Small talk")
        #expect(try board.renameProject("Small talk", to: "Разговоры"))
        #expect(vault.text.contains("- [ ] Гугл 🗂️ Разговоры"))
        #expect(try board.projectsScreen().selected == "project:Разговоры")
        #expect(try board.renameProject("Разговоры", to: "Спорт") == false)
    }

    @Test func theNoteOpensInObsidianAndDetachKeepsTheProject() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        try board.selectProjectNode("project:Дружба")
        let menu = try #require(try board.projectsScreen().menu)
        #expect(menu.note?.link == "Notes/Дружба" && menu.note?.name == "Дружба")
        #expect(menu.renameLabel == "Rename" && menu.detachLabel == "Detach")
        let url = try #require(try board.noteURL("Notes/Дружба", vault: "My Vault"))
        #expect(url.scheme == "obsidian" && url.absoluteString.contains("vault=My%20Vault"))
        try board.detachProjectNote("Дружба")
        #expect(vault.text.contains("- Дружба\n  - Small talk"))
    }

    @Test func allNoProjectAndDoneHaveNoMenuAndDoneTakesNoDrop() throws {
        let board = board(FakeVault(Self.file))
        let view = try board.projectsScreen()
        #expect(view.menu == nil)
        #expect(view.rows.first { $0.node == "done" }?.acceptsTask == false)
        #expect(view.rows.first { $0.node == "none" }?.acceptsTask == true)
        try board.selectProjectNode("none")
        let none = try board.projectsScreen()
        #expect(none.sections.flatMap(\.cards).map(\.item.title) == ["Loose"])
        #expect(none.menu == nil)
    }
}
