import Foundation

/// A small text kept on the device, never synced: what it keeps of the Projects screen, a cache.
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

/// A note of the vault as the `[[` search offers it and a title's link opens it (`notes.suggest`, `notes.open`).
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
