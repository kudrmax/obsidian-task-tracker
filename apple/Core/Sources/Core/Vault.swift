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
    /// The plugin's settings name no tasks file.
    case noTasksFile

    static let noTasksFileMessage = "No tasks file set in Task Calendar's settings"
}

extension VaultError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .noAccess: "No access to the vault folder: choose it in the app"
        case .tasksFileMissing(let path): "No tasks file “\(path)” in the vault folder"
        case .noTasksFile: Self.noTasksFileMessage
        }
    }
}

/// A file of the vault by its path from the vault folder (NFC, as Obsidian names files), and when it last changed.
public struct VaultFile: Sendable, Hashable {
    public let path: String
    public let modified: Date

    public init(path: String, modified: Date) {
        self.path = path
        self.modified = modified
    }
}

/// Where the tasks file and the plugin's settings come from.
public protocol TasksVault: Sendable {
    func read() throws -> (tasks: String, settingsJSON: String)
    /// Writes `tasks` only if the file still holds `old`; false when it changed in between.
    func write(tasks: String, expecting old: String) throws -> Bool
    /// Another file of the vault, by path from its folder; `nil` when it is missing or unreadable.
    func read(path: String) -> String?
    /// Writes another file of the vault whole, its folder made if missing.
    func write(path: String, text: String) throws
    /// The plugin's settings, `data.json`'s text; empty for none: the plugin's defaults.
    func settingsJSON() -> String
    /// The tasks file, by path from the vault folder.
    func tasksFilePath() throws -> String
    /// A new file in `folder` (by path from the vault folder, made if missing), never over another: a taken name gets
    /// a number, as Obsidian numbers it. Returns the name written.
    func save(_ data: Data, in folder: String, named name: String) throws -> String
    /// Every file of the vault but Obsidian's own folder and the trash (hidden ones), by path from its folder.
    func vaultFiles() -> [VaultFile]
}

public extension TasksVault {
    /// None where the vault cannot list its files.
    func vaultFiles() -> [VaultFile] { [] }
}

/// The Obsidian vault folder the app was given once, read and written through file coordination.
public final class Vault: TasksVault, @unchecked Sendable {
    private let bookmarks: BookmarkStore
    private let rule: TasksFileRule
    /// A file changed this recently may still be being written: wait this long and read it again.
    private let settle: Duration
    private let wait: @Sendable (Duration) -> Void
    /// The tasks file's text as this app last wrote it: a read finding exactly that needs no settling, the write was ours.
    private let own = OwnWrite()
    /// The watch on the tasks file: the app's own reads and writes are made as it, so it is never told of them.
    private let watching = Watching()

    /// `wait`: how a read waits out a file still being written.
    public init(bookmarks: BookmarkStore, rule: TasksFileRule, settle: Duration = .seconds(1), wait: (@Sendable (Duration) -> Void)? = nil) {
        self.bookmarks = bookmarks
        self.rule = rule
        self.settle = settle
        self.wait = wait ?? { Thread.sleep(forTimeInterval: $0.seconds) }
    }

