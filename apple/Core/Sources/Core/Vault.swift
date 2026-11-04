import Foundation

public protocol BookmarkStore: Sendable {
    func load() -> Data?
    func save(_ data: Data)
}

public final class UserDefaultsBookmarks: BookmarkStore, @unchecked Sendable {
    private let defaults: UserDefaults
    private let key: String

    public init(defaults: UserDefaults = .standard, key: String = "vaultBookmark") {
        self.defaults = defaults
        self.key = key
    }

    public func load() -> Data? { defaults.data(forKey: key) }
    public func save(_ data: Data) { defaults.set(data, forKey: key) }
}

public enum VaultError: Error, Equatable {
    case noAccess
    case tasksFileMissing(String)
}

/// Where the tasks file and the plugin's settings come from.
public protocol TasksVault: Sendable {
    func read() throws -> (tasks: String, settingsJSON: String)
    /// Writes `tasks` only if the file still holds `old`; false when it changed in between.
    func write(tasks: String, expecting old: String) throws -> Bool
}

/// The Obsidian vault folder the app was given once, read and written through file coordination.
public final class Vault: TasksVault, @unchecked Sendable {
    static let settingsPath = ".obsidian/plugins/task-calendar/data.json"
    static let defaultTasksFile = "TODOs Tasks.md"

    private let bookmarks: BookmarkStore
    /// A file changed this recently may still be being written: wait this long and read it again.
    private let settle: Duration

    public init(bookmarks: BookmarkStore, settle: Duration = .seconds(1)) {
        self.bookmarks = bookmarks
        self.settle = settle
    }

    /// Remembers `folder` (a URL from the folder picker) for every later run, in the background too.
    public func choose(folder: URL) throws {
        let scoped = folder.startAccessingSecurityScopedResource()
        defer { if scoped { folder.stopAccessingSecurityScopedResource() } }
        bookmarks.save(try folder.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil))
    }

    public func read() throws -> (tasks: String, settingsJSON: String) {
        try withFolder { folder in
            let settingsJSON = (try? Self.coordinatedRead(folder.appendingPathComponent(Self.settingsPath))) ?? ""
            let path = Self.tasksFile(in: settingsJSON)
            let file = folder.appendingPathComponent(path)
            guard FileManager.default.fileExists(atPath: file.path) else { throw VaultError.tasksFileMissing(path) }
            return (try settledRead(file), settingsJSON)
        }
    }

    public func write(tasks: String, expecting old: String) throws -> Bool {
        try withFolder { folder in
            let file = folder.appendingPathComponent(Self.tasksFile(in: (try? Self.coordinatedRead(folder.appendingPathComponent(Self.settingsPath))) ?? ""))
            var written = false
            var failure: Error?
            var coordination: NSError?
            NSFileCoordinator().coordinate(writingItemAt: file, options: .forMerging, error: &coordination) { url in
                do {
                    guard try String(contentsOf: url, encoding: .utf8) == old else { return }
                    try tasks.write(to: url, atomically: true, encoding: .utf8)
                    written = true
                } catch {
                    failure = error
                }
            }
            if let error = coordination ?? failure { throw error }
            return written
        }
    }

    private func withFolder<T>(_ body: (URL) throws -> T) throws -> T {
        guard let data = bookmarks.load() else { throw VaultError.noAccess }
        var stale = false
        guard let folder = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else {
            throw VaultError.noAccess
        }
        let scoped = folder.startAccessingSecurityScopedResource()
        defer { if scoped { folder.stopAccessingSecurityScopedResource() } }
        if stale, let fresh = try? folder.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
            bookmarks.save(fresh)
        }
        guard FileManager.default.fileExists(atPath: folder.path) else { throw VaultError.noAccess }
        return try body(folder)
    }

    private func settledRead(_ file: URL) throws -> String {
        var text = try Self.coordinatedRead(file)
        for _ in 0..<5 {
            guard let modified = Self.modified(file), Date().timeIntervalSince(modified) < settle.seconds else { break }
            Thread.sleep(forTimeInterval: settle.seconds)
            text = try Self.coordinatedRead(file)
        }
        return text
    }

    private static func modified(_ file: URL) -> Date? {
        try? FileManager.default.attributesOfItem(atPath: file.path)[.modificationDate] as? Date
    }

    private static func tasksFile(in settingsJSON: String) -> String {
        guard let data = settingsJSON.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let path = object["tasksFile"] as? String, !path.isEmpty
        else { return defaultTasksFile }
        return path
    }

    private static func coordinatedRead(_ file: URL) throws -> String {
        var result: Result<String, Error> = .failure(CocoaError(.fileReadNoSuchFile))
        var coordination: NSError?
        NSFileCoordinator().coordinate(readingItemAt: file, options: [], error: &coordination) { url in
            result = Result { try String(contentsOf: url, encoding: .utf8) }
        }
        if let coordination { throw coordination }
        return try result.get()
    }
}

private extension Duration {
    var seconds: Double {
        let (seconds, attoseconds) = components
        return Double(seconds) + Double(attoseconds) / 1e18
    }
}
