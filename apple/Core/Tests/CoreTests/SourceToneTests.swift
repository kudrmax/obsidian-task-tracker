import Foundation
import Testing
@testable import Core

/// Each calendar source's tone and the day's alert, as the core codes them and the Calendars screen and «⋯» draw them.
@Suite struct SourceToneTests {
    static let tasks = "## Inbox\n\n## Now\n\n## Soon\n\n## Backlog\n\n## Done\n"
    static let now = Fixtures.date(6, 10)

    let core = try! PhoneCore(script: Fixtures.phoneScript)

    /// A calendar file of one calendar, exported `hoursAgo` before the clock, covering the month.
    static func file(_ calendar: String, hoursAgo: Double) -> String {
        let iso = ISO8601DateFormatter()
        let exported = iso.string(from: now.addingTimeInterval(-hoursAgo * 3600))
        return #"{"exportedAt":"\#(exported)","from":"\#(iso.string(from: Fixtures.date(1, 0)))","to":"\#(iso.string(from: Fixtures.date(30, 0)))","calendars":[{"calendar":"\#(calendar)"}],"events":[]}"#
    }

    static let loggedIn = #"{"google":{"refreshToken":"token"}}"#

    func snapshot(_ files: [String: String], settings: String = "") throws -> BoardSnapshot {
        let vault = FakeVault(Self.tasks)
        vault.files = files
        vault.settings = settings
        return try TaskBoard(core: core, vault: vault).snapshot(day: "2026-11-06", measures: TimelineMeasures(hour: 56, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18), now: Self.now)
    }

    @Test func aSpareFileIsGreyWhateverItsAgeAndRaisesNoAlert() throws {
        let day = try snapshot(["calendar/iphone.json": Self.file("Main", hoursAgo: 1), "calendar/work.json": Self.file("Main", hoursAgo: 96)])
        #expect(day.statuses.map(\.source) == ["iphone", "google", "work"])
        #expect(day.statuses.map(\.tone) == [.plain, .spare, .spare])
        #expect(day.statuses.map(\.used) == [true, false, false])
        #expect(day.calendarsAlert == .none)
    }

    @Test func anOldFileInUseIsOrange() throws {
        let day = try snapshot(["calendar/iphone.json": Self.file("Main", hoursAgo: 1), "calendar/work.json": Self.file("Work", hoursAgo: 96)])
        #expect(day.statuses.first { $0.source == "work" }?.tone == .old)
        #expect(day.calendarsAlert == .old)
    }

    @Test func anOldFileInUseWhoseLastTryFailedIsRed() throws {
        let day = try snapshot(["calendar/google.json": Self.file("Google", hoursAgo: 96), "calendar/work.json": Self.file("Work", hoursAgo: 96)])
        #expect(day.statuses.map(\.source) == ["google", "work", "iphone"])
        #expect(day.statuses.map(\.tone) == [.broken, .old, .spare])
        #expect(day.calendarsAlert == .broken)
    }

    @Test func aFreshFileInUseIsPlainEvenWithAProblem() throws {
        let day = try snapshot(["calendar/google.json": Self.file("Google", hoursAgo: 1)])
        #expect(day.statuses.first { $0.source == "google" }?.tone == .plain)
        #expect(day.calendarsAlert == .none)
    }

    @Test func theDoorsCodesDecode() throws {
        let json = #"""
        {"allDay":[],"timed":[],"stale":true,"alert":"broken","words":{"alert":"Refresh failed","notInUse":"Not in use","notInUseNote":"Note"},"statuses":[
          {"source":"work","kind":"scriptable","problem":null,"events":0,"updatedDay":"other","updatedDate":"2026-11-02","detail":null,
           "stale":true,"updatedAtMs":1,"used":true,"tone":"old","words":{"name":"Work calendar","short":"Work","sub":"Updated","time":"2 Nov 08:00","alert":"Out of date"}}
        ]}
        """#
        let events = try JSONDecoder().decode(DayEvents.self, from: Data(json.utf8))
        #expect(events.alert == .broken)
        #expect(events.statuses.first?.tone == .old)
        #expect(events.statuses.first?.used == true)
        #expect(events.statuses.first?.words.alert == "Out of date")
        #expect(events.words.alert == "Refresh failed")
    }

    @Test func theMarksAreWordedByTheCore() throws {
        let day = try snapshot(["calendar/google.json": Self.file("Google", hoursAgo: 96), "calendar/work.json": Self.file("Work", hoursAgo: 96), "calendar/iphone.json": "not a calendar"])
        #expect(day.statuses.map(\.words.alert) == ["Refresh failed", "Out of date", ""])
        #expect(day.statuses.last?.words.sub == "file unreadable")
        #expect(day.calendarWords.alert == "Refresh failed")
        #expect(day.calendarWords.notInUse == "Not in use")
        #expect(!day.calendarWords.notInUseNote.isEmpty)
    }

    @Test func aDayWithoutCalendarsIsTheCoresEmptyDay() throws {
        let none = try TaskBoard(core: core, vault: FakeVault(Self.tasks)).noDayEvents()
        #expect(none.statuses.isEmpty)
        #expect(none.alert == .none)
        #expect(none.words.alert.isEmpty)
    }
}
