import Foundation
import Testing
@testable import Core

/// A task of a project (`🗂️ [[Note]]`) through the calls the app makes, in JavaScriptCore: the field stays on the line,
/// no title shows it, and the screen looks as it did before projects.
@Suite struct ProjectTaskTests {
    static let day = "2030-01-07"
    static let later = "2030-01-09"
    static let project = "Окружение в новой стране"
    static let field = "🗂️ [[Окружение в новой стране]]"
    static let exchange = "Сходить на языковой обмен"
    static let file = [
        "## Inbox", "",
        "## Now", "",
        "## Soon", "",
        "- [ ] \(exchange) \(field) 📅 2030-01-07",
        "- [ ] Позвонить \(field) 📌 2030-01-07 15:00", "",
        "## Backlog", "",
        "- [ ] Someday \(field)",
        "- [ ] Free",
        "### Дальний",
        "- [ ] Far", "",
        "## Done", "",
    ].joined(separator: "\n")
    static let measures = TimelineMeasures(hour: 50, cardHeight: 35, cardGap: 2, itemInset: 1, itemGap: 2, overlayInset: 18)

    let core = try! PhoneCore(script: Fixtures.phoneScript)
    let at = Fixtures.date(7, 9)

    // MARK: Reading

    @Test func theScreenShowsTheTitleWithoutTheField() throws {
        let snapshot = try snapshot(FakeVault(Self.file))
        let card = try #require(snapshot.lists[.day]?.cards.first { $0.item.text == Self.exchange })
        #expect(card.item.title == Self.exchange)
        #expect(card.item.json["project"]["name"].string == Self.project)
        #expect(snapshot.timeline.slots.map(\.card.item.title) == ["Позвонить"])
    }

    /// The core groups Backlog by project unless told otherwise; the app draws no groups yet, so it asks for every list
    /// ungrouped: Backlog keeps its sections, and a card's Section menu offers the whole list's sections.
    @Test func backlogLooksAsBeforeProjects() throws {
        let snapshot = try snapshot(FakeVault(Self.file))
        let backlog = try #require(snapshot.lists[.backlog])
        #expect(backlog.groups.map(\.header) == ["No section", "Дальний"])
        #expect(backlog.groups.map { $0.cards.map(\.item.title) } == [["Someday", "Free"], ["Far"]])
        #expect(snapshot.screen.offer["projects"].isNull)
        let someday = try item("Someday", in: snapshot)
        let menu = try #require(snapshot.menus[someday.id])
        #expect(menu.sections?.choice.names.contains("Дальний") == true)
    }

    @Test func withTheDoorsDefaultsBacklogWouldBeGroupedAndItsMenuCutToTheProject() throws {
        let screen = try #require(try core.call("tasks.screen", [Self.day], context: DoorContext(tasks: Self.file, now: at)).result as? [String: Any])
        let offer = try #require(screen["offer"] as? [String: Any])
        #expect(offer["projects"] != nil)
    }

    @Test func searchFullScreenAndFindShowTheTitleAlone() throws {
        let board = TaskBoard(core: core, vault: FakeVault(Self.file))
        let files = try board.files(now: at)
        let groups: [SearchGroup] = try board.read("tasks.search", ["языковой"], over: files)
        let hit = try #require(groups.flatMap(\.hits).first)
        #expect(hit.item.title == Self.exchange)
        #expect(hit.title.map(\.text).joined() == Self.exchange)
        let found: TaskItem = try board.read("tasks.find", [hit.item.key.json, .string(hit.item.text)], over: files)
        #expect(found.title == Self.exchange)
        let tree: FullTree = try board.rule("tasks.fullTree", [hit.item.json])
        #expect(tree.task.title == Self.exchange)
        let place: TaskScreenPlace = try board.write("tasks.reveal", [hit.item.json], as: TaskScreenPlace.self)
        #expect(place.kind == "day")
    }

    // MARK: Moves

