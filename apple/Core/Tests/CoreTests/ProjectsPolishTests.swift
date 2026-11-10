import Foundation
import Testing
@testable import Core

/// The vault's notes as `FakeVault` holds them: a note the app writes is found by the next scan, as in the real vault.
final class FolderOfVault: NoteFolder, @unchecked Sendable {
    let vault: FakeVault
    init(_ vault: FakeVault) { self.vault = vault }

    func scanNotes(wanted: (String, Date) -> Bool) throws -> [ScannedNote] {
        vault.vaultFiles().filter { $0.path.hasSuffix(".md") }.map { file in
            ScannedNote(path: file.path, modified: file.modified, text: wanted(file.path, file.modified) ? vault.files[file.path] : nil)
        }
    }
}

/// Projects polish (`docs/superpowers/specs/2026-11-10-projects-polish-design.md`): New project…, the New Task sheet's
/// Project, the full screen's project line, through the door in JavaScriptCore.
@Suite struct ProjectsPolishTests {
    static let file = [
        "## Inbox", "", "- [ ] Idea", "",
        "## Now", "", "",
        "## Soon", "", "- [ ] Run 🗂️ [[Health]]", "\t- [ ] Shoes", "",
        "## Backlog", "", "## Done", "",
    ].joined(separator: "\n")

    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func board(_ vault: FakeVault) -> TaskBoard {
        TaskBoard(core: core, vault: vault, projects: VaultProjects(folder: FolderOfVault(vault), core: core, background: false), clock: { Fixtures.date(6, 10) })
    }

    func vault() -> FakeVault {
        let vault = FakeVault(Self.file)
        vault.files = ["Health.md": "Run more. #project", "Garden.md": "---\naliases: [plot]\n---\nTomatoes."]
        return vault
    }

    func card(_ board: TaskBoard, _ title: String) throws -> BoardCard {
        let snapshot = try board.snapshot(day: "2026-11-06", measures: IdentityTests.measures, now: Fixtures.date(6, 10))
        return try #require(snapshot.lists.values.flatMap(\.cards).first { $0.item.title == title })
    }

    @Test func aNewProjectIsANoteAtTheVaultsRootWithTheTagAndIsOfferedAtOnce() throws {
        let vault = vault()
        let board = board(vault)
        _ = try board.files()
        #expect(try board.newProject("  Свой дом ") == "Свой дом")
        #expect(vault.files["Свой дом.md"] == "---\ntags:\n  - project\n---\n")
        let page = try board.captureProject("Свой дом")
        #expect(page.lit && page.page.value == "Свой дом")
        #expect(page.page.options.map(\.project.name) == ["Health", "Свой дом"])
    }

    @Test func aNoteOfThatNameGetsTheTagInItsPropertiesAndTheRestStays() throws {
        let vault = vault()
        let board = board(vault)
        #expect(try board.newProject("garden") == "Garden")
        #expect(vault.files["Garden.md"] == "---\naliases: [plot]\ntags:\n  - project\n---\nTomatoes.")
        #expect(vault.files.count == 2)
    }

    @Test func aNameOfNothingWritesNothing() throws {
        let vault = vault()
        #expect(try board(vault).newProject(" [] ") == nil)
        #expect(vault.files.count == 2 && vault.edits.isEmpty)
    }

    @Test func aProjectThatHasTheTagIsNotWrittenAgain() throws {
        let vault = vault()
        #expect(try board(vault).newProject("Health") == "Health")
        #expect(vault.edits.isEmpty)
    }

    @Test func theNewTaskSheetsProjectRowEndsWithNewProject() throws {
        let board = board(vault())
        let none = try board.captureProject(nil)
        #expect(!none.lit && none.page.none && none.page.value == "No project")
        #expect(none.page.newLabel == "New project…")
        #expect(none.page.options.map(\.project.name) == ["Health"])
    }

    @Test func theNewTaskSheetWritesItsProject() throws {
        let vault = FakeVault(TaskCaptureTests.file)
        let capture = TaskCapture(vault: vault, rules: core, now: { Fixtures.date(6, 14, 32) })
        #expect(capture.capture(list: Fixtures.list("inbox"), text: "Call Anna", recording: nil, project: "Health") == .saved)
        #expect(vault.text.contains("- [ ] Old\n- [ ] Call Anna 🗂️ [[Health]]\n"))
    }

    @Test func theFullScreenShowsTheProjectAndASubtaskItsParents() throws {
        let board = board(vault())
        _ = try board.files()
        let run = try card(board, "Run").item
        let tree: FullTree = try board.readRule("tasks.fullTree", [run.json])
        #expect(tree.project?.name == "Health" && tree.project?.link == "Health")
        let shoes = try #require(tree.rows.first?.item)
        let under: FullTree = try board.readRule("tasks.fullTree", [shoes.json])
        #expect(under.project?.link == "Health")
        let idea: FullTree = try board.readRule("tasks.fullTree", [try card(board, "Idea").item.json])
        #expect(idea.project == nil)
    }
}
