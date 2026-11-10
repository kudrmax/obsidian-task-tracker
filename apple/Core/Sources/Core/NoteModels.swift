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

/// `NewProjectNote`: the note «New project…» writes: the vault's note of that name (`exists`), or a new one at its root.
public struct NewProjectNote: Decodable, Hashable, Sendable {
    public let name: String
    public let path: String
    public let link: String
    public let exists: Bool
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

/// The vault's files, listed once and again only after `forget`: what `notes.suggest` and `notes.open` are asked over.
final class VaultFileList: @unchecked Sendable {
    private let lock = NSLock()
    private var listed: JSONValue?

    /// Every file of the vault, `{ path }`.
    func all(_ vault: TasksVault) -> JSONValue {
        if let listed = lock.withLock({ listed }) { return listed }
        let files = JSONValue.array(vault.vaultFiles().map(\.path).sorted().map { ["path": .string($0)] })
        lock.withLock { listed = files }
        return files
    }

    func forget() { lock.withLock { listed = nil } }
}
