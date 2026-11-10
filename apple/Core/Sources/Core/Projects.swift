import Foundation

/// A small text kept on the device, never synced: how this device groups its lists, the projects last found.
public protocol DeviceText: Sendable {
    func load() -> String?
    func save(_ text: String)
}

public final class UserDefaultsText: DeviceText, @unchecked Sendable {
    private let defaults: UserDefaults
    private let key: String

    public init(key: String, defaults: UserDefaults = .standard) {
        self.key = key
        self.defaults = defaults
    }

    public func load() -> String? { defaults.string(forKey: key) }
    public func save(_ text: String) { defaults.set(text, forKey: key) }
}

/// A text kept in a file of the device: a cache too large for the defaults, which the system may clear.
public final class FileText: DeviceText, @unchecked Sendable {
    private let url: URL

    public init(_ url: URL) { self.url = url }

    public func load() -> String? { try? String(contentsOf: url, encoding: .utf8) }
    public func save(_ text: String) { try? text.write(to: url, atomically: true, encoding: .utf8) }
}

/// A text kept in memory only: a device that keeps nothing, and the tests.
public final class MemoryText: DeviceText, @unchecked Sendable {
    private let lock = NSLock()
    private var text: String?

    public init(_ text: String? = nil) { self.text = text }

    public func load() -> String? {
        lock.lock()
        defer { lock.unlock() }
        return text
    }

    public func save(_ text: String) {
        lock.lock()
        self.text = text
        lock.unlock()
    }
}

/// `ProjectNote`: a note with the project tag, as the door's context takes it.
public struct ProjectNote: Codable, Hashable, Sendable {
    public let name: String
    public let path: String
    /// The shortest link text Obsidian would write to it.
    public let link: String

    public init(name: String, path: String, link: String) {
        self.name = name
        self.path = path
        self.link = link
    }
}

/// Who knows the vault's project notes: the core's `Projects` port on the phone.
public protocol ProjectSource: Sendable {
    /// The notes with `tag` (the settings' project tag, as `settings.form` gives it), as last found.
    func notes(tag: String) -> [ProjectNote]
    /// Looks again at once, a note just written: the next `notes` has it.
    func lookAgain(tag: String)
}

public extension ProjectSource {
    func lookAgain(tag: String) {}
}

/// A markdown note of the vault as a scan finds it: its path from the vault's folder, when it last changed, and its text
/// when the scan asked for it.
public struct ScannedNote: Sendable {
    public let path: String
    public let modified: Date
    public let text: String?

    public init(path: String, modified: Date, text: String?) {
        self.path = path
        self.modified = modified
        self.text = text
    }
}

/// The vault's markdown notes, read in one pass.
public protocol NoteFolder: Sendable {
    /// Every markdown note outside the hidden folders; the text of those `wanted` names (by path and change).
    func scanNotes(wanted: (String, Date) -> Bool) throws -> [ScannedNote]
}

/// The vault's project notes, as the plugin's `VaultProjects` keeps them over Obsidian's metadata cache: every note's tags
/// read once through the door (`rules.noteTags`) and then only the notes changed since, the tags kept on the device by
/// path and modification date, so a vault of thousands of notes is read whole once; the list is the door's
/// `rules.projectNotes` over every path, asked again only when a note was read, a path came or went, or the tag changed.
/// The list last found is kept on the device too, so the first screen shows the groups it showed last. A read hands the
/// list as last found and looks again in the background at most every few seconds; `changed` is told when the list
/// itself changes. The door is asked on the scan's own core, never the screen's.
public final class VaultProjects: ProjectSource, @unchecked Sendable {
    private let folder: NoteFolder
    private let core: PhoneCore
    private let remembered: DeviceText
    private let rememberedTags: DeviceText
    private let background: Bool
    private let every: TimeInterval
    private let lock = NSLock()
    private var tags: [String: KeptTags]?
    private var found: [ProjectNote]?
    private var foundFor: String?
    /// The paths the list was made over: the same paths and no note read, the list stands.
    private var foundOver: Set<String>?
    private var lastScan: Date?
    private var scanning = false
    private var listener: (@Sendable () -> Void)?
    /// How many times the door made the list: a scan that read nothing over the same paths makes none.
    private(set) var listsMade = 0

    /// A note's tags as the door read them, and the modification date of the text they were read from.
    struct KeptTags: Codable {
        let modified: Date
        let tags: [String]
    }

