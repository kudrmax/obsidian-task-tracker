import Foundation
import Testing
@testable import Core

final class MemoryBookmarks: BookmarkStore, @unchecked Sendable {
    var data: Data?
    func load() -> Data? { data }
    func save(_ data: Data) { self.data = data }
}

/// The core's rule for the tasks file, with the plugin's settings kept in another file.
struct SettingsElsewhere: TasksFileRule {
    func tasksFile(settingsJSON: String) throws -> String? { "TODOs Tasks.md" }
    func settingsFile() throws -> String { "elsewhere/data.json" }
}

@Suite struct VaultTests {
    let folder: URL = {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("vault-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    func put(_ text: String, _ path: String) throws {
        let url = folder.appendingPathComponent(path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try text.write(to: url, atomically: true, encoding: .utf8)
    }

    static let rules = try! PhoneCore(script: Fixtures.phoneScript)

    func vault(settle: Duration = .milliseconds(50), wait: @escaping @Sendable (Duration) -> Void = { _ in }) throws -> Vault {
        let vault = Vault(bookmarks: MemoryBookmarks(), rule: Self.rules, settle: settle, wait: wait)
        try vault.choose(folder: folder)
        return vault
    }

    @Test func aScanListsTheNotesOutsideTheDotFoldersAndReadsOnlyThoseWanted() throws {
        try put("#project", "Projects/Plan.md")
        try put("plain", "Plan.md")
        try put("hidden", ".obsidian/Notes.md")
        try put("trash", ".trash/Old.md")
        try put("", "Cloud/.Plan.md.icloud")
        try put("not a note", "image.png")
        let notes = try vault().scanNotes(wanted: { path, _ in path == "Projects/Plan.md" })
        #expect(Set(notes.map(\.path)) == ["Projects/Plan.md", "Plan.md", "Cloud/Plan.md"])
        #expect(notes.first { $0.path == "Projects/Plan.md" }?.text == "#project")
        #expect(notes.filter { $0.text != nil }.count == 1)
    }

    @Test func aNotesPathIsInNFCAsTheLinksSpellIt() throws {
        let name = "Окружение в новой стране"
        try put("#project", name.decomposedStringWithCanonicalMapping + ".md")
        let notes = try vault().scanNotes(wanted: { _, _ in true })
        #expect(notes.map(\.path) == [name + ".md"])
        #expect(notes.first.map { Array($0.path.unicodeScalars) } == Array((name + ".md").unicodeScalars))
    }

    @Test func readsTheTasksFileNamedInThePluginSettings() throws {
        let settings = #"{"tasksFile":"tasks/My.md"}"#
        try put(settings, ".obsidian/plugins/task-calendar/data.json")
        try put("## Now\n", "tasks/My.md")
        let read = try vault().read()
        #expect(read.tasks == "## Now\n")
        #expect(read.settingsJSON == settings)
    }

    @Test func thePluginSettingsAreWhereTheCoreSaysAndReadAlone() throws {
        #expect(try Self.rules.settingsFile() == ".obsidian/plugins/task-calendar/data.json")
        let settings = #"{"sections":{"inbox":"Входящие"}}"#
        try put(settings, "elsewhere/data.json")
        try put("## Входящие\n", "TODOs Tasks.md")
        let vault = Vault(bookmarks: MemoryBookmarks(), rule: SettingsElsewhere())
        try vault.choose(folder: folder)
        #expect(vault.settingsJSON() == settings)
        #expect(try vault.read().settingsJSON == settings)
    }

    @Test func withoutPluginSettingsTheDefaultFile() throws {
        try put("## Soon\n", "TODOs Tasks.md")
        let read = try vault().read()
        #expect(read.tasks == "## Soon\n")
        #expect(read.settingsJSON == "")
    }

    @Test func aBlankSettingIsNoTasksFile() throws {
        try put(#"{"tasksFile":""}"#, ".obsidian/plugins/task-calendar/data.json")
        try put("## Soon\n", "TODOs Tasks.md")
        #expect(throws: VaultError.noTasksFile) { try vault().read() }
        #expect(throws: VaultError.noTasksFile) { try vault().tasksFilePath() }
        #expect(throws: VaultError.noTasksFile) { try vault().write(tasks: "mine", expecting: "## Soon\n") }
    }

    @Test func missingTasksFile() throws {
        #expect(throws: VaultError.tasksFileMissing("TODOs Tasks.md")) { try vault().read() }
    }

    @Test func noFolderChosen() {
        #expect(throws: VaultError.noAccess) { try Vault(bookmarks: MemoryBookmarks(), rule: Self.rules).read() }
    }

    @Test func aBrokenBookmarkIsNoAccess() {
        let bookmarks = MemoryBookmarks()
        bookmarks.data = Data("not a bookmark".utf8)
        #expect(throws: VaultError.noAccess) { try Vault(bookmarks: bookmarks, rule: Self.rules).read() }
    }

    @Test func writeRefusesWhenTheFileChanged() throws {
        try put("new", "TODOs Tasks.md")
        let vault = try vault()
        #expect(try vault.write(tasks: "mine", expecting: "old") == false)
        #expect(try vault.read().tasks == "new")
        #expect(try vault.write(tasks: "mine", expecting: "new") == true)
        #expect(try vault.read().tasks == "mine")
    }

    @Test func aFileStillBeingWrittenIsReadAgain() throws {
        try put("first", "TODOs Tasks.md")
        let waits = Waits()
        // The writer finishes while the read waits: what it reads then is the file as written.
        let vault = try vault(settle: .seconds(60)) { duration in
            waits.record(duration)
            try? self.put("second", "TODOs Tasks.md")
        }
        #expect(try vault.read().tasks == "second")
        #expect(waits.count > 0)
    }

    @Test func theAppsOwnWriteIsReadAtOnce() throws {
        try put("first", "TODOs Tasks.md")
        let waits = Waits()
        let vault = try vault(settle: .seconds(60)) { waits.record($0) }
        #expect(try vault.write(tasks: "mine", expecting: "first"))
        #expect(try vault.read().tasks == "mine")
        #expect(waits.count == 0)
        // Another writer's text right after it is still waited out.
        try put("theirs", "TODOs Tasks.md")
        _ = try vault.read()
        #expect(waits.count > 0)
    }

    @Test func aFileLeftAloneIsReadOnce() throws {
        try put("first", "TODOs Tasks.md")
        try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -120)], ofItemAtPath: folder.appendingPathComponent("TODOs Tasks.md").path)
        let waits = Waits()
        let vault = try vault(settle: .seconds(60)) { waits.record($0) }
        #expect(try vault.read().tasks == "first")
        #expect(waits.count == 0)
    }
}

