import Foundation

/// The files a screen reads at one moment: what every call of one drawing is made over.
public struct BoardFiles: Sendable {
    public let tasks: String?
    public let settingsJSON: String
    public let calendars: [String: String]
    public let now: Date
}

public enum BoardError: Error, Equatable {
    /// The door refused the call: its code (`staleTask`, `tasksFileMissing`, `blank`, …) and message.
    case refused(code: String, message: String)
    case noAccess
    case noTasksFile
    /// The file changed under the write twice over.
    case busy
    case failed(String)
}

/// The main screen's way to the core: it reads the vault's files, asks the door (`docs/door.md`) and writes back what an
/// answer changed, keeping the undo steps between calls as the door hands them.
public final class TaskBoard: @unchecked Sendable {
    private let core: PhoneCore
    /// The pure rules' own JavaScript context: a gap or a snap asked while a finger moves never waits for a read.
    private let pure: PhoneCore
    private let vault: TasksVault
    private let lock = NSLock()
    /// One write at a time: each is made over the file and the undo steps the one before it left.
    private let writing = NSLock()
    private var history: DoorHistory?
    private var calendarSources: [CalendarFile]?
    /// How this device groups its lists by project (`GroupingState`), as the door last answered it.
    private let grouping: DeviceText
    private let projects: ProjectSource?
    /// The project notes as last found, as the door's context takes them.
    private var projectsJSON: String?
    /// The project tag of the settings last read, and the settings it was read from.
    private var projectTag: (settings: String, tag: String)?

    /// `pure`: a second core for the pure rules a screen asks in the same frame; the reading core when none is given.
    /// `grouping`: where the device keeps how it groups its lists by project; `projects`: who finds the project notes.
    public init(core: PhoneCore, vault: TasksVault, pure: PhoneCore? = nil, grouping: DeviceText = MemoryText(), projects: ProjectSource? = nil) {
        self.core = core
        self.pure = pure ?? core
        self.vault = vault
        self.grouping = grouping
        self.projects = projects
    }

    /// The vault's files as they are now.
    public func files(now: Date = Date()) throws -> BoardFiles {
        let settings = vault.settingsJSON()
        lock.lock()
        settingsSeen = settings
        lock.unlock()
        let tasks: String?
        do {
            tasks = try vault.read().tasks
        } catch VaultError.tasksFileMissing {
            tasks = nil
        } catch VaultError.noAccess {
            throw BoardError.noAccess
        } catch VaultError.noTasksFile {
            throw BoardError.noTasksFile
        }
        findProjects(settings)
        var calendars: [String: String] = [:]
        for file in sources(settings) {
            if let text = vault.read(path: file.path) { calendars[file.source] = text }
        }
        return BoardFiles(tasks: tasks, settingsJSON: settings, calendars: calendars, now: now)
    }

    /// A read over `files`: nothing is written but the tidying a read does, which the next write carries along.
    public func read(_ method: String, _ arguments: [JSONValue] = [], over files: BoardFiles) throws -> JSONValue {
        try answer(method, arguments, files).result
    }

    public func read<T: Decodable>(_ method: String, _ arguments: [JSONValue] = [], over files: BoardFiles, as type: T.Type = T.self) throws -> T {
        try read(method, arguments, over: files).decode(T.self)
    }

    /// The settings alone, for a call that reads no file (a task's menu).
    public func settingsOnly(now: Date = Date()) -> BoardFiles {
        BoardFiles(tasks: nil, settingsJSON: vault.settingsJSON(), calendars: [:], now: now)
    }

    /// A pure rule (`rules.*`) on its own context: made over no file, never waiting for a read on another thread.
    public func rule<T: Decodable>(_ method: String, _ arguments: [JSONValue] = [], as type: T.Type = T.self) throws -> T {
        try answer(method, arguments, BoardFiles(tasks: nil, settingsJSON: "", calendars: [:], now: Date()), on: pure).result.decode(T.self)
    }

    /// A quick entry's call (`entry.*`), on the pure rules' context over the settings as last read: it reads no file, so a
    /// keystroke never waits for a read.
    public func entry(_ method: String, _ arguments: [JSONValue]) throws -> JSONValue {
        let files = BoardFiles(tasks: nil, settingsJSON: lastSettings(), calendars: [:], now: Date())
        return try answer("entry." + method, arguments, files, on: pure).result
    }

    private var settingsSeen: String?

    private func lastSettings() -> String {
        lock.lock()
        let seen = settingsSeen
        lock.unlock()
        if let seen { return seen }
        let read = vault.settingsJSON()
        lock.lock()
        settingsSeen = read
        lock.unlock()
        return read
    }

