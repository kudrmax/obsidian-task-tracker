import Foundation
import Testing
@testable import Core

final class MemoryBookmarks: BookmarkStore, @unchecked Sendable {
    var data: Data?
    func load() -> Data? { data }
    func save(_ data: Data) { self.data = data }
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

    @Test func readsTheTasksFileNamedInThePluginSettings() throws {
        let settings = #"{"tasksFile":"tasks/My.md"}"#
        try put(settings, ".obsidian/plugins/task-calendar/data.json")
        try put("## Now\n", "tasks/My.md")
        let read = try vault().read()
        #expect(read.tasks == "## Now\n")
        #expect(read.settingsJSON == settings)
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