/// How often a read waited.
final class Waits: @unchecked Sendable {
    private let lock = NSLock()
    private var durations: [Duration] = []

    func record(_ duration: Duration) {
        lock.withLock { durations.append(duration) }
    }

    var count: Int { lock.withLock { durations.count } }
}

@Suite struct FileWatchTests {
    @Test func anotherWriterIsToldTheAppsOwnWriteIsNotAndItsReadsAreAtOnce() async throws {
        let tests = VaultTests()
        try tests.put("first", "TODOs Tasks.md")
        let vault = try tests.vault()
        let told = Waits()
        let watch = try #require(vault.watchTasksFile { told.record(.zero) })
        _ = try vault.write(tasks: "mine", expecting: "first")
        let start = Date()
        #expect(try vault.read().tasks == "mine")
        #expect(Date().timeIntervalSince(start) < 0.2)
        try await Task.sleep(for: .milliseconds(300))
        #expect(told.count == 0)
        // Another writer: a reminder's button in the widget's process, iCloud.
        _ = try tests.vault().write(tasks: "theirs", expecting: "mine")
        for _ in 0..<50 where told.count == 0 { try await Task.sleep(for: .milliseconds(20)) }
        #expect(told.count > 0)
        watch.cancel()
    }

    @Test func aWriteInTheAppForSomeoneElseIsToldWhenAsked() async throws {
        let tests = VaultTests()
        try tests.put("first", "TODOs Tasks.md")
        let vault = try tests.vault()
        let told = Waits()
        let watch = try #require(vault.watchTasksFile { told.record(.zero) })
        _ = try vault.write(tasks: "a reminder's button", expecting: "first")
        vault.tellWatch()
        for _ in 0..<50 where told.count == 0 { try await Task.sleep(for: .milliseconds(20)) }
        #expect(told.count == 1)
        watch.cancel()
    }
}
