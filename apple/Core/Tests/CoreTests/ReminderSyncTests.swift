import Foundation
import Testing
@testable import Core

final class FakeVault: TasksVault, @unchecked Sendable {
    var text: String
    var writeFails = false
    var readFails: VaultError?
    var changeBeforeWrite: String?
    var files: [String: String] = [:]
    init(_ text: String) { self.text = text }
    func read(path: String) -> String? { files[path] }
    func read() throws -> (tasks: String, settingsJSON: String) {
        if let error = readFails { throw error }
        return (text, "")
    }
    func write(tasks: String, expecting old: String) throws -> Bool {
        if writeFails { throw CocoaError(.fileWriteNoPermission) }
        if let changed = changeBeforeWrite { text = changed; changeBeforeWrite = nil }
        guard text == old else { return false }
        text = tasks
        return true
    }
}

actor FakeNotifications: NotificationScheduling {
    var pendingIDs: [String: PlannedNotification] = [:]
    var deliveredList: [DeliveredNotification] = []
    var calls = 0
    var scheduleFails = false
    var problems: [String?] = []
    private var holdNext = false
    private var held: CheckedContinuation<Void, Never>?
    func pending() async -> Set<String> {
        if holdNext {
            holdNext = false
            await withCheckedContinuation { held = $0 }
        }
        return Set(pendingIDs.keys)
    }
    func delivered() async -> [DeliveredNotification] { deliveredList }
    func schedule(_ n: PlannedNotification, reminder: Reminder) async throws {
        if scheduleFails { throw CocoaError(.featureUnsupported) }
        calls += 1; pendingIDs[n.identifier] = n
    }
    func showProblem(_ reason: String?) async { problems.append(reason) }
    func holdNextPending() { holdNext = true }
    func isHolding() -> Bool { held != nil }
    func release() { held?.resume(); held = nil }
    func failNextSchedules() { scheduleFails = true }
    func removePending(_ ids: [String]) async { if !ids.isEmpty { calls += 1 }; ids.forEach { pendingIDs[$0] = nil } }
    func removeDelivered(_ ids: [String]) async { if !ids.isEmpty { calls += 1 }; deliveredList.removeAll { ids.contains($0.identifier) } }
    func deliver(_ d: DeliveredNotification) { deliveredList.append(d) }
    func reminderIDs() -> Set<String> { Set(pendingIDs.values.map(\.reminderID)) }
}

actor FakeAlarms: AlarmScheduling {
    var alarms: [String: Date] = [:]
    var calls = 0
    func scheduled() async -> [String: Date] { alarms }
    func schedule(_ reminder: Reminder) async throws { calls += 1; alarms[reminder.id] = reminder.start }
    func cancel(_ ids: [String]) async { if !ids.isEmpty { calls += 1 }; ids.forEach { alarms[$0] = nil } }
}

actor FakeCards: CardScheduling {
    var cards: [String: Date] = [:]
    var calls = 0
    var refuse = false
    var ended: [String] = []
    func shown() async -> [String: Date] { cards }
    func lingering() async -> [String] { ended }
    func show(_ reminder: Reminder) async throws {
        if refuse { throw CocoaError(.featureUnsupported) }
        calls += 1; cards[reminder.id] = reminder.start
    }
    func remove(_ ids: [String]) async { if !ids.isEmpty { calls += 1 }; ids.forEach { cards[$0] = nil }; ended.removeAll { ids.contains($0) } }
    func refuseAll() { refuse = true }
    func end(_ id: String) { cards[id] = nil; ended.append(id) }
}

@Suite struct ReminderSyncTests {
    static let quiet = "- [ ] Call ⏰ 2026-11-04 10:00"
    static let alarm = "- [ ] Wake 🚨 2026-11-04 12:00"
    static let pinned = "- [ ] Pay 📌 2026-11-04 11:00"
    let rules = try! PhoneCore(script: Fixtures.phoneScript)
    let notifications = FakeNotifications()
    let alarms = FakeAlarms()
    let cards = FakeCards()

    func sync(_ vault: FakeVault, at now: Date = Fixtures.date(4, 9)) -> ReminderSync {
        ReminderSync(vault: vault, rules: rules, notifications: notifications, alarms: alarms, cards: cards, now: { now })
    }

    @Test func aPinnedTaskGetsACardAlone() async {
        let status = await sync(FakeVault(Fixtures.file(Self.quiet, Self.pinned))).sync()
        #expect(status == .ok(reminders: 2, at: Fixtures.date(4, 9)))
        #expect(await cards.cards == [Self.pinned: Fixtures.date(4, 11)])
        #expect(await notifications.reminderIDs() == [Self.quiet])
        #expect(await alarms.alarms.isEmpty)
    }

    @Test func aCardIsShownOnce() async {
        let s = sync(FakeVault(Fixtures.file(Self.pinned)))
        _ = await s.sync()
        let before = await cards.calls
        _ = await s.sync()
        #expect(await cards.calls == before)
    }

