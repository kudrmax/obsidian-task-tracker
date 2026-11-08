import Foundation
import Testing
@testable import Core

/// What tells the open screen to read again: a file changed (tasks, settings, a calendar), a minute passed, a day turned.
@Suite struct BoardClockTests {
    static let file = [
        "## Inbox", "", "## Now", "", "- [ ] Morning run ⏰ 2026-11-06 07:00-08:00", "",
        "## Soon", "", "## Backlog", "", "## Done", "",
    ].joined(separator: "\n")
    static let measures = TimelineMeasures(hour: 56, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)

    let core = try! PhoneCore(script: Fixtures.phoneScript)

    func snapshot(_ board: TaskBoard, _ now: Date) throws -> BoardSnapshot {
        try board.snapshot(day: nil, measures: Self.measures, now: now)
    }

    @Test func aCalendarFileSyncBringsMakesTheScreenStale() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        let shown = try snapshot(board, Fixtures.date(6, 10))
        #expect(shown.readFrom(try board.files(now: Fixtures.date(6, 10))))
        vault.files["calendar/google.json"] = #"{"events":[]}"#
        #expect(!shown.readFrom(try board.files(now: Fixtures.date(6, 10))))
    }

    @Test func aChangedSettingMakesTheScreenStale() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        let shown = try snapshot(board, Fixtures.date(6, 10))
        vault.settings = #"{"dayStartHour":4}"#
        #expect(!shown.readFrom(try board.files(now: Fixtures.date(6, 10))))
    }

    @Test func aWorkCalendarMovedInTheSettingsIsReadFromItsNewFile() throws {
        let vault = FakeVault(Self.file)
        vault.files["work/old.json"] = "old"
        vault.files["work/new.json"] = "new"
        vault.settings = #"{"workCalendarFile":"work/old.json"}"#
        let board = TaskBoard(core: core, vault: vault)
        #expect(try board.files().calendars["work"] == "old")
        vault.settings = #"{"workCalendarFile":"work/new.json"}"#
        #expect(try board.files().calendars["work"] == "new")
    }

    @Test func aMinuteLaterTheScreenIsReadAgainAndTheNowLineMoves() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let shown = try snapshot(board, Fixtures.date(6, 10))
        #expect(shown.current(at: Fixtures.date(6, 10).addingTimeInterval(59)))
        #expect(!shown.current(at: Fixtures.date(6, 10, 1)))
        let later = try snapshot(board, Fixtures.date(6, 10, 2))
        let before = try #require(shown.timeline.now)
        #expect(later.timeline.now == before + 2)
    }

    @Test func theDayTurnsAtTheHourItStarts() throws {
        let vault = FakeVault(Self.file)
        vault.settings = #"{"dayStartHour":5}"#
        let board = TaskBoard(core: core, vault: vault)
        let night = try snapshot(board, Fixtures.date(7, 4, 59))
        #expect(night.today == "2026-11-06")
        let morning = try snapshot(board, Fixtures.date(7, 5))
        #expect(morning.today == "2026-11-07")
        #expect(morning.dayChange(since: night) == .passed)
        #expect(night.dayChange(since: night) == nil)
        #expect(!morning.readAlike(night))
    }

    @Test func anotherStartHourMovesTheDay() throws {
        let vault = FakeVault(Self.file)
        vault.settings = #"{"dayStartHour":5}"#
        let board = TaskBoard(core: core, vault: vault)
        let before = try snapshot(board, Fixtures.date(7, 4))
        #expect(before.startHour == 5)
        vault.settings = #"{"dayStartHour":3}"#
        let after = try snapshot(board, Fixtures.date(7, 4))
        #expect(after.startHour == 3)
        #expect(after.dayChange(since: before) == .moved)
    }
}
