import Foundation
import Testing
@testable import Core

struct FakeCalendar: CalendarEvents {
    let list: [CalendarEvent]
    func events(from: Date, to: Date) async -> [CalendarEvent] { list.filter { $0.end > from && $0.start < to } }
}

@Suite struct AfterEventTests {
    static let dayEnd = Fixtures.date(5, 5)

    static func meeting(_ title: String, _ start: Date, _ end: Date) -> CalendarEvent {
        CalendarEvent(title: title, start: start, end: end)
    }

    @Test func theNextMeetingIsWaitedOutToItsEnd() {
        let offer = AfterEvent.offer(at: Fixtures.date(4, 10), before: Self.dayEnd, among: [
            Self.meeting("Retro", Fixtures.date(4, 15), Fixtures.date(4, 16)),
            Self.meeting("Standup", Fixtures.date(4, 10, 30), Fixtures.date(4, 11, 30)),
        ])
        #expect(offer == AfterEvent(title: "After Standup (1 h 30 min)", until: Fixtures.date(4, 11, 30)))
    }

    @Test func aMeetingUnderWayCountsAsTheNext() {
        let offer = AfterEvent.offer(at: Fixtures.date(4, 10), before: Self.dayEnd, among: [
            Self.meeting("Standup", Fixtures.date(4, 10, 30), Fixtures.date(4, 11)),
            Self.meeting("Planning", Fixtures.date(4, 9), Fixtures.date(4, 10, 45)),
        ])
        #expect(offer == AfterEvent(title: "After Planning (45 min)", until: Fixtures.date(4, 10, 45)))
    }

    @Test func aMeetingAlreadyOverIsNotOffered() {
        let offer = AfterEvent.offer(at: Fixtures.date(4, 10), before: Self.dayEnd, among: [
            Self.meeting("Standup", Fixtures.date(4, 9), Fixtures.date(4, 10)),
        ])
        #expect(offer == nil)
    }

    @Test func noMeetingLeftInTheDayOffersNothing() {
        let offer = AfterEvent.offer(at: Fixtures.date(4, 22), before: Self.dayEnd, among: [
            Self.meeting("Standup", Fixtures.date(5, 10), Fixtures.date(5, 10, 30)),
            Self.meeting("Late call", Fixtures.date(5, 4), Fixtures.date(5, 6)),
        ])
        #expect(offer == nil)
    }

    @Test func wholeHoursAreSaidInHours() {
        let one = AfterEvent.offer(at: Fixtures.date(4, 10), before: Self.dayEnd, among: [Self.meeting("A", Fixtures.date(4, 10, 30), Fixtures.date(4, 11))])
        let two = AfterEvent.offer(at: Fixtures.date(4, 10), before: Self.dayEnd, among: [Self.meeting("A", Fixtures.date(4, 11), Fixtures.date(4, 12))])
        #expect(one?.title == "After A (1 hour)")
        #expect(two?.title == "After A (2 hours)")
    }

    @Test func aLongNameIsCutSoTheTimeStaysSeen() {
        let offer = AfterEvent.offer(at: Fixtures.date(4, 10), before: Self.dayEnd, among: [
            Self.meeting("Quarterly planning with the whole design team", Fixtures.date(4, 10), Fixtures.date(4, 10, 20)),
        ])
        #expect(offer?.title == "After Quarterly planning with… (20 min)")
    }

    @Test func aMeetingWithoutANameIsAMeeting() {
        let offer = AfterEvent.offer(at: Fixtures.date(4, 10), before: Self.dayEnd, among: [Self.meeting(" ", Fixtures.date(4, 10), Fixtures.date(4, 10, 20))])
        #expect(offer?.title == "After Meeting (20 min)")
    }
}

@Suite struct AfterEventSyncTests {
    static let quiet = "- [ ] Call ⏰ 2026-11-04 10:00"
    let rules = try! PhoneCore(script: Fixtures.phoneScript)
    let notifications = FakeNotifications()

    func sync(_ vault: FakeVault, _ events: [CalendarEvent], at now: Date) -> ReminderSync {
        ReminderSync(vault: vault, rules: rules, notifications: notifications, alarms: FakeAlarms(), calendar: FakeCalendar(list: events), now: { now })
    }

    @Test func eachDeliveryOffersTheMeetingAsItStandsThen() async {
        let standup = CalendarEvent(title: "Standup", start: Fixtures.date(4, 10, 30), end: Fixtures.date(4, 11))
        _ = await sync(FakeVault(Fixtures.file(Self.quiet)), [standup], at: Fixtures.date(4, 9)).sync()
        let planned = await notifications.pendingIDs.values
        let first = planned.first { $0.fire == Fixtures.date(4, 10) }
        let afterIt = planned.first { $0.fire == Fixtures.date(4, 11, 15) }
        #expect(first?.after == AfterEvent(title: "After Standup (1 hour)", until: Fixtures.date(4, 11)))
        #expect(afterIt != nil && afterIt?.after == nil)
    }

    @Test func aMovedMeetingSetsTheDeliveriesAgain() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        let standup = CalendarEvent(title: "Standup", start: Fixtures.date(4, 10, 30), end: Fixtures.date(4, 11))
        _ = await sync(vault, [standup], at: Fixtures.date(4, 9)).sync()
        let moved = CalendarEvent(title: "Standup", start: Fixtures.date(4, 10, 30), end: Fixtures.date(4, 11, 30))
        _ = await sync(vault, [moved], at: Fixtures.date(4, 9)).sync()
        let first = await notifications.pendingIDs.values.first { $0.fire == Fixtures.date(4, 10) }
        #expect(first?.after?.until == Fixtures.date(4, 11, 30))
        #expect(await notifications.pendingIDs.values.filter { $0.fire == Fixtures.date(4, 10) }.count == 1)
    }

    @Test func snoozeUntilTheMeetingEndsMovesTheTaskThere() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        let now = Fixtures.date(4, 10, 1).addingTimeInterval(20)
        _ = await sync(vault, [], at: now).snooze(reminderID: Self.quiet, until: Fixtures.date(4, 11, 30))
        #expect(vault.text.contains("- [ ] Call ⏰ 2026-11-04 11:30"))
    }

    @Test func snoozeUntilAMeetingAlreadyOverMovesTheTaskAMinute() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        _ = await sync(vault, [], at: Fixtures.date(4, 12)).snooze(reminderID: Self.quiet, until: Fixtures.date(4, 11, 30))
        #expect(vault.text.contains("- [ ] Call ⏰ 2026-11-04 12:01"))
    }
}
