import Foundation
import Testing
@testable import Core

@Suite struct PhoneCoreTests {
    let core = try! PhoneCore(script: Fixtures.phoneScript)
    let alarm = "- [ ] Wake 🚨 2026-11-04 12:00-12:30"
    let quiet = "- [ ] Call ⏰ 2026-11-04 10:00"

    @Test func readsRemindersWithKindAndTime() throws {
        let list = try core.reminders(text: Fixtures.file(quiet, alarm), settingsJSON: "", now: Fixtures.date(4, 9))
        #expect(list.map(\.kind) == [.notification, .alarm])
        #expect(list[0] == Reminder(id: quiet, title: "Call", body: "10:00", kind: .notification, date: "2026-11-04",
                                    start: Fixtures.date(4, 10), dayEnd: Fixtures.date(5, 5)))
        #expect(list[1].body == "12:00–12:30")
    }

    @Test func completeClosesTheTask() throws {
        let result = try core.complete(id: alarm, text: Fixtures.file(alarm), settingsJSON: "", now: Fixtures.date(4, 12, 5))
        guard case .changed(let text) = result else { Issue.record("stale"); return }
        #expect(text.contains("- [x] Wake 🚨 2026-11-04 12:00-12:30"))
    }

    @Test func snoozeMovesTheSlot() throws {
        let result = try core.snooze(id: alarm, minutes: 30, text: Fixtures.file(alarm), settingsJSON: "", now: Fixtures.date(4, 12, 7))
        guard case .changed(let text) = result else { Issue.record("stale"); return }
        #expect(text.contains("- [ ] Wake 🚨 2026-11-04 12:37-13:07"))
    }

    @Test func unknownIDIsStale() throws {
        #expect(try core.complete(id: "- [ ] Gone", text: Fixtures.file(alarm), settingsJSON: "", now: Fixtures.date(4, 9)) == .stale)
    }

    @Test func aSilencedTaskStopsReminding() throws {
        guard case .changed(let text) = try core.silence(id: alarm, text: Fixtures.file(alarm), settingsJSON: "", now: Fixtures.date(4, 9)) else { Issue.record("stale"); return }
        #expect(try core.reminders(text: text, settingsJSON: "", now: Fixtures.date(4, 9)).isEmpty)
    }

    @Test func noTasksFileIsSaidByItsCode() {
        do {
            _ = try core.call("reminders.list", context: DoorContext(tasks: nil, now: Fixtures.date(4, 9)))
            Issue.record("no error")
        } catch PhoneCoreError.refused(let code, _) {
            #expect(code == "tasksFileMissing")
        } catch {
            Issue.record("\(error)")
        }
    }

    @Test func scriptErrorsSurface() throws {
        #expect(throws: PhoneCoreError.self) {
            try core.reminders(text: "", settingsJSON: "{not json", now: Fixtures.date(4, 9))
        }
    }
}
