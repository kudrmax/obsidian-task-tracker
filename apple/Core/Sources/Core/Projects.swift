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

/// A note's tags as Obsidian's metadata cache reads them (`getAllTags`): its properties' `tags` (or `tag`), then the
/// `#tags` of its text outside code.
public enum NoteTags {
    public static func of(_ text: String) -> [String] {
        let (properties, body) = split(text)
        return (properties.map(propertyTags) ?? []) + bodyTags(body)
    }

    /// The front matter between the first two `---` lines, and the text after it.
    private static func split(_ text: String) -> (properties: String?, body: String) {
        let lines = text.components(separatedBy: "\n").map { $0.hasSuffix("\r") ? String($0.dropLast()) : $0 }
        guard lines.first?.trimmingCharacters(in: .whitespaces) == "---",
              let end = lines.dropFirst().firstIndex(where: { $0.trimmingCharacters(in: .whitespaces) == "---" }) else { return (nil, text) }
        return (lines[1..<end].joined(separator: "\n"), lines[(end + 1)...].joined(separator: "\n"))
    }

    private static func propertyTags(_ yaml: String) -> [String] {
        let lines = yaml.components(separatedBy: "\n")
        var found: [String] = []
        var index = 0
        while index < lines.count {
            let line = lines[index]
            index += 1
            guard let colon = line.firstIndex(of: ":"), !line.hasPrefix(" "), !line.hasPrefix("\t") else { continue }
            let key = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            guard key == "tags" || key == "tag" else { continue }
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            if value.isEmpty {
                while index < lines.count {
                    let item = lines[index].trimmingCharacters(in: .whitespaces)
                    guard item.hasPrefix("-") else { break }
                    found.append(String(item.dropFirst()))
                    index += 1
                }
            } else {
                let inner = value.hasPrefix("[") && value.hasSuffix("]") ? String(value.dropFirst().dropLast()) : value
                found += inner.split(whereSeparator: { $0 == "," || $0 == " " }).map(String.init)
            }
        }
        return found.map(clean).filter { !$0.isEmpty }.map { "#" + $0 }
    }

    private static func clean(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespaces)
            .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "^#", with: "", options: .regularExpression)
    }

    private static let tagPattern = try! NSRegularExpression(pattern: ##"(?<=^|\s)#([^\s!"#$%&'()*+,.:;<=>?@^`{|}~\[\]\\]+)"##, options: [.anchorsMatchLines])

    private static func bodyTags(_ body: String) -> [String] {
        var text = ""
        var fenced = false
        for line in body.components(separatedBy: "\n") {
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") || line.trimmingCharacters(in: .whitespaces).hasPrefix("~~~") {
                fenced.toggle()
                continue
            }
            if !fenced { text += withoutInlineCode(line) + "\n" }
        }
        let range = NSRange(text.startIndex..., in: text)
        return tagPattern.matches(in: text, range: range).compactMap { match in
            guard let found = Range(match.range(at: 1), in: text) else { return nil }
            let tag = String(text[found])
            return tag.allSatisfy(\.isNumber) ? nil : "#" + tag
        }
    }

    private static func withoutInlineCode(_ line: String) -> String {
        line.replacingOccurrences(of: "`[^`]*`", with: " ", options: .regularExpression)
    }
}

/// The vault's project notes, as the plugin's `VaultProjects` keeps them over Obsidian's metadata cache: every note's tags
/// read once and then note by note, only those changed since; the list kept on the device, so the first screen shows the
/// groups it showed last. A read hands the list as last found and looks again in the background at most every few
/// seconds; `changed` is told when the list itself changes.
public final class VaultProjects: ProjectSource, @unchecked Sendable {
    private let folder: NoteFolder
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
    public init(folder: NoteFolder, remembered: DeviceText = MemoryText(), background: Bool = true, every: TimeInterval = 3) {
        self.folder = folder
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
        lock.lock()
        defer {
            scanning = false
            lastScan = Date()
            lock.unlock()
        }
        guard let scanned else { return false }
        var next: [String: (modified: Date, tags: [String])] = [:]
        for note in scanned {
            if let text = note.text { next[note.path] = (note.modified, NoteTags.of(text)) } else if let kept = known[note.path] { next[note.path] = kept }
        }
        tags = next
        let notes = Self.projects(next.map { ($0.key, $0.value.tags) }, all: scanned.map(\.path), tag: tag)
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

    /// The notes with exactly the project tag (no nested child), by name, each with the shortest link Obsidian writes: its
    /// name when no other note has it, else its path.
    static func projects(_ notes: [(path: String, tags: [String])], all: [String], tag: String) -> [ProjectNote] {
        let wanted = bare(tag)
        guard !wanted.isEmpty else { return [] }
        var names: [String: Int] = [:]
        for path in all { names[name(path).lowercased(), default: 0] += 1 }
        return notes
            .filter { $0.tags.contains { bare($0) == wanted } }
            .map { note in
                let name = name(note.path)
                let link = names[name.lowercased(), default: 0] > 1 ? String(note.path.dropLast(3)) : name
                return ProjectNote(name: name, path: note.path, link: link)
            }
            .sorted { ($0.name.lowercased(), $0.path) < ($1.name.lowercased(), $1.path) }
    }

    private static func bare(_ tag: String) -> String {
        tag.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "^#", with: "", options: .regularExpression).lowercased()
    }

    private static func name(_ path: String) -> String {
        ((path as NSString).lastPathComponent as NSString).deletingPathExtension
    }
}
