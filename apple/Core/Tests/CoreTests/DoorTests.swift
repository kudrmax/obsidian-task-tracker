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

    @Test func theListsANewTaskGoesIntoByTheirHeadingsNames() throws {
        #expect(try core.captureLists(settingsJSON: "").map(\.key) == ["inbox", "now", "soon", "backlog"])
        let renamed = try core.captureLists(settingsJSON: #"{"sections":{"inbox":"Входящие","backlog":"Когда-нибудь"}}"#)
        #expect(renamed.map(\.name) == ["Входящие", "Now", "Soon", "Когда-нибудь"])
    }

    @Test func aTitleOfManyLinesIsWrittenOnOne() throws {
        let write = try core.capture(CaptureTask(list: Fixtures.list("inbox"), typed: "Call\n\n the bank"), text: Self.file, settingsJSON: "", now: at)
        guard case .written(let text) = write else { Issue.record("blank"); return }
        #expect(text.contains("- [ ] Call the bank\n"))
    }

    @Test func theCoreLinksTheRecordingAndItsTag() throws {
        let task = CaptureTask(list: Fixtures.list("inbox"), typed: " Idea ", recording: "Recording 1.m4a", tag: "transcribe")
        guard case .written(let text) = try core.capture(task, text: Self.file, settingsJSON: "", now: at) else { Issue.record("blank"); return }
        #expect(text.contains("- [ ] Idea [[Recording 1.m4a]] #transcribe\n"))
    }

    @Test func noWordsAndNoRecordingIsBlank() throws {
        #expect(try core.capture(CaptureTask(list: Fixtures.list("inbox"), typed: " \n ", tag: "#transcribe"), text: Self.file, settingsJSON: "", now: at) == .blank)
    }

    @Test func aWriteIsAStepThatUndoTakesBack() throws {
        let context = DoorContext(tasks: Self.file, now: at)
        let screen = try #require(try core.call("tasks.screen", ["2026-11-06"], context: context).result as? [String: Any])
        let task = try #require((screen["inbox"] as? [[String: Any]])?.first)
        let done = try core.call("tasks.setStatus", [try #require(task["key"]), "done"], context: context)
        #expect(done.step)
        let history = try #require(done.history)
        let after = DoorContext(tasks: try #require(done.tasks), now: at, history: history)
        #expect(try core.call("history.canUndo", context: after).result as? Bool == true)
        let undone = try core.call("history.undo", context: after)
        #expect(undone.result as? String == "done")
        #expect(undone.tasks == Self.file)
        #expect(!undone.step)
        let redo = DoorContext(tasks: Self.file, now: at, history: try #require(undone.history))
        #expect(try core.call("history.canRedo", context: redo).result as? Bool == true)
        #expect(try core.call("history.redo", context: redo).tasks == done.tasks)
    }

    @Test func aSourceTheHostFetchesItselfSaysNoDevice() throws {
        let iphone = #"{"exportedAt":"2026-11-06T10:00:00.000Z","device":"iPhone","events":[]}"#
        let statuses = { (fetched: [String]?) throws -> [[String: Any]] in
            let events = try #require(try core.call("calendars.events", ["2026-11-06"], context: DoorContext(tasks: Self.file, now: at, calendars: ["iphone": iphone], fetched: fetched)).result as? [String: Any])
            return try #require(events["statuses"] as? [[String: Any]])
        }
        let byDefault = try statuses(nil).first { $0["source"] as? String == "iphone" }
        let fetched = try statuses(["iphone"]).first { $0["source"] as? String == "iphone" }
        #expect(byDefault?["detail"] as? String == "iPhone")
        #expect(fetched?["detail"] is NSNull)
    }

    @Test func searchReadsEmphasisByLookbehindAsThePluginDoes() throws {
        let file = "## Inbox\n\n- [ ] Call the bank\n\t> **Ring** the snake_case_id _soon_\n\n## Now\n\n## Soon\n\n## Backlog\n\n## Done\n"
        let found = try #require(try core.call("tasks.search", ["snake_case"], context: DoorContext(tasks: file, now: at)).result as? [[String: Any]])
        let hit = try #require((found.first?["hits"] as? [[String: Any]])?.first)
        let parts = try #require(hit["description"] as? [[String: Any]])
        #expect(parts.compactMap { $0["text"] as? String }.joined() == "Ring the snake_case_id soon")
        #expect(parts.filter { $0["match"] as? Bool == true }.compactMap { $0["text"] as? String } == ["snake_case"])
        let none = try #require(try core.call("tasks.search", ["zzz"], context: DoorContext(tasks: file, now: at)).result as? [[String: Any]])
        #expect(none.allSatisfy { ($0["hits"] as? [Any])?.isEmpty ?? true })
    }

    @Test func aCalendarFilesTimesAreReadFieldByField() throws {
        let file = #"""
        {"exportedAt":"2026-11-06T10:00:00Z","events":[
          {"id":"z","title":"Zulu","start":"2026-11-06T12:00:00.250Z","end":"2026-11-06T13:00:00Z","allDay":false,"calendar":"Work"},
          {"id":"o","title":"Offset","start":"2026-11-06T18:30:00+05:30","end":"2026-11-06T19:30:00+05:30","allDay":false,"calendar":"Work"},
          {"id":"l","title":"Local","start":"2026-11-06T16:00:00","end":"2026-11-06T17:00:00","allDay":false,"calendar":"Work"}
        ]}
        """#
        let events = try #require(try core.call("calendars.events", ["2026-11-06"], context: DoorContext(tasks: Self.file, now: at, calendars: ["work": file])).result as? [String: Any])
        let timed = try #require(events["timed"] as? [[String: Any]])
        let start = { (title: String) in timed.first { $0["title"] as? String == title }?["startMs"] as? Double }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        #expect(start("Zulu") == iso.date(from: "2026-11-06T12:00:00.250Z")!.timeIntervalSince1970 * 1000)
        #expect(start("Offset") == iso.date(from: "2026-11-06T13:00:00.000Z")!.timeIntervalSince1970 * 1000)
        #expect(start("Local") == Fixtures.date(6, 16).timeIntervalSince1970 * 1000)
    }

    #if os(macOS)
    /// Days of 23 and 25 hours where New York's clocks change (2026-03-08, 2026-11-01), in JavaScriptCore set to that zone:
    /// a process of its own, since a process reads its zone once.
    @Test func aDayEndsAtItsNextMidnightByTheClockAcrossAChangeOfTheClocks() throws {
        var newYork = Calendar(identifier: .gregorian)
        newYork.timeZone = TimeZone(identifier: "America/New_York")!
        let local = { (month: Int, day: Int, hour: Int, minute: Int) in
            newYork.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour, minute: minute))!.timeIntervalSince1970 * 1000
        }
        let file = "## Now\n\n- [ ] Spring ⏰ 2026-03-08 01:30-03:30\n- [ ] Fall ⏰ 2026-11-01 00:00-03:00\n\n## Soon\n\n## Done\n"
        let midnight = #"{"dayStartHour":0}"#
        let spring = try Self.inNewYork("reminders.list", [], DoorContext(tasks: file, settingsJSON: midnight, now: Date(timeIntervalSince1970: local(3, 8, 0, 10) / 1000)))
        let springTask = try #require((spring["result"] as? [[String: Any]])?.first { $0["title"] as? String == "Spring" })
        #expect(springTask["startMs"] as? Double == local(3, 8, 1, 30))
        #expect(springTask["dayEndMs"] as? Double == local(3, 9, 0, 0))
        #expect(local(3, 9, 0, 0) - local(3, 8, 0, 0) == 23 * 3_600_000)

        let fall = try Self.inNewYork("reminders.list", [], DoorContext(tasks: file, settingsJSON: midnight, now: Date(timeIntervalSince1970: local(10, 31, 23, 0) / 1000)))
        let fallTask = try #require((fall["result"] as? [[String: Any]])?.first { $0["title"] as? String == "Fall" })
        #expect(fallTask["dayEndMs"] as? Double == local(11, 2, 0, 0))
        #expect(local(11, 2, 0, 0) - local(11, 1, 0, 0) == 25 * 3_600_000)

        let today = try Self.inNewYork("days.today", [], DoorContext(tasks: file, settingsJSON: #"{"dayStartHour":4}"#, now: Date(timeIntervalSince1970: local(3, 8, 3, 30) / 1000)))
        #expect(today["result"] as? String == "2026-03-07")
    }

    /// One door call in JavaScriptCore (`osascript -l JavaScript` runs the system's) with the clock in New York.
    private static func inNewYork(_ method: String, _ arguments: [Any], _ context: DoorContext) throws -> [String: Any] {
        let call = "TaskCalendarPhone.call(\(try PhoneCore.json(method)), \(try PhoneCore.json(try PhoneCore.json(arguments))), \(try PhoneCore.json(try PhoneCore.json(try PhoneCore.wire(context)))))"
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-l", "JavaScript", "-"]
        process.environment = ["TZ": "America/New_York"]
        let input = Pipe(), output = Pipe()
        process.standardInput = input
        process.standardOutput = output
        try process.run()
        input.fileHandleForWriting.write(Data((Fixtures.phoneScript + "\n" + call + "\n").utf8))
        try input.fileHandleForWriting.close()
        let answer = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return try #require(try JSONSerialization.jsonObject(with: answer) as? [String: Any])
    }
    #endif

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

        let files = try core.calendarFiles(settingsJSON: "")
        #expect(files.map(\.source) == ["google", "iphone", "work"])
        #expect(files.first { $0.source == "iphone" }?.path == "calendar/iphone.json")
        let meetings = try core.meetings(settingsJSON: "", calendars: ["iphone": text], from: at, to: Fixtures.date(7, 0), now: at)
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
