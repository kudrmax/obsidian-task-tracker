import Foundation
import Testing
@testable import Core

/// The Projects list as the app reads and drives it through the door: the tree, the chosen node's tasks by project, the
/// device's state kept, drops on the tree, the plus in the tree, rename and the note.
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

    /// A card (or the plus) held over `node`'s row of the shown panel for the core's pause, then let go elsewhere.
    func hoverRow(_ board: TaskBoard, _ node: String, plus: Bool = false) throws {
        try board.setProjectsPanel(true)
        try board.startCarry(keys: [], plus: plus, wide: true)
        let start = Date(timeIntervalSince1970: 1_000)
        _ = try board.carryAt(edge: false, node: node, now: start)
        _ = try board.carryAt(edge: false, node: node, now: start.addingTimeInterval(1))
        try board.endCarry("dropped")
        try board.setProjectsPanel(false)
    }

    func board(_ vault: FakeVault, kept: DeviceText = MemoryText()) -> TaskBoard {
        TaskBoard(core: core, vault: vault, projectsScreen: kept, clock: { Fixtures.date(7, 9) })
    }

    @Test func theTreeComesTopToBottomWithAllNoProjectAndDone() throws {
        let view = try board(FakeVault(Self.file)).projectsScreen()
        #expect(view.rows.map(\.title) == ["All", "Окружение", "Где знакомиться", "Свидание", "Дружба", "Small talk", "Спорт", "No project", "Done"])
        #expect(view.rows.map(\.depth) == [0, 0, 1, 1, 0, 1, 0, 0, 0])
        #expect(view.rows.filter(\.tile).map(\.title) == ["All", "Окружение", "Дружба", "Спорт", "No project", "Done"])
        // Grey only a branch with no open task at all: «Спорт»'s Backlog task draws it in full colour.
        #expect(view.rows.first { $0.title == "Спорт" }?.waiting == false)
        #expect(view.rows.filter(\.muted).map(\.title) == ["No project", "Done"])
        #expect(view.rows.first { $0.title == "Окружение" }?.waiting == false)
        #expect(view.selected == "all")
    }

    @Test func aTapChoosesANodeAndTheDeviceKeepsIt() throws {
        let kept = MemoryText()
        let board = board(FakeVault(Self.file), kept: kept)
        try board.pickProjectNode("project:Окружение", wide: true)
        let view = try board.projectsScreen()
        #expect(view.selected == "project:Окружение" && view.title == "Окружение")
        #expect(view.sections.map(\.title) == [nil, "Где знакомиться", "Свидание"])
        #expect(view.sections.first?.cards.first?.stage?.kind == "soon")
        #expect(view.sections[1].cards.first?.stage?.kind == "backlog")
        #expect(view.menu?.project.name == "Окружение")
        #expect(kept.load()?.contains("Окружение") == true)
        // A second tap folds its branch.
        try board.pickProjectNode("project:Окружение", wide: true)
        let folded = try board.projectsScreen()
        #expect(folded.rows.first { $0.title == "Окружение" }?.folded == true)
        #expect(!folded.rows.contains { $0.title == "Где знакомиться" })
        // The plus held over the folded row opens its branch, the choice staying.
        #expect(folded.rows.first { $0.title == "Окружение" }?.unfoldsOnHover == true)
        try hoverRow(board, "project:Окружение", plus: true)
        let opened = try board.projectsScreen()
        #expect(opened.rows.contains { $0.title == "Где знакомиться" })
        #expect(opened.selected == "project:Окружение")
    }

    /// A held card opens a live project and No project, never All, Done, a done project or the chosen row.
    @Test func aRowOpensUnderAHeldCardByTheCore() throws {
        let file = Self.file.replacingOccurrences(of: "- Спорт\n", with: "- Спорт\n- Архив\n").replacingOccurrences(of: "## Done\n", with: "## Done\n\n- [x] Old 🗂️ Архив\n")
        let board = board(FakeVault(file))
        try board.selectProjectNode("project:Окружение")
        let rows = try board.projectsScreen().rows
        let opens = Dictionary(uniqueKeysWithValues: rows.map { ($0.node, $0.opensOnHover) })
        #expect(opens["all"] == false && opens["done"] == false)
        #expect(opens["project:Окружение"] == false)
        #expect(opens["project:Дружба"] == true && opens["project:Спорт"] == true && opens["none"] == true)
    }

    /// The core's pause (`tasks.carryAt`): the folded row over which a card is held unfolds and is chosen.
    @Test func aHeldCardUnfoldsAndChoosesTheRowThroughTheDoor() throws {
        let kept = MemoryText()
        let board = board(FakeVault(Self.file), kept: kept)
        try board.pickProjectNode("project:Дружба", wide: true)
        try board.pickProjectNode("project:Дружба", wide: true)
        try board.selectProjectNode("project:Окружение")
        let before = try board.projectsScreen()
        let row = try #require(before.rows.first { $0.node == "project:Дружба" })
        #expect(row.folded && row.unfoldsOnHover && row.opensOnHover)
        try hoverRow(board, "project:Дружба")
        let after = try board.projectsScreen()
        #expect(after.selected == "project:Дружба")
        #expect(after.rows.contains { $0.title == "Small talk" })
        #expect(kept.load()?.contains("Дружба") == true)
    }

    /// The card's drop carries what the core filled at the lift (`lifted`), and goes back to the door as it came.
    @Test func aCardsDropKeepsWhatTheCoreFilledAtTheLift() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        try board.selectProjectNode("project:Окружение")
        let card = try #require(try board.projectsScreen().sections[1].cards.first)
        guard case .object(let drop) = card.drop, case .object(let lifted)? = drop["lifted"] else {
            Issue.record("no lifted in \(card.drop)"); return
        }
        #expect(lifted["id"] == .string(card.item.id))
        try hoverRow(board, "project:Дружба")
        try board.dropOnProject([card], to: "project:Small talk")
        #expect(vault.text.contains("- [ ] Активности 🗂️ Small talk\n"))
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

    /// By project the node's own part, empty above subprojects, draws nothing; a subproject with no task shows its plate.
    @Test func byProjectAnEmptyOwnPartDrawsNothingAndAnEmptySubprojectItsPlate() throws {
        let board = board(FakeVault(Self.file.replacingOccurrences(of: "  - Small talk\n", with: "  - Small talk\n  - Тихо\n")))
        try board.selectProjectNode("project:Дружба")
        let view = try board.projectsScreen()
        #expect(view.sections.map(\.title) == [nil, "Small talk", "Тихо"])
        let own = view.sections[0]
        #expect(own.group == nil && !own.header && own.empty && !own.plate)
        #expect(view.sections[1].header && !view.sections[1].empty && !view.sections[1].plate)
        #expect(!view.sections[1].opens)
        #expect(view.sections[2].header && view.sections[2].empty && view.sections[2].plate)
    }

    /// A project with no task at all is one part, untitled, with the No tasks plate: never a blank pane.
    @Test func aProjectWithNoTaskShowsTheNoTasksPlate() throws {
        let board = board(FakeVault(Self.file.replacingOccurrences(of: "- Спорт\n", with: "- Спорт\n- Пусто\n")))
        try board.selectProjectNode("project:Пусто")
        let view = try board.projectsScreen()
        #expect(view.sections.count == 1)
        let only = try #require(view.sections.first)
        #expect(!only.header && only.empty && only.plate && only.cards.isEmpty)
        #expect(view.emptyLabel == "No tasks")
    }

    @Test func doneTakesNoReorder() throws {
        let board = board(FakeVault(Self.file))
        try board.selectProjectNode("done")
        #expect(try board.projectsScreen().reorders == false)
    }

    /// Delete project asks with the core's words, then the project goes from the tree and from every task; no task goes.
    @Test func deleteProjectAsksFirstAndKeepsEveryTask() throws {
        let vault = FakeVault(Self.file)
        let board = board(vault)
        try board.selectProjectNode("project:Окружение")
        let delete = try #require(try board.projectsScreen().menu?.delete)
        #expect(delete.label == "Delete project")
        #expect(delete.title == "Delete \u{201C}Окружение\u{201D}?")
        #expect(delete.message == "Its tasks stay; they just lose this project.")
        #expect(delete.confirm == "Delete" && delete.cancel == "Cancel" && delete.destructive)
        let before = vault.text.components(separatedBy: "- [ ]").count
        try board.deleteProject("Окружение")
        #expect(vault.text.contains("## Projects\n\n- Где знакомиться\n- Свидание\n- Дружба"))
        #expect(vault.text.contains("- [ ] Брейншторм\n"))
        #expect(!vault.text.contains("🗂️ Окружение"))
        #expect(vault.text.components(separatedBy: "- [ ]").count == before)
        #expect(try board.projectsScreen().selected == "all")
    }
}

extension TaskBoard {
    /// Every card of the Projects screen as it reads now.
    func projectsScreenCards() -> [ProjectsCard] {
        (try? projectsScreen().sections.flatMap(\.cards)) ?? []
    }
}
