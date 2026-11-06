import Foundation
import Testing
@testable import Core

/// The plugin's door as the app runs it: in JavaScriptCore, not node.
@Suite struct DoorTests {
    let core = try! PhoneCore(script: Fixtures.phoneScript)
    let at = Fixtures.date(6, 14)
    static let file = "## Inbox\n\n- [ ] Call the bank\n\n## Now\n\n## Soon\n\n## Backlog\n\n## Done\n"

    @Test func listsEveryMethod() throws {
        let methods = try core.methods()
        #expect(methods.contains("tasks.screen"))
        #expect(methods.contains("tasks.setStatus"))
        #expect(methods.contains("rules.constants"))
        #expect(methods.count > 80)
    }

    @Test func readsTheScreen() throws {
        let screen = try #require(try core.call("tasks.screen", ["2026-11-06"], context: DoorContext(tasks: Self.file, now: at)).result as? [String: Any])
        #expect(screen["missing"] as? Bool == false)
        let inbox = try #require(screen["inbox"] as? [[String: Any]])
        #expect(inbox.map { $0["title"] as? String } == ["Call the bank"])
    }

    @Test func noTasksFileIsTheEmptyScreenThatSaysSo() throws {
        let screen = try #require(try core.call("tasks.screen", ["2026-11-06"], context: DoorContext(tasks: nil, now: at)).result as? [String: Any])
        #expect(screen["missing"] as? Bool == true)
    }

    @Test func aWriteAnswersTheNewText() throws {
        let context = DoorContext(tasks: Self.file, now: at)
        let screen = try #require(try core.call("tasks.screen", ["2026-11-06"], context: context).result as? [String: Any])
        let task = try #require((screen["inbox"] as? [[String: Any]])?.first)
        let reply = try core.call("tasks.setStatus", [try #require(task["key"]), "done"], context: context)
        let text = try #require(reply.tasks)
        #expect(text.contains("- [x] Call the bank"))
        #expect(!text.contains("- [ ] Call the bank"))
    }

    @Test func aTaskNoLongerThereIsStale() {
        let gone: [String: Any] = ["section": "inbox", "index": 0, "path": [Int](), "raw": "- [ ] Gone"]
        #expect(throws: PhoneCoreError.self) { try core.call("tasks.setStatus", [gone, "done"], context: DoorContext(tasks: Self.file, now: at)) }
        #expect(code { try core.call("tasks.setStatus", [gone, "done"], context: DoorContext(tasks: Self.file, now: at)) } == "staleTask")
    }

    @Test func errorsComeByTheirCode() {
        #expect(code { try core.call("tasks.nothing", context: DoorContext(tasks: Self.file, now: at)) } == "unknownMethod")
        #expect(code { try core.call("tasks.createInPlace", ["A", NSNull(), ["kind": "list", "list": "inbox", "group": NSNull(), "before": NSNull()]], context: DoorContext(tasks: nil, now: at)) } == "tasksFileMissing")
    }

    @Test func theTasksFileAsThePluginReadsIt() throws {
        #expect(try core.tasksFile(settingsJSON: "") == "TODOs Tasks.md")
        #expect(try core.tasksFile(settingsJSON: #"{"dayStartHour":5}"#) == "TODOs Tasks.md")
        #expect(try core.tasksFile(settingsJSON: #"{"tasksFile":""}"#) == nil)
        #expect(try core.tasksFile(settingsJSON: #"{"tasksFile":"   "}"#) == nil)
        #expect(try core.tasksFile(settingsJSON: #"{"tasksFile":"tasks/My.md"}"#) == "tasks/My.md")
    }

    @Test func theListsANewTaskGoesInto() throws {
        #expect(Set(try core.captureLists().map(\.name)) == ["inbox", "now", "soon", "backlog"])
    }

    @Test func aTitleOfManyLinesIsWrittenOnOne() throws {
        guard case .changed(let text) = try core.capture(list: CaptureList("inbox"), title: "Call\n\n the bank", text: Self.file, settingsJSON: "", now: at) else {
            Issue.record("stale")
            return
        }
        #expect(text.contains("- [ ] Call the bank\n"))
    }

    @Test func theIphoneCalendarsAsTheAppExportsThemReadBackOnTheScreen() throws {
        let work = ExportedCalendar(title: "Календарь", calendarId: "ek-work", account: "max@company.ru", color: "#0A84FF", sourceId: "src-1")
        let standup = ExportedEvent(id: "s", title: "Standup", start: Fixtures.date(6, 15), end: Fixtures.date(6, 15, 30), allDay: false, calendarId: "ek-work")
        let text = try core.iphoneCalendarText(PhoneExport(
            calendars: [work], events: [standup], from: Fixtures.date(5, 0), to: Fixtures.date(30, 0),
            exportedAt: at, device: "iPhone", validUntil: nil))
        #expect(try core.iphoneCalendarFile() == "calendar/iphone.json")

        let events = try #require(try core.call("calendars.events", ["2026-11-06"], context: DoorContext(tasks: Self.file, now: at, calendars: ["iphone": text])).result as? [String: Any])
        let timed = try #require(events["timed"] as? [[String: Any]])
        #expect(timed.map { $0["title"] as? String } == ["Standup"])
        #expect(timed.first?["startMs"] as? Double == Fixtures.date(6, 15).timeIntervalSince1970 * 1000)

        let meetings = try core.meetings(settingsJSON: "", texts: [nil, text, nil], from: at, to: Fixtures.date(7, 0), now: at)
        #expect(meetings == [CalendarEvent(title: "Standup", start: Fixtures.date(6, 15), end: Fixtures.date(6, 15, 30))])
    }

    private func code(_ body: () throws -> Any) -> String? {
        do {
            _ = try body()
            return nil
        } catch PhoneCoreError.refused(let code, _) {
            return code
        } catch {
            return "\(error)"
        }
    }
}