    /// `core`: the door the scan asks, its own (a scan of a large vault never holds the screen's reads back).
    /// `background`: a read looks again off its own thread (the app); false looks again at once (the tests).
    public init(folder: NoteFolder, core: PhoneCore, remembered: DeviceText = MemoryText(), rememberedTags: DeviceText = MemoryText(), background: Bool = true, every: TimeInterval = 3) {
        self.folder = folder
        self.core = core
        self.remembered = remembered
        self.rememberedTags = rememberedTags
        self.background = background
        self.every = every
    }

    /// The list of project notes changed: the screen reads again.
    public var changed: (@Sendable () -> Void)? {
        get {
            lock.lock()
            defer { lock.unlock() }
            return listener
        }
        set {
            lock.lock()
            listener = newValue
            lock.unlock()
        }
    }

    public func notes(tag: String) -> [ProjectNote] {
        lock.lock()
        let stale = foundFor != tag || lastScan.map { Date().timeIntervalSince($0) >= every } ?? true
        let start = stale && !scanning
        if start { scanning = true }
        var shown = foundFor == tag ? found : nil
        lock.unlock()
        if shown == nil, let kept = rememberedNotes(tag) { shown = kept }
        guard start else { return shown ?? [] }
        if background {
            DispatchQueue.global(qos: .utility).async { [self] in
                if scan(tag: tag) { changed?() }
            }
            return shown ?? []
        }
        _ = scan(tag: tag)
        lock.lock()
        defer { lock.unlock() }
        return found ?? []
    }

    public func lookAgain(tag: String) {
        if scan(tag: tag) { changed?() }
    }

    /// Reads the notes changed since the last scan and works the list out anew when it may have changed: true when it
    /// differs from the one shown.
    @discardableResult
    public func scan(tag: String) -> Bool {
        lock.lock()
        let known = tags ?? keptTags()
        let before = foundFor == tag ? found : rememberedNotes(tag)
        let over = foundFor == tag ? foundOver : nil
        lock.unlock()
        defer {
            lock.lock()
            scanning = false
            lastScan = Date()
            lock.unlock()
        }
        guard let scanned = try? folder.scanNotes(wanted: { path, modified in known[path].map { abs($0.modified.timeIntervalSince(modified)) > 0.001 } ?? true }) else { return false }
        var next: [String: KeptTags] = [:]
        var read = false
        for note in scanned {
            if let text = note.text, let found: [String] = try? rule("rules.noteTags", [.string(text)]) {
                next[note.path] = KeptTags(modified: note.modified, tags: found)
                read = true
            } else if let kept = known[note.path] {
                next[note.path] = kept
            }
        }
        let paths = Set(scanned.map(\.path))
        if !read, paths == over, let before {
            lock.lock()
            tags = next
            lock.unlock()
            return false
        }
        let all = JSONValue.array(scanned.map { note in
            next[note.path].map { ["path": .string(note.path), "tags": .array($0.tags.map(JSONValue.string))] } ?? ["path": .string(note.path)]
        })
        guard let notes: [ProjectNote] = try? rule("rules.projectNotes", [all, .string(tag)]) else { return false }
        lock.lock()
        listsMade += 1
        tags = next
        found = notes
        foundFor = tag
        foundOver = paths
        lock.unlock()
        if read || next.count != known.count, let text = try? String(decoding: JSONEncoder().encode(next), as: UTF8.self) { rememberedTags.save(text) }
        if notes != before, let text = try? String(decoding: JSONEncoder().encode(Remembered(tag: tag, notes: notes)), as: UTF8.self) { remembered.save(text) }
        return notes != before
    }

    private struct Remembered: Codable {
        let tag: String
        let notes: [ProjectNote]
    }

    private func rememberedNotes(_ tag: String) -> [ProjectNote]? {
        guard let text = remembered.load(), let kept = try? JSONDecoder().decode(Remembered.self, from: Data(text.utf8)), kept.tag == tag else { return nil }
        return kept.notes
    }

    private func keptTags() -> [String: KeptTags] {
        guard let text = rememberedTags.load(), let kept = try? JSONDecoder().decode([String: KeptTags].self, from: Data(text.utf8)) else { return [:] }
        return kept
    }

    private func rule<T: Decodable>(_ method: String, _ arguments: [JSONValue]) throws -> T {
        try JSONValue(any: core.call(method, arguments.map(\.any), context: DoorContext(tasks: nil, now: Date())).result).decode(T.self)
    }
}
