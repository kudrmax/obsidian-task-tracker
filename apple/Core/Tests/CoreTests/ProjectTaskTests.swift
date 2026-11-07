import Foundation
import Testing
@testable import Core

/// A task of a project (`🗂️ [[Note]]`) through the door as the app runs it: the field stays on the line, no title shows it.
@Suite struct ProjectTaskTests {
    let core = try! PhoneCore(script: Fixtures.phoneScript)
    let at = Fixtures.date(7, 9)
    static let day = "2026-11-07"
    static let field = "🗂️ [[Окружение в новой стране]]"
    static let title = "Сходить на языковой обмен"
    static let file = [
        "## Inbox", "",
        "## Now", "",
        "- [ ] \(title) \(field) 📅 2026-11-07",
        "- [ ] Позвонить \(field) 📌 2026-11-07 15:00",
        "- [ ] Plain", "",
        "## Soon", "",
        "## Backlog", "",
        "- [ ] Someday \(field)", "",
        "## Done", "",
    ].joined(separator: "\n")

    @Test func theScreenShowsTheTitleWithoutTheField() throws {
        let task = try exchange(in: Self.file)
        #expect(task["title"] as? String == Self.title)
        #expect(task["text"] as? String == Self.title)
        #expect((task["project"] as? [String: Any])?["name"] as? String == "Окружение в новой стране")
    }

    @Test func aMoveKeepsTheField() throws {
        let key = try #require(try exchange(in: Self.file)["key"])
        let place: [String: Any] = ["kind": "place", "column": "soon", "place": ["kind": "task", "group": NSNull(), "before": NSNull()]]
        let moved = try written("tasks.drop", [[["key": key, "from": "day"]], place, Self.day])
        try keeps(moved, Self.title)
        #expect(try screen(moved)["soon"].flatMap { $0 as? [[String: Any]] }?.contains { $0["title"] as? String == Self.title } == true)
    }

    @Test func aNewTitleKeepsTheField() throws {
        let key = try #require(try exchange(in: Self.file)["key"])
        let renamed = try written("tasks.rename", [key, "Сходить на обмен снова"])
        try keeps(renamed, "Сходить на обмен снова")
    }

    @Test func doneKeepsTheField() throws {
        let key = try #require(try exchange(in: Self.file)["key"])
        let done = try written("tasks.setStatus", [key, "done"])
        #expect(done.contains("- [x] \(Self.title) \(Self.field)"))
    }

    @Test func aRemindersTitleHasNoFieldAndItsActionsKeepIt() throws {
        let reminders = try core.reminders(text: Self.file, settingsJSON: "", now: at)
        #expect(reminders.map(\.title) == ["Позвонить"])
        let id = try #require(reminders.first?.id)
        guard case .changed(let completed) = try core.complete(id: id, text: Self.file, settingsJSON: "", now: at) else { Issue.record("stale"); return }
        #expect(completed.contains("- [x] Позвонить \(Self.field)"))
        guard case .changed(let snoozed) = try core.snooze(id: id, minutes: 30, text: Self.file, settingsJSON: "", now: at) else { Issue.record("stale"); return }
        #expect(Self.line(of: "Позвонить", in: snoozed)?.contains(Self.field) == true)
    }

    @Test func quickEntryWritesNoProject() throws {
        guard case .written(let text) = try core.capture(CaptureTask(list: Fixtures.list("backlog"), typed: "Captured"), text: Self.file, settingsJSON: "", now: at) else {
            Issue.record("blank"); return
        }
        #expect(Self.line(of: "Captured", in: text) == "- [ ] Captured")
    }

    /// The app hands in no `grouping` and no `projects`: the screen still answers every list's tasks as before.
    @Test func withoutGroupingInTheContextEveryListStillHoldsItsTasks() throws {
        let view = try screen(Self.file)
        let backlog = try #require(view["backlog"] as? [[String: Any]])
        #expect(backlog.map { $0["title"] as? String } == ["Someday"])
    }

    private func screen(_ text: String) throws -> [String: Any] {
        try #require(try core.call("tasks.screen", [Self.day], context: DoorContext(tasks: text, now: at)).result as? [String: Any])
    }

    private func exchange(in text: String) throws -> [String: Any] {
        let day = try #require(try screen(text)["day"] as? [String: Any])
        let list = try #require(day["list"] as? [[String: Any]])
        return try #require(list.first { $0["text"] as? String == Self.title })
    }

    private func written(_ method: String, _ arguments: [Any]) throws -> String {
        try #require(try core.call(method, arguments, context: DoorContext(tasks: Self.file, now: at)).tasks)
    }

    /// The task keeps its project: the field on its line, and the screen shows its title alone.
    private func keeps(_ text: String, _ title: String) throws {
        #expect(Self.line(of: title, in: text)?.contains(Self.field) == true)
        let view = try screen(text)
        let lists = ["inbox", "soon", "backlog", "done"].compactMap { view[$0] as? [[String: Any]] }.flatMap { $0 }
            + ((view["day"] as? [String: Any])?["list"] as? [[String: Any]] ?? [])
        let shown = try #require(lists.first { ($0["text"] as? String) == title })
        #expect(shown["title"] as? String == title)
        #expect((shown["project"] as? [String: Any])?["name"] as? String == "Окружение в новой стране")
    }

    private static func line(of title: String, in text: String) -> String? {
        text.split(separator: "\n").map(String.init).first { $0.contains("] \(title)") }
    }
}
