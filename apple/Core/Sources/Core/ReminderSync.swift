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

/// The reminders' Live Activities, by reminder id: when each starts.
public protocol CardScheduling: Sendable {
    func shown() async -> [String: Date]
    func show(_ reminder: Reminder) async throws
    func remove(_ reminderIDs: [String]) async
}

/// Which tasks get a card: iOS keeps few Live Activities of an app, so the nearest, the started ones first.
public enum CardPlan {
    public static let budget = 5

    public static func plan(_ reminders: [Reminder]) -> [Reminder] {
        var seen = Set<String>()
        let live = reminders.filter { $0.kind == .live && seen.insert($0.id).inserted }
        return Array(live.sorted { $0.start == $1.start ? $0.id < $1.id : $0.start < $1.start }.prefix(budget))
    }
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
        case snoozeUntil(String, Date)
        case silence(String)
        case resetAlarms
    }

    private let vault: TasksVault
    private let rules: TaskRules
    private let notifications: NotificationScheduling
    private let alarms: AlarmScheduling
    private let cards: CardScheduling
    private let now: @Sendable () -> Date
    /// The operation running now: the next one waits for it, so a sync that read the file before a Done was written
    /// never brings the done task's reminders back.
    private var turn: Task<SyncStatus, Never>?

    public init(vault: TasksVault, rules: TaskRules, notifications: NotificationScheduling, alarms: AlarmScheduling, cards: CardScheduling, now: @escaping @Sendable () -> Date = Date.init) {
        self.vault = vault
        self.rules = rules
        self.notifications = notifications
        self.alarms = alarms
        self.cards = cards
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

    /// Moves the task to start once `until` has come: the meeting the notification offered to wait out is over.
    public func snooze(reminderID: String, until: Date) async -> SyncStatus {
        await inTurn(.snoozeUntil(reminderID, until))
    }

    public func silence(reminderID: String) async -> SyncStatus {
        await inTurn(.silence(reminderID))
    }

    /// Every alarm set again from the file: how they ring has changed, and AlarmKit keeps that in each alarm.
    public func resetAlarms() async -> SyncStatus {
        await inTurn(.resetAlarms)
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
        case .snoozeUntil(let id, let until):
            let minutes = max(1, Int((until.timeIntervalSince(now()) / 60).rounded(.up)))
            return await run(.snooze(id, minutes: minutes))
        case .resetAlarms:
            await alarms.cancel(Array(await alarms.scheduled().keys).sorted())
            return await bringUpToDate()
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
            let meetings = self.meetings(until: reminders.map(\.dayEnd).max(), settingsJSON: file.settingsJSON, at: at)
            if let failure = await apply(reminders, meetings: meetings, at: at) {
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

    /// Alarms and cards first, then notifications; one that iOS refuses does not stop the rest. Returns the first refusal.
    private func apply(_ reminders: [Reminder], meetings: [CalendarEvent], at: Date) async -> Error? {
        var failure: Error?
        let byID = Dictionary(reminders.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        let ringing = Dictionary(reminders.filter { $0.kind == .alarm && $0.start > at }.map { ($0.id, $0.start) }, uniquingKeysWith: { first, _ in first })
        let set = await alarms.scheduled()
        await alarms.cancel(set.filter { ringing[$0.key] != $0.value }.map(\.key).sorted())
        for (id, start) in ringing where set[id] != start {
            do { try await alarms.schedule(byID[id]!) } catch { failure = failure ?? error }
        }

        let carded = CardPlan.plan(reminders)
        let wantedCards = Dictionary(carded.map { ($0.id, $0.start) }, uniquingKeysWith: { first, _ in first })
        let shown = await cards.shown()
        await cards.remove(shown.filter { wantedCards[$0.key] != $0.value }.map(\.key).sorted())
        var onCards = Set(shown.filter { wantedCards[$0.key] == $0.value }.keys)
        for reminder in carded where !onCards.contains(reminder.id) {
            // A card iOS refuses is not a failure: the task is told of by a notification instead.
            if (try? await cards.show(reminder)) != nil { onCards.insert(reminder.id) }
        }

        let plan = RepeatPlan.plan(reminders.filter { !onCards.contains($0.id) }, now: at).map { planned in
            planned.offering(AfterEvent.offer(at: planned.fire, before: byID[planned.reminderID]!.dayEnd, among: meetings))
        }
        let wanted = Set(plan.map(\.identifier))
        let pending = await notifications.pending()
        await notifications.removePending(pending.subtracting(wanted).sorted())
        for planned in plan where !pending.contains(planned.identifier) {
            do { try await notifications.schedule(planned, reminder: byID[planned.reminderID]!) } catch { failure = failure ?? error }
        }
        await notifications.removeDelivered(Self.outdated(await notifications.delivered(), of: Set(byID.keys)))
        return failure
    }

    /// The meetings from now to the last reminder's day end, as the plugin's calendar shows them. Meetings that cannot be
    /// read only take the snooze until a meeting away: the reminders are set all the same.
    private func meetings(until end: Date?, settingsJSON: String, at: Date) -> [CalendarEvent] {
        guard let end, let paths = try? rules.calendarFiles(settingsJSON: settingsJSON) else { return [] }
        let texts = paths.map { vault.read(path: $0) }
        return (try? rules.meetings(settingsJSON: settingsJSON, texts: texts, from: at, to: end)) ?? []
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
