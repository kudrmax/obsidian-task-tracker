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
    /// The calendar files as the settings last read name them: asked again when the settings change.
    private var calendarSources: (settings: String, files: [CalendarFile])?
    /// How this device groups its lists by project, as the door last answered it.
    private let grouping: GroupingStore
    private let notes = NoteIndex()
    /// The vault's projects (`notes.projects`) as JSON, and the settings they were found by.
    private var projects: (settings: String, json: String)?

    /// `pure`: a second core for the pure rules a screen asks in the same frame; the reading core when none is given.
    /// `grouping`: where the device keeps its grouping by project; the door's defaults while the process runs when none.
    public init(core: PhoneCore, vault: TasksVault, pure: PhoneCore? = nil, grouping: GroupingStore = MemoryGrouping()) {
        self.core = core
        self.pure = pure ?? core
        self.vault = vault
        self.grouping = grouping
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
    }

    private func answer(_ method: String, _ arguments: [JSONValue], _ files: BoardFiles, on lane: PhoneCore? = nil) throws -> Answer {
        let projects = lane == nil ? projectsJSON(files.settingsJSON) : nil
        let context = DoorContext(tasks: files.tasks, settingsJSON: files.settingsJSON, now: files.now, calendars: files.calendars, fetched: [], history: kept(), groupingJSON: grouping.load(), projectsJSON: projects)
        do {
            let reply = try (lane ?? core).call(method, arguments.map(\.any), context: context)
            if let changed = reply.groupingJSON { grouping.save(changed) }
            return Answer(result: JSONValue(any: reply.result), tasks: reply.tasks, settings: reply.settingsJSON, history: reply.history)
        } catch PhoneCoreError.refused(let code, let message) {
            throw BoardError.refused(code: code, message: message)
        } catch PhoneCoreError.scriptFailed(let message) {
            throw BoardError.failed(message)
        }
    }

    // MARK: Projects and notes

    /// The vault's files listed again and the tags of the notes changed since read: a note tagged or untagged as a project
    /// elsewhere shows on the next read. Call it when the app comes back to the screen.
    public func refreshNotes() {
        notes.refresh(vault: vault, core: core)
        lock.withLock { projects = nil }
    }

    /// The project notes handed in with every call (`context.projects`), found by the settings' project tag.
    private func projectsJSON(_ settings: String) -> String? {
        if !notes.hasRead { notes.refresh(vault: vault, core: core) }
        if let kept = lock.withLock({ projects }), kept.settings == settings { return kept.json }
        let context = DoorContext(tasks: nil, settingsJSON: settings, now: Date())
        guard let found = try? core.call("notes.projects", [notes.notes.any], context: context).result, let json = try? PhoneCore.json(found) else { return nil }
        lock.withLock { projects = (settings, json) }
        return json
    }

    /// The project notes by name, as the Project row offers them.
    public func projectNotes() throws -> [NoteLink] {
        guard let json = projectsJSON(lastSettings()) else { return [] }
        return try JSONDecoder().decode([NoteLink].self, from: Data(json.utf8))
    }

    /// The device's grouping by project (`GroupingState` as JSON): `nil` for the door's defaults.
    public var groupingJSON: String? { grouping.load() }

    /// Group by project in a list's title menu: on or off for `list` (`backlog`, `soon`) on this device.
    public func setGrouping(_ list: String, on: Bool) throws {
        try write("tasks.setGrouping", [.string(list), .bool(on)])
    }

    /// A project group's chevron: folds or unfolds the group of `key` (`ProjectGroup.key`) in `list`.
    public func toggleFold(_ list: String, key: String) throws {
        try write("tasks.toggleFold", [.string(list), .string(key)])
    }

    /// The `[[` the caret (UTF-16 offset) stands in, typed in a title; `nil` for none.
    public func linkQuery(in text: String, caret: Int) throws -> LinkQuery? {
        try rule("notes.linkQuery", [.string(text), .number(Double(caret))])
    }

    /// The files `[[query` offers, best first.
    public func suggestNotes(_ query: String) throws -> [NoteLink] {
        if !notes.hasRead { notes.refresh(vault: vault, core: core) }
        return try rule("notes.suggest", [.string(query), notes.all])
    }

    /// The title with the picked note's link in place of the `[[` typed, and the caret after it.
    public func insertLink(_ note: NoteLink, in text: String, at query: LinkQuery) throws -> LinkInsert {
        try rule("notes.insert", [.string(text), query.json, .string(note.link)])
    }

    /// The file a note link of a title opens (`TextPart.target`); `nil` for a link to no file of the vault.
    public func noteToOpen(_ target: String) throws -> NoteLink? {
        if !notes.hasRead { notes.refresh(vault: vault, core: core) }
        return try rule("notes.open", [.string(target), notes.all])
    }

    // MARK: Words and sizes

    /// A title in pieces: text, and links drawn in the accent with what a tap opens.
    public func titleParts(_ text: String) throws -> [TextPart] {
        try rule("rules.textParts", [.string(text)])
    }

    /// What every screen reads of the shared settings: the cards' height and gap, the long press, the labels' paint.
    public func screenSettings() throws -> ScreenSettings {
        try read("screenSettings.get", over: settingsOnly())
    }

    /// The list column beside the calendar for the saved share of the width, the divider `dividerWidth` points wide.
    public func listWidths(share: Double, viewWidth: Double, dividerWidth: Double) throws -> ListWidths {
        try rule("rules.listWidths", [.number(share), .number(viewWidth), .number(dividerWidth)])
    }

    /// The divider dragged to make the list `wanted` wide at `speed` points per millisecond (`rules.dividerAt`): brought
    /// slowly near the middle it holds to it.
    public func dividerAt(_ wanted: Double, widths: ListWidths, speed: Double) throws -> DividerStop {
        try rule("rules.dividerAt", [.number(wanted), widths.json, .number(speed)])
    }

    /// The core's name of a key's place in the file (`rules.placeId`): what `TaskItem.place` says of a task read there.
    public func placeId(_ key: TaskKey) throws -> String {
        try rule("rules.placeId", [key.json])
    }

    /// The repeat page's words.
    public func repeatWords() throws -> RepeatWords {
        try rule("rules.constants", as: JSONValue.self)["REPEAT_WORDS"].decode(RepeatWords.self)
    }

    private func sources(_ settings: String) -> [CalendarFile] {
        lock.lock()
        defer { lock.unlock() }
        if let known = calendarSources, known.settings == settings { return known.files }
        guard let files = try? core.calendarFiles(settingsJSON: settings) else { return [] }
        calendarSources = (settings, files)
        return files
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