    @Test func aClosedOrMovedTaskTakesItsCardAway() async {
        let vault = FakeVault(Fixtures.file(Self.pinned))
        let s = sync(vault, at: Fixtures.date(4, 11, 5))
        _ = await s.sync()
        _ = await s.snooze(reminderID: Self.pinned, minutes: 30)
        #expect(await cards.cards == ["- [ ] Pay 📌 2026-11-04 11:35": Fixtures.date(4, 11, 35)])
        _ = await s.complete(reminderID: "- [ ] Pay 📌 2026-11-04 11:35")
        #expect(await cards.cards.isEmpty)
    }

    @Test func cardsBeyondTheBudgetNotifyOnceAtTheStart() async {
        let lines = (0..<7).map { "- [ ] Pay\($0) 📌 2026-11-04 1\($0):00" }
        _ = await sync(FakeVault(Fixtures.file(lines))).sync()
        #expect(Set(await cards.cards.keys) == Set(lines.prefix(CardPlan.budget)))
        let planned = await notifications.pendingIDs.values
        #expect(Set(planned.map(\.reminderID)) == Set(lines.dropFirst(CardPlan.budget)))
        #expect(planned.count == lines.count - CardPlan.budget)
        #expect(planned.allSatisfy { $0.identifier.hasSuffix("#0") })
    }

    @Test func aRefusedCardNotifiesOnceInstead() async {
        await cards.refuseAll()
        let status = await sync(FakeVault(Fixtures.file(Self.pinned))).sync()
        #expect(await notifications.pendingIDs.values.map(\.identifier) == ["\(Self.pinned)#0"])
        guard case .ok(_, _, let refused) = status else { Issue.record("not ok"); return }
        #expect(refused != nil)
    }

    @Test func aRefusedCardOfAStartedTaskNotifiesAtOnceAndOnce() async {
        await cards.refuseAll()
        let s = sync(FakeVault(Fixtures.file(Self.pinned)), at: Fixtures.date(4, 11, 20))
        _ = await s.sync()
        let planned = await notifications.pendingIDs.values
        #expect(planned.map(\.identifier) == ["\(Self.pinned)#0"])
        #expect(planned.map(\.fire) == [Fixtures.date(4, 11, 20)])
        await notifications.removePending(["\(Self.pinned)#0"])
        await notifications.deliver(DeliveredNotification(identifier: "\(Self.pinned)#0", reminderID: Self.pinned, at: Fixtures.date(4, 11, 20)))
        _ = await s.sync()
        #expect(await notifications.pendingIDs.isEmpty)
    }

    @Test func comingTasksTakeTheCardsBeforeLongStartedOnes() async {
        let started = (0..<4).map { "- [ ] Old\($0) 📌 2026-11-04 0\($0 + 5):00" }
        let coming = (0..<3).map { "- [ ] New\($0) 📌 2026-11-04 2\($0):00" }
        _ = await sync(FakeVault(Fixtures.file(started + coming)), at: Fixtures.date(4, 12)).sync()
        #expect(Set(await cards.cards.keys) == Set(coming + [started[3], started[2]]))
    }

    @Test func anEndedCardOfADoneTaskIsTakenOffTheLockScreen() async {
        let vault = FakeVault(Fixtures.file(Self.pinned))
        let s = sync(vault, at: Fixtures.date(4, 11, 5))
        _ = await s.sync()
        await cards.end(Self.pinned)
        _ = await s.complete(reminderID: Self.pinned)
        #expect(await cards.ended.isEmpty)
        #expect(await cards.cards.isEmpty)
    }

    @Test func firstSyncPlansNotificationsAndAlarms() async {
        let status = await sync(FakeVault(Fixtures.file(Self.quiet, Self.alarm))).sync()
        #expect(status == .ok(reminders: 2, at: Fixtures.date(4, 9)))
        #expect(await notifications.reminderIDs() == [Self.quiet, Self.alarm])
        #expect(await alarms.alarms == [Self.alarm: Fixtures.date(4, 12)])
    }

    @Test func aSecondSyncChangesNothing() async {
        let s = sync(FakeVault(Fixtures.file(Self.quiet, Self.alarm)))
        _ = await s.sync()
        let before = (await notifications.calls, await alarms.calls)
        _ = await s.sync()
        #expect((await notifications.calls, await alarms.calls) == before)
    }

    @Test func aClosedTaskLosesEverything() async {
        let vault = FakeVault(Fixtures.file(Self.quiet, Self.alarm))
        let s = sync(vault)
        _ = await s.sync()
        await notifications.deliver(DeliveredNotification(identifier: "\(Self.alarm)#1", reminderID: Self.alarm, at: Fixtures.date(4, 8)))
        vault.text = Fixtures.file(Self.quiet, "- [x] Wake 🚨 2026-11-04 12:00")
        _ = await s.sync()
        #expect(await notifications.reminderIDs() == [Self.quiet])
        #expect(await notifications.deliveredList.isEmpty)
        #expect(await alarms.alarms.isEmpty)
    }