    /// Remembers `folder` (a URL from the folder picker) for every later run, in the background too.
    public func choose(folder: URL) throws {
        let scoped = folder.startAccessingSecurityScopedResource()
        defer { if scoped { folder.stopAccessingSecurityScopedResource() } }
        bookmarks.save(try folder.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil))
    }

    public func read() throws -> (tasks: String, settingsJSON: String) {
        try withFolder { folder in
            let settingsJSON = settings(in: folder)
            let path = try tasksFile(settingsJSON)
            let file = folder.appendingPathComponent(path)
            guard FileManager.default.fileExists(atPath: file.path) else { throw VaultError.tasksFileMissing(path) }
            return (try settledRead(file), settingsJSON)
        }
    }

    public func write(tasks: String, expecting old: String) throws -> Bool {
        try withFolder { folder in
            let file = folder.appendingPathComponent(try tasksFile(settings(in: folder)))
            var written = false
            var failure: Error?
            var coordination: NSError?
            coordinator().coordinate(writingItemAt: file, options: .forMerging, error: &coordination) { url in
                do {
                    guard try String(contentsOf: url, encoding: .utf8) == old else { return }
                    try tasks.write(to: url, atomically: true, encoding: .utf8)
                    own.text = tasks
                    written = true
                } catch {
                    failure = error
                }
            }
            if let error = coordination ?? failure { throw error }
            return written
        }
    }

    public func settingsJSON() -> String {
        (try? withFolder { folder in settings(in: folder) }) ?? ""
    }

    public func tasksFilePath() throws -> String {
        try withFolder { folder in try tasksFile(settings(in: folder)) }
    }

    public func save(_ data: Data, in path: String, named name: String) throws -> String {
        try withFolder { vault in
            let folder = path.isEmpty ? vault : vault.appendingPathComponent(path, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let free = Self.availableName(name, in: folder)
            var failure: Error?
            var coordination: NSError?
            coordinator().coordinate(writingItemAt: folder.appendingPathComponent(free), options: [], error: &coordination) { url in
                do { try data.write(to: url, options: .withoutOverwriting) } catch { failure = error }
            }
            if let error = coordination ?? failure { throw error }
            return free
        }
    }

    public func vaultFiles() -> [VaultFile] {
        (try? withFolder { folder -> [VaultFile] in
            let keys: [URLResourceKey] = [.isRegularFileKey, .contentModificationDateKey]
            guard let walk = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles, .skipsPackageDescendants]) else { return [] }
            let base = folder.standardizedFileURL.path
            var found: [VaultFile] = []
            for case let url as URL in walk {
                guard let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true else { continue }
                let full = url.standardizedFileURL.path
                guard full.hasPrefix(base + "/") else { continue }
                found.append(VaultFile(path: String(full.dropFirst(base.count + 1)).precomposedStringWithCanonicalMapping, modified: values.contentModificationDate ?? .distantPast))
            }
            return found
        }) ?? []
    }

    public func read(path: String) -> String? {
        try? withFolder { folder in try coordinatedRead(folder.appendingPathComponent(path)) }
    }

    public func write(path: String, text: String) throws {
        try withFolder { folder in
            let file = folder.appendingPathComponent(path)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            var failure: Error?
            var coordination: NSError?
            coordinator().coordinate(writingItemAt: file, options: .forReplacing, error: &coordination) { url in
                do { try text.write(to: url, atomically: true, encoding: .utf8) } catch { failure = error }
            }
            if let error = coordination ?? failure { throw error }
            if path == (try? tasksFile(settings(in: folder))) { own.text = text }
        }
    }

    /// Tells `changed` whenever the tasks file is written through file coordination (iCloud, a reminder's button, another
    /// of the app's processes) while the watch is kept.
    public func watchTasksFile(_ changed: @escaping @Sendable () -> Void) -> FileWatch? {
        guard let file = try? withFolder({ folder in folder.appendingPathComponent(try tasksFile(settings(in: folder))) }) else { return nil }
        let watch = FileWatch(file, changed)
        watching.watch = watch
        return watch
    }

    /// Tells `changed` whenever the plugin's settings (`data.json`) are written while the watch is kept: Obsidian changed
    /// a setting (the cards' size, Several labels, a list's name) and the screen draws it at once, as the plugin does.
    public func watchSettingsFile(_ changed: @escaping @Sendable () -> Void) -> FileWatch? {
        guard let file = try? withFolder({ folder in folder.appendingPathComponent(try rule.settingsFile()) }) else { return nil }
        return FileWatch(file, changed)
    }

    /// The app wrote the tasks file in its own process for someone other than the screen (a reminder's button, Siri, the
    /// capture sheet): its writes are coordinated as the watch, which the system therefore does not tell, so it is told
    /// here. The screen's own writes are never told: it reads and draws after each of them itself.
    public func tellWatch() {
        guard let watch = watching.watch else { return }
        watch.presentedItemOperationQueue.addOperation { watch.presentedItemDidChange() }
    }

    private func coordinator() -> NSFileCoordinator { NSFileCoordinator(filePresenter: watching.watch) }

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
        var text = try coordinatedRead(file)
        if text == own.text { return text }
        for _ in 0..<5 {
            guard let modified = Self.modified(file), Date().timeIntervalSince(modified) < settle.seconds else { break }
            wait(settle)
            text = try coordinatedRead(file)
        }
        return text
    }

    private static func availableName(_ name: String, in folder: URL) -> String {
        let base = (name as NSString).deletingPathExtension
        let ext = (name as NSString).pathExtension
        var candidate = name
        var number = 1
        while FileManager.default.fileExists(atPath: folder.appendingPathComponent(candidate).path) {
            candidate = "\(base) \(number).\(ext)"
            number += 1
        }
        return candidate
    }

    private static func modified(_ file: URL) -> Date? {
        try? FileManager.default.attributesOfItem(atPath: file.path)[.modificationDate] as? Date
    }

    private func tasksFile(_ settingsJSON: String) throws -> String {
        guard let path = try rule.tasksFile(settingsJSON: settingsJSON) else { throw VaultError.noTasksFile }
        return path
    }

    /// The plugin's `data.json`, empty for none: the plugin's defaults.
    private func settings(in folder: URL) -> String {
        guard let path = try? rule.settingsFile() else { return "" }
        return (try? coordinatedRead(folder.appendingPathComponent(path))) ?? ""
    }

    private func coordinatedRead(_ file: URL) throws -> String {
        var result: Result<String, Error> = .failure(CocoaError(.fileReadNoSuchFile))
        var coordination: NSError?
        coordinator().coordinate(readingItemAt: file, options: [], error: &coordination) { url in
            result = Result { try String(contentsOf: url, encoding: .utf8) }
        }
        if let coordination { throw coordination }
        return try result.get()
    }
}

/// A file presented to the system's file coordination: told of every coordinated change to it, until it goes.
public final class FileWatch: NSObject, NSFilePresenter, @unchecked Sendable {
    public let presentedItemURL: URL?
    public let presentedItemOperationQueue = OperationQueue()
    private let changed: @Sendable () -> Void

    init(_ file: URL, _ changed: @escaping @Sendable () -> Void) {
        presentedItemURL = file
        self.changed = changed
        super.init()
        presentedItemOperationQueue.maxConcurrentOperationCount = 1
        NSFileCoordinator.addFilePresenter(self)
    }

    public func presentedItemDidChange() { changed() }

    public func cancel() { NSFileCoordinator.removeFilePresenter(self) }

    deinit { NSFileCoordinator.removeFilePresenter(self) }
}

/// The tasks file's watch while it is kept.
private final class Watching: @unchecked Sendable {
    private let lock = NSLock()
    private weak var kept: FileWatch?

    var watch: FileWatch? {
        get { lock.withLock { kept } }
        set { lock.withLock { kept = newValue } }
    }
}

/// The text of the app's own last write, shared by the threads that read and write.
private final class OwnWrite: @unchecked Sendable {
    private let lock = NSLock()
    private var kept: String?

    var text: String? {
        get { lock.withLock { kept } }
        set { lock.withLock { kept = newValue } }
    }
}

private extension Duration {
    var seconds: Double {
        let (seconds, attoseconds) = components
        return Double(seconds) + Double(attoseconds) / 1e18
    }
}
