import Foundation
import Testing
@testable import Core

/// What the app's menu and its drags read of the core: a weekly rule's days on the Repeat row, a calendar card's dots
/// (`tasks.stretch`) and their write (`tasks.resize`), the place button's words, the picked tasks a lift carries.
@Suite struct MenuAndDragTests {
    static let day = "2026-11-06"
    static let later = "2030-01-07"
    static let file = [
        "## Inbox", "", "- [ ] Inbox one", "",
        "## Now", "", "- [ ] Gym 📅 2026-11-06 🔁 every week on Mon, Wed, Fri", "- [ ] Trip ⏰ 2026-11-06 12:00-13:00", "\t- [ ] Book hotel", "",
        "## Soon", "", "- [ ] Later", "\t- [ ] Under later", "",
        "## Backlog", "", "",
        "## Done", "",
    ].joined(separator: "\n")
    static let measures = TimelineMeasures(hour: 56, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)

    let core = try! PhoneCore(script: Fixtures.phoneScript)
    let at = Fixtures.date(6, 10)

    @Test func aWeeklyScheduleShowsItsDaysOnTheRepeatRow() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let snapshot = try board.snapshot(day: Self.day, measures: Self.measures, now: at)
        let gym = try #require((snapshot.screen.day.list + snapshot.screen.day.slotted).first { $0.title == "Gym" })
        let row = try #require(snapshot.menus[gym.id]).repeat
        #expect(row.value.isEmpty)
        #expect(row.days == [0, 2, 4])
        #expect(try board.repeatWords().weekdays.map(\.letter) == ["M", "T", "W", "T", "F", "S", "S"])
    }

    /// A write reads the clock itself: the card stands on a day still to come, so nothing of it has passed.
    @Test func aDotHeldStretchesTheCardAndLetGoWritesTheTime() throws {
        let vault = FakeVault(Self.file.replacingOccurrences(of: "⏰ 2026-11-06", with: "⏰ \(Self.later)"))
        let board = TaskBoard(core: core, vault: vault)
        let snapshot = try board.snapshot(day: Self.later, measures: Self.measures, now: at)
        let trip = try #require(snapshot.timeline.slots.first { $0.card.item.title == "Trip" }).card.item
        #expect(trip.can.resize)
        let start = try #require(snapshot.timeline.slots.first { $0.card.item.title == "Trip" }).start
        let span: StretchSpan = try board.read("tasks.stretch", [trip.json, .string(Self.later), "end", .number(Double(start + 90))], over: board.files(now: at))
        #expect(span.start == start)
        #expect(span.end == start + 90)
        let changed = try board.write("tasks.resize", [trip.key.json, .string(Self.later), "end", .number(Double(start + 90)), 30])
        #expect(changed.bool == true)
        #expect(vault.text.contains("Trip ⏰ \(Self.later) 12:00-13:30"))
    }

    @Test func thePlaceButtonSaysADayAsThePluginDoes() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let words = try board.read("tasks.placementTitle", [["kind": "date", "date": "2026-11-05"]], over: board.settingsOnly()).string
        #expect(words == "5 Nov")
    }

    @Test func aLiftOfPickedTasksCarriesTheOthers() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let snapshot = try board.snapshot(day: Self.day, measures: Self.measures, now: at)
        let inbox = try #require(snapshot.screen.inbox.first)
        let later = try #require(snapshot.screen.soon.first { $0.title == "Later" })
        let under = try #require(later.subtasks.first)
        let carried: [TaskKey] = try board.read("tasks.carried", [inbox.key.json, .array([inbox.key.json, later.key.json, under.key.json])], over: board.files(now: at))
        #expect(carried == [later.key])
    }
}
