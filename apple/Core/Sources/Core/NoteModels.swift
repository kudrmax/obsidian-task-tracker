import Foundation

/// A piece of a task's title as every frontend draws it (`rules.textParts`): text as typed, or a link shown by its word.
public struct TextPart: Decodable, Hashable, Sendable {
    /// `text`, `note` or `url`.
    public let kind: String
    /// The typed text of a `text` piece.
    public let text: String?
    /// The word a link shows, in the accent.
    public let label: String?
    /// Where a tap on a link goes: an address, or the link text of a note (`TaskBoard.noteToOpen`).
    public let target: String?

    /// Plain text, as typed.
    public init(text: String) {
        kind = "text"
        self.text = text
        label = nil
        target = nil
    }

    public var isLink: Bool { kind != "text" }
    /// What the piece shows.
    public var shown: String { label ?? text ?? "" }
}

/// `ProjectNote`: a note of the vault by name, with its path and the link Obsidian writes to it.
public struct NoteLink: Decodable, Hashable, Sendable {
    public let name: String
    public let path: String
    public let link: String
}

/// `notes.linkQuery`: the `[[` the caret stands in, and the range (UTF-16 offsets) a picked note's link replaces.
public struct LinkQuery: Decodable, Hashable, Sendable {
    public let query: String
    public let from: Int
    public let to: Int

    var json: JSONValue { ["query": .string(query), "from": .number(Double(from)), "to": .number(Double(to))] }
}

/// A title after a note was picked: its text, and where the caret stands (UTF-16 offset).
public struct LinkInsert: Decodable, Hashable, Sendable {
    public let text: String
    public let caret: Int
}

/// `rules.listWidths`: the list column beside the calendar, points.
public struct ListWidths: Decodable, Hashable, Sendable {
    public let width: Double
    public let min: Double
    public let max: Double
    public let center: Double

    public var json: JSONValue { ["width": .number(width), "min": .number(min), "max": .number(max), "center": .number(center)] }
}

/// `DividerStop`: where a dragged divider stands, and whether it holds to the middle there.
public struct DividerStop: Decodable, Hashable, Sendable {
    public let width: Double
    public let snapped: Bool
}

/// `REPEAT_WORDS`: the repeat page's words.
public struct RepeatWords: Decodable, Hashable, Sendable {
    public struct Weekday: Decodable, Hashable, Sendable {
        public let short: String
        public let name: String
        public let letter: String
    }

    /// By kind: `schedule`, `afterDone`.
    public let kinds: [String: String]
    public let every: String
    /// By unit: `day`, `week`, `month`.
    public let units: [String: String]
    /// Monday first.
    public let weekdays: [Weekday]
    public let remove: String
}

/// Keeps how this device groups its lists by project (`GroupingState`, JSON text), never synced.
public protocol GroupingStore: Sendable {
    func load() -> String?
    func save(_ json: String)
}

/// The grouping kept in `UserDefaults`.
public final class UserDefaultsGrouping: GroupingStore, @unchecked Sendable {
    private let defaults: UserDefaults
    private let key: String

    public init(defaults: UserDefaults = .standard, key: String = "projectGrouping") {
        self.defaults = defaults
        self.key = key
    }

    public func load() -> String? { defaults.string(forKey: key) }
    public func save(_ json: String) { defaults.set(json, forKey: key) }
}

/// The grouping kept while the process runs: the door's defaults (Backlog grouped, Soon not) until a call changes it.
public final class MemoryGrouping: GroupingStore, @unchecked Sendable {
    private let lock = NSLock()
    private var kept: String?

    public init(_ json: String? = nil) { kept = json }

    public func load() -> String? { lock.withLock { kept } }
    public func save(_ json: String) { lock.withLock { kept = json } }
}

/// The vault's files and each note's tags, read once and then again only for a file changed: what `notes.projects`,
/// `notes.suggest` and `notes.open` are asked over.
final class NoteIndex: @unchecked Sendable {
    private let lock = NSLock()
    private var tags: [String: (modified: Date, tags: [String])] = [:]
    private var files: [VaultFile] = []
    private var read = false

    /// The vault listed again, the tags of each note new or changed since read through the door.
    func refresh(vault: TasksVault, core: PhoneCore) {
        let listed = vault.vaultFiles()
        let notes = listed.filter { $0.path.lowercased().hasSuffix(".md") }
        let known = lock.withLock { tags }
        let changed = notes.filter { known[$0.path]?.modified != $0.modified }
        var fresh: [String: (modified: Date, tags: [String])] = [:]
        if !changed.isEmpty {
            let texts = changed.map { vault.read(path: $0.path) ?? "" }
            let context = DoorContext(tasks: nil, now: Date())
            let answer = (try? core.call("notes.tags", [texts], context: context).result as? [[String]]) ?? []
            for (index, file) in changed.enumerated() where index < answer.count { fresh[file.path] = (file.modified, answer[index]) }
        }
        lock.withLock {
            var next: [String: (modified: Date, tags: [String])] = [:]
            for note in notes { next[note.path] = fresh[note.path] ?? known[note.path] }
            tags = next
            files = listed
            read = true
        }
    }

    var hasRead: Bool { lock.withLock { read } }

    /// Every markdown note with its tags, `{ path, tags }`.
    var notes: JSONValue {
        lock.withLock {
            .array(tags.keys.sorted().map { path in ["path": .string(path), "tags": .array((tags[path]?.tags ?? []).map(JSONValue.string))] })
        }
    }

    /// Every file of the vault, `{ path }`.
    var all: JSONValue {
        lock.withLock { .array(files.map(\.path).sorted().map { ["path": .string($0)] }) }
    }
}
