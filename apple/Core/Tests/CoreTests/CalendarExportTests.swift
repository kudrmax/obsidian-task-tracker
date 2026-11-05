import Foundation
import Testing
@testable import Core

/// The phone's calendars as a test hands them over.
struct FakeExporter: CalendarExporting {
    let text: String?
    func export(now: Date) async throws -> String? { text }
}

@Suite struct CalendarExportTests {
    static let quiet = "- [ ] Call ⏰ 2026-11-04 10:00"
    static let work = ExportedCalendar(title: "Календарь", calendarId: "ek-work", account: "max@company.ru", color: "#0A84FF")
    let rules = try! PhoneCore(script: Fixtures.phoneScript)
    let notifications = FakeNotifications()

    static func export(_ events: [ExportedEvent]) -> String {
        CalendarExport.text(
            calendars: [work], events: events, from: Fixtures.date(3, 0), to: Fixtures.date(30, 0),
            exportedAt: Fixtures.date(4, 9), device: "iPhone", validUntil: Fixtures.date(11, 9))
    }

    @Test func thePluginReadsWhatTheAppWrites() throws {
        let standup = ExportedEvent(id: "s", title: "Standup", start: Fixtures.date(4, 10, 30), end: Fixtures.date(4, 11), allDay: false, calendarId: "ek-work")
        let meetings = try rules.meetings(
            settingsJSON: "", texts: [nil, Self.export([standup]), nil], from: Fixtures.date(4, 9), to: Fixtures.date(5, 0), now: Fixtures.date(4, 9))
        #expect(meetings == [CalendarEvent(title: "Standup", start: Fixtures.date(4, 10, 30), end: Fixtures.date(4, 11))])
    }

    @Test func aSyncWritesIphoneJsonBeforeItReadsTheMeetings() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        let standup = ExportedEvent(id: "s", title: "Standup", start: Fixtures.date(4, 10, 30), end: Fixtures.date(4, 11), allDay: false, calendarId: "ek-work")
        let sync = ReminderSync(vault: vault, rules: rules, notifications: notifications, alarms: FakeAlarms(), calendar: FakeExporter(text: Self.export([standup])), now: { Fixtures.date(4, 9) })
        _ = await sync.sync()
        #expect(vault.files["calendar/iphone.json"] == Self.export([standup]))
        let first = await notifications.pendingIDs.values.first { $0.fire == Fixtures.date(4, 10) }
        #expect(first?.after?.title == "After Standup (1 hour)")
    }

    @Test func noCalendarAccessLeavesTheFileAloneAndSetsTheRemindersAllTheSame() async {
        let vault = FakeVault(Fixtures.file(Self.quiet))
        vault.files["calendar/iphone.json"] = "kept"
        let status = await ReminderSync(vault: vault, rules: rules, notifications: notifications, alarms: FakeAlarms(), calendar: FakeExporter(text: nil), now: { Fixtures.date(4, 9) }).sync()
        #expect(status == .ok(reminders: 1, at: Fixtures.date(4, 9)))
        #expect(vault.files["calendar/iphone.json"] == "kept")
    }
}
