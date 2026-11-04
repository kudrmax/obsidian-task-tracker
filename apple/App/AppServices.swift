import Core
import Foundation

/// The one sync of the app, shared by the screen, the notification buttons, the alarm and the background wake-ups.
final class AppServices: Sendable {
    static let shared = AppServices()

    let vault: Vault
    private let sync: ReminderSync

    private init() {
        vault = Vault(bookmarks: UserDefaultsBookmarks())
        sync = ReminderSync(vault: vault, rules: Self.rules(), notifications: UserNotifications(), alarms: Alarms())
    }

    @discardableResult
    func refresh() async -> SyncStatus {
        LastSync.save(await sync.sync())
    }

    func complete(_ reminder: ShownReminder) async {
        report(await sync.complete(reminderID: reminder.id), for: reminder)
    }

    func snooze(_ reminder: ShownReminder, minutes: Int) async {
        report(await sync.snooze(reminderID: reminder.id, minutes: minutes), for: reminder)
    }

    private func report(_ status: SyncStatus, for reminder: ShownReminder) {
        LastSync.save(status)
        if case .failed(let reason) = status { UserNotifications.showFailure(reason, of: reminder) }
    }

    private static func rules() -> TaskRules {
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
