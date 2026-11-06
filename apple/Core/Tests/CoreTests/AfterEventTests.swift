import Foundation
import Testing
@testable import Core

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
        #expect(offer == AfterEvent(meeting: "Standup", left: "1 h 30 min", until: Fixtures.date(4, 11, 30)))
    }

    @Test func aMeetingUnderWayCountsAsTheNext() {
        let offer = AfterEvent.offer(at: Fixtures.date(4, 10), before: Self.dayEnd, among: [
            Self.meeting("Standup", Fixtures.date(4, 10, 30), Fixtures.date(4, 11)),
            Self.meeting("Planning", Fixtures.date(4, 9), Fixtures.date(4, 10, 45)),
        ])
        #expect(offer == AfterEvent(meeting: "Planning", left: "45 min", until: Fixtures.date(4, 10, 45)))
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

    /// The work calendar's file as Scriptable writes it, with `events` in it.
    static func workFile(_ events: [CalendarEvent]) -> String {
        let iso = ISO8601DateFormatter()
        let rows = events.map { #"{"id":"\#($0.title)","title":"\#($0.title)","start":"\#(iso.string(from: $0.start))","end":"\#(iso.string(from: $0.end))","allDay":false,"calendar":"Work"}"# }
        return #"{"exportedAt":"2026-11-04T08:00:00Z","events":[\#(rows.joined(separator: ","))]}"#
    }

    func sync(_ vault: FakeVault, _ events: [CalendarEvent], at now: Date) -> ReminderSync {
        vault.files["calendar/work.json"] = Self.workFile(events)
        return ReminderSync(vault: vault, rules: rules, notifications: notifications, alarms: FakeAlarms(), cards: FakeCards(), now: { now })
    }

    @Test func eachDeliveryOffersTheMeetingAsItStandsThen() async {
        let standup = CalendarEvent(title: "Standup", start: Fixtures.date(4, 10, 30), end: Fixtures.date(4, 11))
        _ = await sync(FakeVault(Fixtures.file(Self.quiet)), [standup], at: Fixtures.date(4, 9)).sync()
        let planned = await notifications.pendingIDs.values
        let first = planned.first { $0.fire == Fixtures.date(4, 10) }
        let afterIt = planned.first { $0.fire == Fixtures.date(4, 11, 15) }
        #expect(first?.after == AfterEvent(meeting: "Standup", left: "1 hour", until: Fixtures.date(4, 11)))
        #expect(afterIt != nil && afterIt?.after == nil)
    }

    @Test func aCardOffersTheMeetingAsItStandsAtTheTasksStart() async {
        let cards = FakeCards()
        let vault = FakeVault(Fixtures.file("- [ ] Pay 📌 2026-11-04 10:00"))
        vault.files["calendar/work.json"] = Self.workFile([CalendarEvent(title: "Standup", start: Fixtures.date(4, 10, 30), end: Fixtures.date(4, 11))])
        _ = await ReminderSync(vault: vault, rules: rules, notifications: notifications, alarms: FakeAlarms(), cards: cards, now: { Fixtures.date(4, 9) }).sync()
        #expect(await cards.meetings["- [ ] Pay 📌 2026-11-04 10:00"] == AfterEvent(meeting: "Standup", left: "1 hour", until: Fixtures.date(4, 11)))
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

    @Test func aClosedTaskLosesTheDeliveriesThatOfferAMeeting() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        let standup = CalendarEvent(title: "Standup", start: Fixtures.date(4, 10, 30), end: Fixtures.date(4, 11))
        _ = await sync(vault, [standup], at: Fixtures.date(4, 9)).sync()
        #expect(await notifications.pendingIDs.values.contains { $0.after != nil })
        vault.text = Fixtures.file("- [x] Call ⏰ 2026-11-04 10:00")
        _ = await sync(vault, [standup], at: Fixtures.date(4, 9)).sync()
        #expect(await notifications.pendingIDs.isEmpty)
    }

    @Test func googleMeetingsCountAndTheWorkFilterApplies() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        vault.files["calendar/google.json"] = #"{"exportedAt":"2026-11-04T08:00:00Z","events":[{"id":"g","title":"Lunch","start":"\#(ISO8601DateFormatter().string(from: Fixtures.date(4, 10, 30)))","end":"\#(ISO8601DateFormatter().string(from: Fixtures.date(4, 11)))","allDay":false,"calendar":"Personal"}]}"#
        _ = await ReminderSync(vault: vault, rules: rules, notifications: notifications, alarms: FakeAlarms(), cards: FakeCards(), now: { Fixtures.date(4, 9) }).sync()
        let first = await notifications.pendingIDs.values.first { $0.fire == Fixtures.date(4, 10) }
        #expect(first?.after?.title == "After Lunch (1 hour)")
    }

    @Test func noCalendarFilesNoOffer() async {
        _ = await ReminderSync(vault: FakeVault(Fixtures.file(Self.quiet)), rules: rules, notifications: notifications, alarms: FakeAlarms(), cards: FakeCards(), now: { Fixtures.date(4, 9) }).sync()
        let first = await notifications.pendingIDs.values.first { $0.fire == Fixtures.date(4, 10) }
        #expect(first != nil && first?.after == nil)
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
