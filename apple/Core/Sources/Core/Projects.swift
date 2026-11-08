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
/// read once through the door (`rules.noteTags`) and then note by note, only those changed since, the list the door's
/// `rules.projectNotes` makes of them; the list kept on the device, so the first screen shows the
/// groups it showed last. A read hands the list as last found and looks again in the background at most every few
/// seconds; `changed` is told when the list itself changes.
public final class VaultProjects: ProjectSource, @unchecked Sendable {
    private let folder: NoteFolder
    private let core: PhoneCore
    private let remembered: DeviceText
    private let background: Bool
    private let every: TimeInterval
    private let lock = NSLock()
    private var tags: [String: (modified: Date, tags: [String])] = [:]
    private var found: [ProjectNote]?
    private var foundFor: String?
    private var lastScan: Date?
    private var scanning = false
    /// The list of project notes changed: the screen reads again.
    public var changed: (@Sendable () -> Void)?

    /// `background`: a read looks again off its own thread (the app); false looks again at once (the tests).
    public init(folder: NoteFolder, core: PhoneCore, remembered: DeviceText = MemoryText(), background: Bool = true, every: TimeInterval = 3) {
        self.folder = folder
        self.core = core
        self.remembered = remembered
        self.background = background
        self.every = every
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

    /// Reads the notes changed since the last scan and works the list out anew: true when it differs from the one shown.
    @discardableResult
    public func scan(tag: String) -> Bool {
        lock.lock()
        let known = tags
        let before = foundFor == tag ? found : rememberedNotes(tag)
        lock.unlock()
        let scanned = try? folder.scanNotes(wanted: { path, modified in known[path]?.modified != modified })
        var next: [String: (modified: Date, tags: [String])] = [:]
        for note in scanned ?? [] {
            if let text = note.text, let read: [String] = try? rule("rules.noteTags", [.string(text)]) {
                next[note.path] = (note.modified, read)
            } else if let kept = known[note.path] {
                next[note.path] = kept
            }
        }
        let all = JSONValue.array((scanned ?? []).map { note in
            next[note.path].map { ["path": .string(note.path), "tags": .array($0.tags.map(JSONValue.string))] } ?? ["path": .string(note.path)]
        })
        let notes: [ProjectNote]? = scanned == nil ? nil : try? rule("rules.projectNotes", [all, .string(tag)])
        lock.lock()
        defer {
            scanning = false
            lastScan = Date()
            lock.unlock()
        }
        guard let notes else { return false }
        tags = next
        found = notes
        foundFor = tag
        if let text = try? String(decoding: JSONEncoder().encode(Remembered(tag: tag, notes: notes)), as: UTF8.self) { remembered.save(text) }
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

    private func rule<T: Decodable>(_ method: String, _ arguments: [JSONValue]) throws -> T {
        try JSONValue(any: core.call(method, arguments.map(\.any), context: DoorContext(tasks: nil, now: Date())).result).decode(T.self)
    }
}