    @Test func onlyTheLatestDeliveryStays() async {
        let s = sync(FakeVault(Fixtures.file(Self.quiet)), at: Fixtures.date(4, 10, 3))
        for minute in 0...2 {
            await notifications.deliver(DeliveredNotification(identifier: "\(Self.quiet)#\(minute)", reminderID: Self.quiet, at: Fixtures.date(4, 10, minute)))
        }
        _ = await s.sync()
        #expect(await notifications.deliveredList.map(\.identifier) == ["\(Self.quiet)#2"])
    }

    @Test func completeWritesAndClears() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        let s = sync(vault, at: Fixtures.date(4, 10, 1))
        _ = await s.sync()
        #expect(await s.complete(reminderID: Self.quiet) == .ok(reminders: 0, at: Fixtures.date(4, 10, 1)))
        #expect(vault.text.contains("- [x] Call"))
        #expect(await notifications.pendingIDs.isEmpty)
    }

    @Test func snoozeMovesAndReplans() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        let s = sync(vault, at: Fixtures.date(4, 10, 1))
        _ = await s.sync()
        _ = await s.snooze(reminderID: Self.quiet, minutes: 30)
        #expect(vault.text.contains("- [ ] Call ⏰ 2026-11-04 10:31"))
        #expect(await notifications.reminderIDs() == ["- [ ] Call ⏰ 2026-11-04 10:31"])
    }

    @Test func aStaleActionResyncs() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        let s = sync(vault)
        _ = await s.sync()
        vault.text = Fixtures.file("- [ ] Call ⏰ 2026-11-04 11:00")
        #expect(await s.complete(reminderID: Self.quiet) == .ok(reminders: 1, at: Fixtures.date(4, 9)))
        #expect(await notifications.reminderIDs() == ["- [ ] Call ⏰ 2026-11-04 11:00"])
    }

    @Test func aFileChangedDuringTheActionIsReadAgain() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        vault.changeBeforeWrite = Fixtures.file(Self.quiet, Self.alarm)
        _ = await sync(vault).complete(reminderID: Self.quiet)
        #expect(vault.text.contains("- [x] Call") && vault.text.contains(Self.alarm))
    }

    @Test func aFailedWriteKeepsTheReminder() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        let s = sync(vault)
        _ = await s.sync()
        vault.writeFails = true
        #expect(await s.complete(reminderID: Self.quiet) == .failed("Didn't work — open Obsidian"))
        #expect(await notifications.reminderIDs() == [Self.quiet])
    }

    @Test func noAccessIsSaid() async {
        let s = ReminderSync(vault: Vault(bookmarks: MemoryBookmarks()), rules: rules, notifications: notifications, alarms: alarms, cards: cards, now: { Fixtures.date(4, 9) })
        #expect(await s.sync() == .failed("No access to the vault folder: choose it in the app"))
    }

    @Test func anActionWaitsForASyncAlreadyRunning() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        let s = sync(vault, at: Fixtures.date(4, 10, 1))
        await notifications.holdNextPending()
        let running = Task { await s.sync() }
        while !(await notifications.isHolding()) { await Task.yield() }
        let done = Task { await s.complete(reminderID: Self.quiet) }
        for _ in 0..<200 { await Task.yield() }
        await notifications.release()
        _ = await running.value
        _ = await done.value
        #expect(vault.text.contains("- [x] Call"))
        #expect(await notifications.pendingIDs.isEmpty)
    }

    @Test func oneFailedNotificationLeavesTheAlarmsSet() async {
        await notifications.failNextSchedules()
        let status = await sync(FakeVault(Fixtures.file(Self.quiet, Self.alarm))).sync()
        #expect(await alarms.alarms == [Self.alarm: Fixtures.date(4, 12)])
        guard case .failed(let reason) = status else { Issue.record("expected a failure, got \(status)"); return }
        #expect(reason.hasPrefix("Some reminders weren't set"))
    }

    @Test func aFailedSyncIsShownAndAGoodOneTakesItAway() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        vault.readFails = .noAccess
        let s = sync(vault)
        _ = await s.sync()
        vault.readFails = nil
        _ = await s.sync()
        #expect(await notifications.problems == ["No access to the vault folder: choose it in the app", nil])
    }

    @Test func silenceKeepsTheTimeAndClearsTheReminders() async {
        let vault = FakeVault(Fixtures.file(Self.alarm))
        let s = sync(vault, at: Fixtures.date(4, 11))
        _ = await s.sync()
        #expect(await s.silence(reminderID: Self.alarm) == .ok(reminders: 0, at: Fixtures.date(4, 11)))
        #expect(vault.text.contains("- [ ] Wake 🔕 2026-11-04 12:00"))
        #expect(await alarms.alarms.isEmpty)
        #expect(await notifications.pendingIDs.isEmpty)
    }

    @Test func alarmsAreSetAgainWhenHowTheyRingChanged() async {
        let s = sync(FakeVault(Fixtures.file(Self.quiet, Self.alarm)))
        _ = await s.sync()
        let before = await alarms.calls
        #expect(await s.resetAlarms() == .ok(reminders: 2, at: Fixtures.date(4, 9)))
        #expect(await alarms.calls == before + 2)
        #expect(await alarms.alarms == [Self.alarm: Fixtures.date(4, 12)])
    }
}

