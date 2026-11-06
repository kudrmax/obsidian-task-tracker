import Core
import Foundation

/// The one sync of the app, shared by the screen, the notification buttons, the alarm and the background wake-ups.
final class AppServices: Sendable {
    static let shared = AppServices()

    let vault: Vault
    /// The main screen's reads and writes through the core's door.
    let board: TaskBoard
    private let rules: TaskRules
    private let sync: ReminderSync
    private let tasks: TaskCapture

    private init() {
        let rules = Self.rules()
        self.rules = rules
        vault = Vault(bookmarks: UserDefaultsBookmarks(), rule: rules)
        sync = ReminderSync(vault: vault, rules: rules, notifications: UserNotifications(), alarms: Alarms(), cards: Cards(), calendar: PhoneCalendarExport(rules: rules))
        tasks = TaskCapture(vault: vault, rules: rules)
        board = TaskBoard(core: rules, vault: vault, pure: Self.rules())
    }

    /// The lists a new task goes into, by their headings' names, in the order the screen offers them: the first is where Siri's goes.
    func captureLists() -> [CaptureList] {
        (try? rules.captureLists(settingsJSON: vault.settingsJSON())) ?? []
    }

    func capture(list: CaptureList, text: String, recording: Data?, tag: String = "") -> CaptureOutcome {
        tasks.capture(list: list, text: text, recording: recording, tag: tag)
    }

    @discardableResult
    func refresh() async -> SyncStatus {
        LastSync.save(await sync.sync())
    }

    func resetAlarms() async {
        LastSync.save(await sync.resetAlarms())
    }

    func complete(_ reminder: ShownReminder) async {
        report(await sync.complete(reminderID: reminder.id), for: reminder)
    }

    func snooze(_ reminder: ShownReminder, minutes: Int) async {
        report(await sync.snooze(reminderID: reminder.id, minutes: minutes), for: reminder)
    }

    func snooze(_ reminder: ShownReminder, until end: Date) async {
        report(await sync.snooze(reminderID: reminder.id, until: end), for: reminder)
    }

    func silence(_ reminder: ShownReminder) async {
        report(await sync.silence(reminderID: reminder.id), for: reminder)
    }

    private func report(_ status: SyncStatus, for reminder: ShownReminder) {
        LastSync.save(status)
        if case .failed(let reason) = status { UserNotifications.showFailure(reason, of: reminder) }
    }

    private static func rules() -> PhoneCore {
        guard let url = Bundle.main.url(forResource: "task-calendar-phone", withExtension: "js"),
              let script = try? String(contentsOf: url, encoding: .utf8),
              let core = try? PhoneCore(script: script)
        else { fatalError("The plugin's phone module is missing from the app bundle") }
        return core
    }
}

/// A reminder as the person saw it: enough to show it again when a button could not change the file.
struct ShownReminder: Sendable {
    let id: String
    let title: String
    let body: String
    let date: String
}