    @Test func aDragIntoAnotherSectionKeepsTheField() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        try drag("Someday", in: .backlog, before: 3, passed: ["Дальний"], vault: vault, board: board)
        try keeps(vault, "Someday")
        let backlog = try #require(try snapshot(vault).lists[.backlog])
        #expect(backlog.groups.last?.cards.map(\.item.title) == ["Far", "Someday"])
    }

    @Test func aDragBetweenColumnsKeepsTheField() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        try drag("Someday", in: .day, before: 0, passed: [], vault: vault, board: board)
        try keeps(vault, "Someday")
        try drag(Self.exchange, in: .backlog, before: 0, passed: [], vault: vault, board: board)
        try keeps(vault, Self.exchange)
    }

    @Test func ontoTheTimelineAndOffItKeepsTheField() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        let someday = try item("Someday", in: snapshot(vault))
        try board.write("tasks.drop", [[["key": someday.key.json, "from": "backlog"]], ["kind": "time", "start": 600], .string(Self.day)])
        try keeps(vault, "Someday")
        let slotted = try #require(try snapshot(vault).timeline.slots.first { $0.card.item.title == "Someday" })
        try board.write("tasks.drop", [[["key": slotted.card.item.key.json, "from": "timeline"]], ["kind": "place", "column": "backlog", "place": ["kind": "task", "group": .null, "before": .null]], .string(Self.day)])
        try keeps(vault, "Someday")
    }

    // MARK: Menus and edits

    @Test func renameAndASubtaskKeepTheField() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        try board.write("tasks.rename", [try item(Self.exchange, in: snapshot(vault)).key.json, "Сходить на обмен снова"])
        try keeps(vault, "Сходить на обмен снова")
        let parent = try item("Сходить на обмен снова", in: snapshot(vault))
        try board.write("tasks.createInPlace", ["Найти клуб", .null, ["kind": "subtask", "parent": parent.key.json, "before": .null]])
        try keeps(vault, "Сходить на обмен снова")
        #expect(line("Найти клуб", in: vault.text)?.contains("🗂️") == false)
        let tree: FullTree = try board.rule("tasks.fullTree", [try item("Сходить на обмен снова", in: snapshot(vault)).json])
        #expect(tree.rows.map(\.item.title) == ["Найти клуб"])
    }

    @Test func theBulkMenusActionsKeepTheField() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        let snapshot = try snapshot(vault)
        let picked = try ["Someday", "Free"].map { title -> JSONValue in ["item": try item(title, in: snapshot).json, "from": "backlog"] }
        let screen: JSONValue = ["today": .string(snapshot.today), "day": .string(snapshot.day), "offer": snapshot.screen.offer]
        let menu: TaskMenuModel = try board.read("tasks.bulkMenu", [.array(picked), screen], over: try board.files(now: at))
        #expect(menu.sections?.choice.names.contains("Дальний") == true)

        let keys = { (titles: [String]) throws -> JSONValue in .array(try titles.map { try item($0, in: self.snapshot(vault)).key.json }) }
        try board.write("tasks.togglePriority", [try keys(["Someday", "Free"]), "p1"])
        try keepsLine(vault, "Someday")
        try board.write("tasks.toSection", [try keys(["Someday"]), "Дальний"])
        try keepsLine(vault, "Someday")
        try board.write("tasks.postponeAll", [try keys(["Someday"]), .string(Self.later)])
        try keepsLine(vault, "Someday")
        let moved = try item("Someday", in: self.snapshot(vault, day: Self.later))
        try board.write("tasks.pickStatus", [.array([moved.key.json]), "done"])
        #expect(line("Someday", in: vault.text)?.hasPrefix("- [x] ") == true)
        try keepsLine(vault, "Someday")
    }

    @Test func aSectionRenamedOrRemovedKeepsItsProjectTasksField() throws {
        let vault = FakeVault(Self.file.replacingOccurrences(of: "- [ ] Far", with: "- [ ] Far \(Self.field)"))
        let board = TaskBoard(core: core, vault: vault)
        let section = try #require(try snapshot(vault).lists[.backlog]?.groups.last?.menu)
        #expect(section.section == "Дальний")
        try board.write("tasks.renameGroup", ["backlog", "Дальний", "Ближний"])
        try keeps(vault, "Far")
        #expect(vault.text.contains("### Ближний"))
        try board.write("tasks.removeGroup", ["backlog", "Ближний"])
        try keeps(vault, "Far")
        #expect(!vault.text.contains("### Ближний"))
    }

    @Test func doneAndUndoKeepTheField() throws {
        let vault = FakeVault(Self.file)
        let board = TaskBoard(core: core, vault: vault)
        try board.write("tasks.pickStatus", [.array([try item(Self.exchange, in: snapshot(vault)).key.json]), "done"])
        #expect(vault.text.contains("- [x] \(Self.exchange) \(Self.field)"))
        try board.write("history.undo")
        #expect(vault.text == Self.file)
    }

    // MARK: Reminders and quick entry

    @Test func aRemindersTitleHasNoFieldAndItsActionsKeepIt() throws {
        let reminders = try core.reminders(text: Self.file, settingsJSON: "", now: Fixtures.date(7, 9))
        #expect(reminders.map(\.title) == ["Позвонить"])
        let id = try #require(reminders.first?.id)
        guard case .changed(let snoozed) = try core.snooze(id: id, minutes: 30, text: Self.file, settingsJSON: "", now: at) else { Issue.record("stale"); return }
        #expect(line("Позвонить", in: snoozed)?.contains(Self.field) == true)
        guard case .changed(let completed) = try core.complete(id: id, text: Self.file, settingsJSON: "", now: at) else { Issue.record("stale"); return }
        #expect(completed.contains("- [x] Позвонить \(Self.field)"))
    }

    @Test func quickEntryWritesNoProject() throws {
        guard case .written(let text) = try core.capture(CaptureTask(list: Fixtures.list("backlog"), typed: "Captured"), text: Self.file, settingsJSON: "", now: at) else {
            Issue.record("blank"); return
        }
        #expect(line("Captured", in: text) == "- [ ] Captured")
    }

    // MARK: Helpers

    private func snapshot(_ vault: FakeVault, day: String = Self.day) throws -> BoardSnapshot {
        try TaskBoard(core: core, vault: vault).snapshot(day: day, measures: Self.measures, now: at)
    }

    private func item(_ title: String, in snapshot: BoardSnapshot) throws -> TaskItem {
        let cards = snapshot.lists.values.flatMap(\.cards) + snapshot.timeline.slots.map(\.card)
        return try #require(cards.first { $0.item.title == title }?.item, "no card \(title)")
    }

    /// A card let go in `column` before its card `index`, past the headers `passed`: the app's drop (`BoardModel.drop`).
    private func drag(_ title: String, in column: BoardColumn, before index: Int, passed: [String?], vault: FakeVault, board: TaskBoard) throws {
        let snapshot = try snapshot(vault)
        let list = try #require(snapshot.lists[column])
        let lifted = try item(title, in: snapshot)
        let others = list.cards.filter { $0.item.id != lifted.id }
        let cards = JSONValue.array(others.map { ["key": $0.item.key.json, "level": .number(Double($0.level)), "group": $0.item.group.json] })
        let at = min(index, others.count)
        let gap: JSONValue = try board.rule("rules.gapAt", [cards, .number(Double(at)), 0, .array(passed.map(\.json)), .bool(list.showsHeaders)])
        let place: JSONValue = try board.rule("rules.placeOfDrop", [cards, gap, .null])
        #expect(!place.isNull)
        let from = try #require(snapshot.column(of: lifted.id))
        try board.write("tasks.drop", [[["key": lifted.key.json, "from": .string(from)]], ["kind": "place", "column": .string(column.rawValue), "place": place], .string(Self.day)])
    }

    /// The field still on the task's line, and the screen shows its title alone with its project.
    private func keeps(_ vault: FakeVault, _ title: String) throws {
        try keepsLine(vault, title)
        let shown = try item(title, in: snapshot(vault))
        #expect(!shown.title.contains("🗂️"))
        #expect(shown.json["project"]["name"].string == Self.project)
    }

    private func keepsLine(_ vault: FakeVault, _ title: String) throws {
        let found = try #require(line(title, in: vault.text), "no line of \(title)")
        #expect(found.contains(Self.field), "\(found)")
    }

    private func line(_ title: String, in text: String) -> String? {
        text.split(separator: "\n").map(String.init).first { $0.range(of: #"\] (p1 )?"# + NSRegularExpression.escapedPattern(for: title) + "( |$)", options: .regularExpression) != nil }
    }
}