    /// A pure rule asked by a read on its own thread, on the reading core.
    func readRule<T: Decodable>(_ method: String, _ arguments: [JSONValue] = [], as type: T.Type = T.self) throws -> T {
        try answer(method, arguments, BoardFiles(tasks: nil, settingsJSON: "", calendars: [:], now: Date())).result.decode(T.self)
    }

    /// A call that may write: the tasks file's new text is written only over the text it was made from; when the file
    /// changed in between, the call is made again over the file as it now is. The answer's result.
    @discardableResult
    public func write(_ method: String, _ arguments: [JSONValue] = []) throws -> JSONValue {
        writing.lock()
        defer { writing.unlock() }
        for _ in 0..<2 {
            let files = try files()
            let reply = try answer(method, arguments, files)
            if let settings = reply.settings { try vault.write(path: try core.settingsFile(), text: settings) }
            if let kept = reply.grouping { grouping.save(kept) }
            guard let tasks = reply.tasks else {
                keep(reply.history)
                return reply.result
            }
            if let old = files.tasks {
                guard try vault.write(tasks: tasks, expecting: old) else { continue }
            } else {
                try vault.write(path: try vault.tasksFilePath(), text: tasks)
            }
            keep(reply.history)
            return reply.result
        }
        throw BoardError.busy
    }

    public func write<T: Decodable>(_ method: String, _ arguments: [JSONValue] = [], as type: T.Type) throws -> T {
        try write(method, arguments).decode(T.self)
    }

    /// The settings' new `data.json`, as an answer of `settings.*` gives it; none for a value the core refused.
    public func writeSettings(_ method: String, _ arguments: [JSONValue] = []) throws {
        let reply = try answer(method, arguments, try files())
        if let settings = reply.settings { try vault.write(path: try core.settingsFile(), text: settings) }
    }

    public var canUndo: Bool {
        (try? answer("history.canUndo", [], BoardFiles(tasks: nil, settingsJSON: "", calendars: [:], now: Date())).result.bool) ?? false
    }

    private struct Answer {
        let result: JSONValue
        let tasks: String?
        let settings: String?
        let history: DoorHistory?
        let grouping: String?
    }

    private func answer(_ method: String, _ arguments: [JSONValue], _ files: BoardFiles, on lane: PhoneCore? = nil) throws -> Answer {
        let context = DoorContext(tasks: files.tasks, settingsJSON: files.settingsJSON, now: files.now, calendars: files.calendars, fetched: [], history: kept(), groupingJSON: grouping.load(), projectsJSON: foundProjects())
        do {
            let reply = try (lane ?? core).call(method, arguments.map(\.any), context: context)
            return Answer(result: JSONValue(any: reply.result), tasks: reply.tasks, settings: reply.settingsJSON, history: reply.history, grouping: reply.groupingJSON)
        } catch PhoneCoreError.refused(let code, let message) {
            throw BoardError.refused(code: code, message: message)
        } catch PhoneCoreError.scriptFailed(let message) {
            throw BoardError.failed(message)
        }
    }

    /// A call that changes only how this device groups its lists (`tasks.setGrouping`, `tasks.toggleFold`): the answer's
    /// grouping is kept, nothing is written to the vault.
    public func group(_ method: String, _ arguments: [JSONValue]) throws {
        let reply = try answer(method, arguments, settingsOnly())
        if let kept = reply.grouping { grouping.save(kept) }
    }

    /// The project notes for the settings' project tag (`settings.form`), as the context hands them to the door.
    private func findProjects(_ settings: String) {
        guard let projects else { return }
        lock.lock()
        let known = projectTag?.settings == settings ? projectTag?.tag : nil
        lock.unlock()
        let tag = known ?? ((try? core.call("settings.form", [], context: DoorContext(tasks: nil, settingsJSON: settings, now: Date())).result as? [String: Any])?["projectTag"] as? String) ?? ""
        let notes = projects.notes(tag: tag)
        let json = try? String(decoding: JSONEncoder().encode(notes), as: UTF8.self)
        lock.lock()
        projectTag = (settings, tag)
        projectsJSON = json
        lock.unlock()
    }

    private func foundProjects() -> String? {
        lock.lock()
        defer { lock.unlock() }
        return projectsJSON
    }

    private func sources(_ settings: String) -> [CalendarFile] {
        lock.lock()
        defer { lock.unlock() }
        if calendarSources == nil { calendarSources = try? core.calendarFiles(settingsJSON: settings) }
        return calendarSources ?? []
    }

    private func kept() -> DoorHistory? {
        lock.lock()
        defer { lock.unlock() }
        return history
    }

    private func keep(_ next: DoorHistory?) {
        guard let next else { return }
        lock.lock()
        history = next
        lock.unlock()
    }
}
