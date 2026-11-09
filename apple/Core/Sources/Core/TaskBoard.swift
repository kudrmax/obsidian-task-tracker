import Foundation

/// The files a screen reads at one moment: what every call of one drawing is made over.
public struct BoardFiles: Sendable {
    public let tasks: String?
    public let settingsJSON: String
    public let calendars: [String: String]
    public let now: Date
    /// The board's writes made before these files were read: an answer over them tells who the tasks are only while no
    /// write came after.
    let generation: Int

    init(tasks: String?, settingsJSON: String, calendars: [String: String], now: Date, generation: Int = -1) {
        self.tasks = tasks
        self.settingsJSON = settingsJSON
        self.calendars = calendars
        self.now = now
        self.generation = generation
    }
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
    /// Held while the tasks file is read with the count of writes, and while a write puts its text and its ids in.
    private let fileLock = NSLock()
    private var history: DoorHistory?
    /// The calendar files as the settings last read name them: asked again when the settings change.
    private var calendarSources: (settings: String, files: [CalendarFile])?
    /// Who the tasks and sections are, as the last answer over the file gave it: handed in with every call over the file,
    /// so a task keeps its `id` through every write, read and undo (`docs/door.md`, «Ids»).
    private var ids: DoorIds?
    /// The writes made so far: an answer over files read before the last write never replaces the ids that write gave.
    private var generation = 0
    /// How this device groups its lists by project (`GroupingState`), as the door last answered it.
    private let grouping: DeviceText
    private let projects: ProjectSource?
    /// The project notes as last found, as the door's context takes them.
    private var projectsJSON: String?
    /// The project tag of the settings last read, and the settings it was read from.
    private var projectTag: (settings: String, tag: String)?
    /// The vault's files, for the `[[` search and a title's links.
    private let fileList = VaultFileList()

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
        // The file and the count of writes are read together: never a text a write just made with the count from before it.
        fileLock.lock()
        lock.lock()
        settingsSeen = settings
        let generation = generation
        lock.unlock()
        let tasks: String?
        do {
            defer { fileLock.unlock() }
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
        return BoardFiles(tasks: tasks, settingsJSON: settings, calendars: calendars, now: now, generation: generation)
    }

    /// A read over `files`: nothing is written but the tidying a read does, which the next write carries along.
    public func read(_ method: String, _ arguments: [JSONValue] = [], over files: BoardFiles) throws -> JSONValue {
        let reply = try answer(method, arguments, files)
        keep(reply.ids, over: files)
        return reply.result
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
                keep(reply.ids, over: files)
                return reply.result
            }
            // The text and its ids go in together: no read sees the new text with the ids from before it.
            fileLock.lock()
            let written: Bool
            do {
                defer { fileLock.unlock() }
                if let old = files.tasks {
                    written = try vault.write(tasks: tasks, expecting: old)
                } else {
                    try vault.write(path: try vault.tasksFilePath(), text: tasks)
                    written = true
                }
                if written { keepWritten(reply.ids) }
            }
            guard written else { continue }
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
        let ids: DoorIds?
        let grouping: String?
    }

    /// A call over the text a screen was drawn from, on the pure rules' context: no file is read and no read waits.
    /// Its ids are not kept: the board's own reads keep them.
    func answer(_ method: String, _ arguments: [JSONValue], drawnFrom tasks: String?, settingsJSON: String, now: Date) throws -> JSONValue {
        try answer(method, arguments, BoardFiles(tasks: tasks, settingsJSON: settingsJSON, calendars: [:], now: now), on: pure).result
    }

    /// A call over `files` on the pure rules' context, keeping neither the ids nor the undo steps it answers: what a screen
    /// not yet written (a drop's preview) is read from.
    func answerPure(_ method: String, _ arguments: [JSONValue], over files: BoardFiles) throws -> JSONValue {
        try answer(method, arguments, files, on: pure).result
    }

    private func answer(_ method: String, _ arguments: [JSONValue], _ files: BoardFiles, on lane: PhoneCore? = nil) throws -> Answer {
        // Ids name the lines of a file: a call made over none (a menu, a pure rule) neither takes them nor gives them back.
        let ids = files.tasks == nil ? nil : keptIds()
        let context = DoorContext(tasks: files.tasks, settingsJSON: files.settingsJSON, now: files.now, calendars: files.calendars, fetched: [], history: kept(), groupingJSON: grouping.load(), projectsJSON: foundProjects(), ids: ids)
        do {
            let reply = try (lane ?? core).call(method, arguments.map(\.any), context: context)
            return Answer(result: JSONValue(any: reply.result), tasks: reply.tasks, settings: reply.settingsJSON, history: reply.history, ids: files.tasks == nil ? nil : reply.ids, grouping: reply.groupingJSON)
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

    /// The vault's files listed again: a note made or renamed elsewhere is offered by the next `[[`. The project notes
    /// look again on their own (`VaultProjects`).
    public func refreshNotes() {
        fileList.forget()
    }

    // MARK: Notes

    /// The `[[` the caret (UTF-16 offset) stands in, typed in a title; `nil` for none.
    public func linkQuery(in text: String, caret: Int) throws -> LinkQuery? {
        try rule("notes.linkQuery", [.string(text), .number(Double(caret))])
    }

    /// The files `[[query` offers, best first.
    public func suggestNotes(_ query: String) throws -> [ProjectNote] {
        try rule("notes.suggest", [.string(query), fileList.all(vault)])
    }

    /// The title with the picked note's link in place of the `[[` typed, and the caret after it.
    public func insertLink(_ note: ProjectNote, in text: String, at query: LinkQuery) throws -> LinkInsert {
        try rule("notes.insert", [.string(text), query.json, .string(note.link)])
    }

    /// The file a note link of a title opens (`TextPart.target`); `nil` for a link to no file of the vault.
    public func noteToOpen(_ target: String) throws -> ProjectNote? {
        try rule("notes.open", [.string(target), fileList.all(vault)])
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

    /// A day before any calendar file was read: no events, no statuses, no alert.
    public func noDayEvents() throws -> DayEvents {
        try rule("rules.constants", as: JSONValue.self)["NO_DAY_EVENTS"].decode(DayEvents.self)
    }

    /// Where a screen let go after a swipe lands (`rules.swipeLanding`): 1 the next screen on, -1 back, 0 where it stood;
    /// `moved` and `speed` (points per millisecond) count onward as positive, `distance` is how far the next screen stands.
    public func swipeLanding(moved: Double, distance: Double, speed: Double) throws -> Int {
        try rule("rules.swipeLanding", [.number(moved), .number(distance), .number(speed)])
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

    private func keptIds() -> DoorIds? {
        lock.lock()
        defer { lock.unlock() }
        return ids
    }

    /// The ids an answer over `files` gave, unless a write came after those files were read: its ids are newer.
    private func keep(_ next: DoorIds?, over files: BoardFiles) {
        guard let next else { return }
        lock.lock()
        if files.generation == generation { ids = next }
        lock.unlock()
    }

    /// A write's ids: the file now holds the text they name, and every read made before it is older.
    private func keepWritten(_ next: DoorIds?) {
        lock.lock()
        generation += 1
        if let next { ids = next }
        lock.unlock()
    }

    private func keep(_ next: DoorHistory?) {
        guard let next else { return }
        lock.lock()
        history = next
        lock.unlock()
    }
}
