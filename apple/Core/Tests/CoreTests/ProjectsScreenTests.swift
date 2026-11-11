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
        #expect(view.rows.filter(\.muted).map(\.title) == ["Где знакомиться", "Свидание", "Спорт", "No project", "Done"])
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
        // A card held over the folded row opens its branch, the choice staying.
        #expect(folded.rows.first { $0.title == "Окружение" }?.unfoldsOnHover == true)
        try board.unfoldProjectNode("project:Окружение")
        let opened = try board.projectsScreen()
        #expect(opened.rows.contains { $0.title == "Где знакомиться" })
        #expect(opened.selected == "project:Окружение")
    }

    @Test func byStageGivesTheStagesAndEachCardsSubproject() throws {
        let board = board(FakeVault(Self.file))
        try board.selectProjectNode("project:Окружение")
        try board.setProjectsMode("byStage")
        let view = try board.projectsScreen()
        #expect(view.mode == "byStage")
        #expect(view.sections.map(\.title) == ["Inbox", "Backlog", "Soon", "Today"])
        #expect(view.sections[0].cards.first?.over == "Свидание")
        #expect(view.sections[2].cards.first?.over == nil)
    }

    @Test func aCardDroppedOnTheTreeChangesThatProjectAndStaysInTheFunnel() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        try board.selectProjectNode("project:Окружение")
        let card = try #require(try board.projectsScreen().sections[1].cards.first)
        #expect(card.from == "Где знакомиться" && card.canDrop)
        try board.dropOnProject([card], to: "project:Small talk")
        #expect(vault.text.contains("## Backlog\n\n- [ ] Активности 🗂️ Small talk\n"))
    }

    /// A task of two parts is two cards, each with its own id and drop: let go on the tree, each replaces its own project.
    @Test func aTaskOfTwoPartsIsTwoCardsEachDroppedByItsOwnProject() throws {
        let file = Self.file.replacingOccurrences(of: "- [ ] Активности 🗂️ Где знакомиться", with: "- [ ] Активности 🗂️ Где знакомиться 🗂️ Свидание")
        let vault = FakeVault(file)
        let board = board(vault)
        try board.selectProjectNode("project:Окружение")
        let view = try board.projectsScreen()
        let cards = view.sections.flatMap(\.cards).filter { $0.item.title == "Активности" }
        #expect(cards.count == 2)
        #expect(Set(cards.map(\.id)).count == 2)
        let fromDate = try #require(cards.first { $0.from == "Свидание" })
        try board.dropOnProject([fromDate], to: "project:Small talk")
        #expect(vault.text.contains("- [ ] Активности 🗂️ Где знакомиться 🗂️ Small talk\n"))
        try board.selectProjectNode("project:Окружение")
        let again = try #require(try board.projectsScreen().sections.flatMap(\.cards).first { $0.item.title == "Активности" && $0.from == "Где знакомиться" })
        try board.dropOnProject([again], to: "none")
        #expect(vault.text.contains("- [ ] Активности 🗂️ Small talk\n"))
    }

    @Test func aClosedTaskCannotBeDropped() throws {
        let board = board(FakeVault(Self.file.replacingOccurrences(of: "- Спорт\n", with: "- Спорт\n- Архив\n").replacingOccurrences(of: "## Done\n", with: "## Done\n\n- [x] Old 🗂️ Архив\n")))
        try board.selectProjectNode("done")
        let closed = board.projectsScreenCards().first { $0.item.title == "Old" }
        #expect(closed?.canDrop == false)
    }

    @Test func aLiftedProjectKeepsItsDepthUntilTheFingerShiftsAStep() throws {
        let board = board(FakeVault(Self.file))
        let view = try board.projectsScreen()
        let measures = try board.projectsMeasures()
        #expect(measures.indent == 12 && measures.hoverMs == 600)
        // «Свидание» (depth 1) lifted and let go in its own gap, before «Дружба» (row 4).
        #expect(try board.projectsDrop(view.rowsJSON, gap: 4, shift: 0, lifted: "project:Свидание")?.depth == 1)
        #expect(try board.projectsDrop(view.rowsJSON, gap: 4, shift: -12, lifted: "project:Свидание")?.depth == 0)
        #expect(try board.projectsDrop(view.rowsJSON, gap: 4, shift: 5, lifted: "project:Свидание")?.depth == 1)
        #expect(board.isBlankProjectName("  "))
        #expect(!board.isBlankProjectName("Клубы"))
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

extension TaskBoard {
    /// Every card of the Projects screen as it reads now.
    func projectsScreenCards() -> [ProjectsCard] {
        (try? projectsScreen().sections.flatMap(\.cards)) ?? []
    }
}
