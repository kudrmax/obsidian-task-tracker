import Foundation

public struct DeliveredNotification: Equatable, Sendable {
    public let identifier: String
    public let reminderID: String
    public let at: Date

    public init(identifier: String, reminderID: String, at: Date) {
        self.identifier = identifier
        self.reminderID = reminderID
        self.at = at
    }
}

/// The app's own notifications in iOS: planned and already shown.
public protocol NotificationScheduling: Sendable {
    func pending() async -> Set<String>
    func delivered() async -> [DeliveredNotification]
    func schedule(_ notification: PlannedNotification, reminder: Reminder) async throws
    func removePending(_ ids: [String]) async
    func removeDelivered(_ ids: [String]) async
}

/// The app's alarms, by reminder id.
public protocol AlarmScheduling: Sendable {
    func scheduled() async -> [String: Date]
    func schedule(_ reminder: Reminder) async throws
    func cancel(_ reminderIDs: [String]) async
}

public enum SyncStatus: Equatable, Sendable {
    case ok(reminders: Int, at: Date)
    case failed(String)
}

/// Keeps the notifications and alarms equal to the tasks file, and carries out Done and the snoozes.
public actor ReminderSync {
    static let actionFailed = "Не получилось — открой Obsidian"

    private let vault: TasksVault
    private let rules: TaskRules
    private let notifications: NotificationScheduling
    private let alarms: AlarmScheduling
    private let now: @Sendable () -> Date

    public init(vault: TasksVault, rules: TaskRules, notifications: NotificationScheduling, alarms: AlarmScheduling, now: @escaping @Sendable () -> Date = Date.init) {
        self.vault = vault
        self.rules = rules
        self.notifications = notifications
        self.alarms = alarms
        self.now = now
    }

    public func sync() async -> SyncStatus {
        let at = now()
        do {
            let file = try vault.read()
            let reminders = try rules.reminders(text: file.tasks, settingsJSON: file.settingsJSON, now: at)
            try await apply(reminders, at: at)
            return .ok(reminders: Set(reminders.map(\.id)).count, at: at)
        } catch {
            return .failed(Self.message(error))
        }
    }

    public func complete(reminderID: String) async -> SyncStatus {
        await act { [rules] text, settings, at in try rules.complete(id: reminderID, text: text, settingsJSON: settings, now: at) }
    }

    public func snooze(reminderID: String, minutes: Int) async -> SyncStatus {
        await act { [rules] text, settings, at in try rules.snooze(id: reminderID, minutes: minutes, text: text, settingsJSON: settings, now: at) }
    }

    private func act(_ rule: (String, String, Date) throws -> ActionResult) async -> SyncStatus {
        do {
            // A second try reads again: the file may have changed between the read and the write.
            for _ in 0..<2 {
                let file = try vault.read()
                guard case .changed(let text) = try rule(file.tasks, file.settingsJSON, now()) else { return await sync() }
                if try vault.write(tasks: text, expecting: file.tasks) { return await sync() }
            }
            return .failed(Self.actionFailed)
        } catch let error as VaultError {
            return .failed(Self.message(error))
        } catch {
            return .failed(Self.actionFailed)
        }
    }

    private func apply(_ reminders: [Reminder], at: Date) async throws {
        let byID = Dictionary(reminders.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let plan = RepeatPlan.plan(reminders, now: at)
        let wanted = Set(plan.map(\.identifier))
        let pending = await notifications.pending()
        await notifications.removePending(pending.subtracting(wanted).sorted())
        for planned in plan where !pending.contains(planned.identifier) {
            try await notifications.schedule(planned, reminder: byID[planned.reminderID]!)
        }
        await notifications.removeDelivered(Self.outdated(await notifications.delivered(), of: Set(byID.keys)))

        let ringing = Dictionary(reminders.filter { $0.kind == .alarm && $0.start > at }.map { ($0.id, $0.start) }, uniquingKeysWith: { first, _ in first })
        let set = await alarms.scheduled()
        await alarms.cancel(set.filter { ringing[$0.key] != $0.value }.map(\.key).sorted())
        for (id, start) in ringing where set[id] != start {
            try await alarms.schedule(byID[id]!)
        }
    }

    /// Shown notifications to take away: those of reminders that are gone, and all but the latest of each reminder.
    private static func outdated(_ delivered: [DeliveredNotification], of reminders: Set<String>) -> [String] {
        Dictionary(grouping: delivered, by: \.reminderID).flatMap { id, shown -> [String] in
            guard reminders.contains(id) else { return shown.map(\.identifier) }
            let latest = shown.max { $0.at < $1.at }
            return shown.filter { $0 != latest }.map(\.identifier)
        }
    }

    private static func message(_ error: Error) -> String {
        switch error {
        case VaultError.noAccess: "Нет доступа к папке vault: выбери её в приложении"
        case VaultError.tasksFileMissing(let path): "Нет файла задач «\(path)» в папке vault"
        case PhoneCoreError.scriptFailed(let reason): "Не удалось разобрать файл задач: \(reason)"
        default: "Не удалось прочитать файл задач: \(error.localizedDescription)"
        }
    }
}
