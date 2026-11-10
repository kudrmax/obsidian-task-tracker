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

/// A vault whose scan takes `delay`: a first scan of thousands of notes with no tags kept.
final class SlowFolder: NoteFolder, @unchecked Sendable {
    let inner: NoteFolder
    let delay: TimeInterval
    init(_ inner: NoteFolder, delay: TimeInterval) {
        self.inner = inner
        self.delay = delay
    }

    func scanNotes(wanted: (String, Date) -> Bool) throws -> [ScannedNote] {
        Thread.sleep(forTimeInterval: delay)
        return try inner.scanNotes(wanted: wanted)
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

    /// The coordinator, 11-10: a New project… on a vault of thousands of notes waited ~10 s for the scan. The note written
    /// is offered at once, whether or not a scan has found it yet.
    @Test func aNewProjectIsOfferedBeforeAnyScanFindsIt() throws {
        let vault = vault()
        let folder = FakeFolder(["Health.md": "Run more. #project"])
        let board = TaskBoard(core: core, vault: vault, projects: VaultProjects(folder: folder, core: core, background: false), clock: { Fixtures.date(6, 10) })
        _ = try board.files()
        #expect(try board.newProject("Shed") == "Shed")
        #expect(try board.captureProject("Shed").page.options.map(\.project.name) == ["Health", "Shed"])
        folder.notes["Shed.md"] = (text: "---\ntags:\n  - project\n---\n", modified: Date(timeIntervalSince1970: 2))
        _ = try board.files(now: Fixtures.date(6, 11))
        #expect(try board.captureProject(nil).page.options.map(\.project.name) == ["Health", "Shed"])
    }

    /// The app's own case: the scan runs in the background and takes seconds. New project… waits for none of it.
    @Test func aNewProjectWaitsForNoScan() throws {
        let vault = vault()
        let projects = VaultProjects(folder: SlowFolder(FolderOfVault(vault), delay: 2), core: try PhoneCore(script: Fixtures.phoneScript))
        let board = TaskBoard(core: core, vault: vault, projects: projects, clock: { Fixtures.date(6, 10) })
        _ = try board.files()
        let start = Date()
        #expect(try board.newProject("Shed") == "Shed")
        let page = try board.captureProject("Shed")
        #expect(Date().timeIntervalSince(start) < 0.5)
        #expect(page.lit && page.page.options.map(\.project.name).contains("Shed"))
    }

    @Test func aNoteOfThatNameGetsTheTagInItsPropertiesAndTheRestStays() throws {
        let vault = vault()
        let board = board(vault)
        #expect(try board.newProject("garden") == "Garden")
        #expect(vault.files["Garden.md"] == "---\naliases: [plot]\ntags:\n  - project\n---\nTomatoes.")
        #expect(vault.files.count == 2)
    }

    /// Review 11-10: a note that is there but can't be read (iCloud bringing it, Sync writing it) was taken for a new one
    /// and written over with bare properties.
    @Test func aNoteThatCantBeReadIsNeverWrittenOver() throws {
        let vault = UnreadableVault(Self.file)
        vault.files = ["Garden.md": "Tomatoes."]
        vault.unreadable = ["Garden.md"]
        #expect(throws: VaultError.unreadable("Garden.md")) { try board(vault).newProject("Garden") }
        #expect(vault.files["Garden.md"] == "Tomatoes." && vault.edits.isEmpty)
    }

    /// Review 11-10: a note that came by Sync after the vault was last listed is that note, given the tag; never a new
    /// note written over it.
    @Test func aNoteThatCameSinceTheLastListingIsTaggedNotReplaced() throws {
        let vault = vault()
        let board = board(vault)
        _ = try board.files()
        _ = try board.suggestNotes("g")
        vault.files["Porch.md"] = "Paint it."
        #expect(try board.newProject("Porch") == "Porch")
        #expect(vault.files["Porch.md"] == "---\ntags:\n  - project\n---\nPaint it.")
    }

    @Test func aNewNoteIsNeverWrittenOverAFileThatIsThere() throws {
        let vault = vault()
        vault.files["Porch.md"] = "Paint it."
        #expect(throws: VaultError.exists("Porch.md")) { try vault.create(path: "Porch.md", text: "x") }
        #expect(vault.files["Porch.md"] == "Paint it.")
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

/// A vault where some notes are listed but can't be read now.
final class UnreadableVault: FakeVault, @unchecked Sendable {
    var unreadable: Set<String> = []
    override func read(path: String) -> String? { unreadable.contains(path) ? nil : super.read(path: path) }
}
