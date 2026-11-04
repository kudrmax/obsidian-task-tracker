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
    /// Says why the reminders could not be brought up to date, or takes that away (`nil`) once they are.
    func showProblem(_ reason: String?) async
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
    static let actionFailed = "Didn't work — open Obsidian"

    private enum Operation: Sendable {
        case sync
        case complete(String)
        case snooze(String, minutes: Int)
        case silence(String)
    }

    private let vault: TasksVault
    private let rules: TaskRules
    private let notifications: NotificationScheduling
    private let alarms: AlarmScheduling
    private let now: @Sendable () -> Date
    /// The operation running now: the next one waits for it, so a sync that read the file before a Done was written
    /// never brings the done task's reminders back.
    private var turn: Task<SyncStatus, Never>?

    public init(vault: TasksVault, rules: TaskRules, notifications: NotificationScheduling, alarms: AlarmScheduling, now: @escaping @Sendable () -> Date = Date.init) {
        self.vault = vault
        self.rules = rules
        self.notifications = notifications
        self.alarms = alarms
        self.now = now
    }

    public func sync() async -> SyncStatus {
        await inTurn(.sync)
    }

    public func complete(reminderID: String) async -> SyncStatus {
        await inTurn(.complete(reminderID))
    }

    public func snooze(reminderID: String, minutes: Int) async -> SyncStatus {
        await inTurn(.snooze(reminderID, minutes: minutes))
    }

    public func silence(reminderID: String) async -> SyncStatus {
        await inTurn(.silence(reminderID))
    }

    private func inTurn(_ operation: Operation) async -> SyncStatus {
        let previous = turn
        let mine = Task {
            _ = await previous?.value
            return await run(operation)
        }
        turn = mine
        return await mine.value
    }

    private func run(_ operation: Operation) async -> SyncStatus {
        switch operation {
        case .sync:
            return await bringUpToDate()
        case .complete(let id):
            return await act { [rules] text, settings, at in try rules.complete(id: id, text: text, settingsJSON: settings, now: at) }
        case .snooze(let id, let minutes):
            return await act { [rules] text, settings, at in try rules.snooze(id: id, minutes: minutes, text: text, settingsJSON: settings, now: at) }
        case .silence(let id):
            return await act { [rules] text, settings, at in try rules.silence(id: id, text: text, settingsJSON: settings, now: at) }
        }
    }

    private func bringUpToDate() async -> SyncStatus {
        let at = now()
        let status: SyncStatus
        do {
            let file = try vault.read()
            let reminders = try rules.reminders(text: file.tasks, settingsJSON: file.settingsJSON, now: at)
            if let failure = await apply(reminders, at: at) {
                status = .failed("Some reminders weren't set: \(failure.localizedDescription)")
            } else {
                status = .ok(reminders: Set(reminders.map(\.id)).count, at: at)
            }
        } catch {
            status = .failed(Self.message(error))
        }
        if case .failed(let reason) = status { await notifications.showProblem(reason) } else { await notifications.showProblem(nil) }
        return status
    }

    private func act(_ rule: (String, String, Date) throws -> ActionResult) async -> SyncStatus {
        do {
            // A second try reads again: the file may have changed between the read and the write.
            for _ in 0..<2 {
                let file = try vault.read()
                guard case .changed(let text) = try rule(file.tasks, file.settingsJSON, now()) else { return await bringUpToDate() }
                if try vault.write(tasks: text, expecting: file.tasks) { return await bringUpToDate() }
            }
            return .failed(Self.actionFailed)
        } catch let error as VaultError {
            return .failed(Self.message(error))
        } catch {
            return .failed(Self.actionFailed)
        }
    }

    /// Alarms first, then notifications; one that iOS refuses does not stop the rest. Returns the first refusal.
    private func apply(_ reminders: [Reminder], at: Date) async -> Error? {
        var failure: Error?
        let byID = Dictionary(reminders.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        let ringing = Dictionary(reminders.filter { $0.kind == .alarm && $0.start > at }.map { ($0.id, $0.start) }, uniquingKeysWith: { first, _ in first })
        let set = await alarms.scheduled()
        await alarms.cancel(set.filter { ringing[$0.key] != $0.value }.map(\.key).sorted())
        for (id, start) in ringing where set[id] != start {
            do { try await alarms.schedule(byID[id]!) } catch { failure = failure ?? error }
        }

        let plan = RepeatPlan.plan(reminders, now: at)
        let wanted = Set(plan.map(\.identifier))
        let pending = await notifications.pending()
        await notifications.removePending(pending.subtracting(wanted).sorted())
        for planned in plan where !pending.contains(planned.identifier) {
            do { try await notifications.schedule(planned, reminder: byID[planned.reminderID]!) } catch { failure = failure ?? error }
        }
        await notifications.removeDelivered(Self.outdated(await notifications.delivered(), of: Set(byID.keys)))
        return failure
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
        case VaultError.noAccess: "No access to the vault folder: choose it in the app"
        case VaultError.tasksFileMissing(let path): "No tasks file “\(path)” in the vault folder"
        case PhoneCoreError.scriptFailed(let reason): "Couldn't read the tasks: \(reason)"
        default: "Couldn't read the tasks file: \(error.localizedDescription)"
        }
    }
}
