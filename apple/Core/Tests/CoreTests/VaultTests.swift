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

    func vault() throws -> Vault {
        let vault = Vault(bookmarks: MemoryBookmarks(), settle: .milliseconds(50))
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

    @Test func missingTasksFile() throws {
        #expect(throws: VaultError.tasksFileMissing("TODOs Tasks.md")) { try vault().read() }
    }

    @Test func noFolderChosen() {
        #expect(throws: VaultError.noAccess) { try Vault(bookmarks: MemoryBookmarks()).read() }
    }

    @Test func aBrokenBookmarkIsNoAccess() {
        let bookmarks = MemoryBookmarks()
        bookmarks.data = Data("not a bookmark".utf8)
        #expect(throws: VaultError.noAccess) { try Vault(bookmarks: bookmarks).read() }
    }

    @Test func writeRefusesWhenTheFileChanged() throws {
        try put("new", "TODOs Tasks.md")
        let vault = try vault()
        #expect(try vault.write(tasks: "mine", expecting: "old") == false)
        #expect(try vault.read().tasks == "new")
        #expect(try vault.write(tasks: "mine", expecting: "new") == true)
        #expect(try vault.read().tasks == "mine")
    }

    @Test func aFileStillBeingWrittenIsReadAgain() async throws {
        try put("first", "TODOs Tasks.md")
        let vault = try vault()
        Task.detached { try? await Task.sleep(for: .milliseconds(20)); try? self.put("second", "TODOs Tasks.md") }
        #expect(try vault.read().tasks == "second")
    }
}
