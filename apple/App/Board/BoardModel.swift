import Core
import SwiftUI

/// The three places of the ribbon the tab bar switches: two half-screen columns each.
enum RibbonPlace: Int, Hashable, CaseIterable {
    case inbox, soon, today

    var title: LocalizedStringKey {
        switch self {
        case .inbox: "Inbox"
        case .soon: "Soon"
        case .today: "Today"
        }
    }

    var symbol: String {
        switch self {
        case .inbox: "tray"
        case .soon: "hourglass"
        case .today: "sun.max"
        }
    }
}

/// The main screen's state: the day shown, what the door read for it, and every action, each a call through the door.
@MainActor
@Observable
final class BoardModel {
    private let board = AppServices.shared.board
    /// A card carried by the finger.
    let drag = CardDrag()

    var place = RibbonPlace.today
    private(set) var snapshot: BoardSnapshot?
    private(set) var problem: String?
    private(set) var shownDay: String?

    /// Select Tasks: the picked cards by id.
    var selecting = false
    var picked: Set<String> = []
    /// A card brought to view by the search, ringed until the next touch.
    var found: String?

    /// The sheets and pages a menu opens.
    var dateFor: [TaskItem]?
    var repeatFor: TaskItem?
    var renaming: TaskItem?
    var subtaskOf: TaskItem?
    var newSection: TaskItem?
    var fullScreen: [TaskItem] = []

    private var reading = false

    func reload() async {
        guard !reading else { return }
        reading = true
        defer { reading = false }
        let day = shownDay
        let board = board
        do {
            snapshot = try await Task.detached { try board.snapshot(day: day) }.value
            problem = nil
        } catch {
            problem = Self.words(error)
        }
    }

    /// Reads again only when the tasks file changed under the screen: Obsidian, Sync, a reminder's button.
    func reloadIfChanged() async {
        let board = board
        let text = try? await Task.detached { try board.files().tasks }.value
        if text != snapshot?.tasksText { await reload() }
    }

    // MARK: The day

    var isToday: Bool { snapshot.map { $0.day == $0.today } ?? true }

    func step(_ days: Int) async {
        guard let day = snapshot?.day else { return }
        shownDay = (try? await read("days.step", [.string(day), .number(Double(days))])) ?? day
        await reload()
    }

    func showToday() async {
        shownDay = nil
        await reload()
    }

    // MARK: Search

    /// A found task shown: the ribbon goes where it lies and rings it until the next touch.
    func reveal(_ item: TaskItem) async {
        let board = board
        guard let place = try? await Task.detached(operation: { try board.write("tasks.reveal", [item.json]).decode(TaskScreenPlace.self) }).value else { return }
        if place.kind == "day" {
            shownDay = place.date
            self.place = .today
        } else if place.list == "soon" {
            shownDay = nil
            self.place = .soon
        } else if place.list == "inbox" || place.list == "backlog" {
            self.place = .inbox
        }
        await reload()
        found = snapshot.flatMap { snapshot in
            snapshot.lists.values.flatMap(\.cards).first { $0.item.key.raw == item.key.raw }?.id
                ?? snapshot.timeline.slots.first { $0.card.item.key.raw == item.key.raw }?.id
        }
    }

    // MARK: Writing

    /// A call through the door that may write, then the screen read again.
    func write(_ method: String, _ arguments: [JSONValue]) async {
        let board = board
        do {
            try await Task.detached { try board.write(method, arguments) }.value
        } catch {
            problem = Self.words(error)
        }
        await reload()
    }

    func read<T: Decodable & Sendable>(_ method: String, _ arguments: [JSONValue] = []) async throws -> T {
        let board = board
        return try await Task.detached { try board.read(method, arguments, over: try board.files()) }.value
    }

    func rule<T: Decodable & Sendable>(_ method: String, _ arguments: [JSONValue] = []) async throws -> T {
        let board = board
        return try await Task.detached { try board.rule(method, arguments) }.value
    }

    func undo() async {
        await write("history.undo", [])
    }

    // MARK: Menus

    var menuScreen: JSONValue {
        guard let snapshot else { return .null }
        return ["today": .string(snapshot.today), "day": .string(snapshot.day), "offer": snapshot.screen.offer]
    }

    func menu(for item: TaskItem, from: String) async -> TaskMenuModel? {
        try? await read("tasks.menu", [item.json, .string(from), menuScreen])
    }

    func bulkMenu() async -> TaskMenuModel? {
        guard let snapshot else { return nil }
        let picked = pickedItems.map { item -> JSONValue in ["item": item.json, "from": .string(snapshot.column(of: item.id) ?? "day")] }
        return try? await read("tasks.bulkMenu", [.array(picked), menuScreen])
    }

    var pickedItems: [TaskItem] {
        guard let snapshot else { return [] }
        return picked.compactMap { snapshot.item($0) }
    }

    func keys(_ items: [TaskItem]) -> JSONValue { .array(items.map(\.key.json)) }

    func pickStatus(_ items: [TaskItem], _ id: String) async {
        await write("tasks.pickStatus", [keys(items), .string(id)])
        endSelection()
    }

    func togglePriority(_ items: [TaskItem], _ prefix: String) async {
        await write("tasks.togglePriority", [keys(items), .string(prefix)])
        endSelection()
    }

    func toggleLabel(_ items: [TaskItem], _ name: String) async {
        await write("tasks.toggleLabel", [keys(items), .string(name)])
    }

    func postpone(_ items: [TaskItem], to date: String) async {
        await write("tasks.postponeAll", [keys(items), .string(date)])
        endSelection()
    }

    func removeDue(_ items: [TaskItem]) async {
        await write("tasks.removeDue", [keys(items)])
        endSelection()
    }

    func toSection(_ items: [TaskItem], _ name: String?) async {
        await write("tasks.toSection", [keys(items), name.json])
        endSelection()
    }

    func remove(_ items: [TaskItem]) async {
        await write("tasks.removeAll", [keys(items)])
        endSelection()
    }

    func setReminder(_ item: TaskItem, _ kind: String) async {
        await write("tasks.setReminder", [item.key.json, .string(kind)])
    }

    func rename(_ item: TaskItem, to text: String) async {
        await write("tasks.rename", [item.key.json, .string(text)])
    }

    func addSubtask(to parent: TaskItem, _ text: String) async {
        await write("tasks.createInPlace", [.string(text), .null, ["kind": "subtask", "parent": parent.key.json, "before": .null]])
    }

    func toggleCollapsed(_ item: TaskItem) async {
        await write("tasks.toggleCollapsed", [item.key.json])
    }

    func setRepeat(_ item: TaskItem, _ rule: JSONValue) async {
        await write("tasks.setRepeat", [item.key.json, rule])
    }

    func renameSection(_ column: BoardColumn, _ section: String, to name: String) async {
        guard let list = sectionList(column) else { return }
        await write("tasks.renameGroup", [.string(list), .string(section), .string(name)])
    }

    func removeSection(_ column: BoardColumn, _ section: String) async {
        guard let list = sectionList(column) else { return }
        await write("tasks.removeGroup", [.string(list), .string(section)])
    }

    private func sectionList(_ column: BoardColumn) -> String? {
        guard let snapshot else { return nil }
        if column != .day { return column.rawValue }
        return snapshot.day == snapshot.today ? "now" : "soon"
    }

    // MARK: Select Tasks

    func startSelection() {
        picked = []
        selecting = true
    }

    func endSelection() {
        selecting = false
        picked = []
    }

    func togglePick(_ item: TaskItem) {
        if picked.contains(item.id) { picked.remove(item.id) } else { picked.insert(item.id) }
    }

    /// Every card of the lists: the calendar's cannot be picked, as in the plugin.
    func pickAll() {
        guard let snapshot else { return }
        picked = Set(snapshot.lists.values.flatMap { $0.cards.map(\.id) })
    }

    // MARK: Drag and drop

    /// A card let go in a list, before card `index` of its cards (past the last: the list's end) at `level`.
    func drop(_ id: String, in column: BoardColumn, before index: Int, level: Int) async {
        guard let snapshot, let item = snapshot.item(id), let list = snapshot.lists[column], let from = snapshot.column(of: id) else { return }
        let others = list.cards.filter { $0.id != id && !isUnder($0.item, id) }
        let cards = JSONValue.array(others.map { ["key": $0.item.key.json, "level": .number(Double($0.level)), "group": $0.item.group.json] })
        let target = list.cards[safe: index]
        let at = others.firstIndex { $0.id == target?.id } ?? others.count
        // The headers the gap is past: down to the section of the card it stands before, or all of them at the end.
        let groups = list.groups.map(\.name)
        let through = target.flatMap { card in list.groups.firstIndex { $0.cards.contains { $0.id == card.id } } } ?? groups.count - 1
        let passed = list.showsHeaders && through >= 0 ? Array(groups.prefix(through + 1)) : []
        do {
            let gap: JSONValue = try await rule("rules.gapAt", [cards, .number(Double(at)), .number(Double(level)), .array(passed.map(\.json)), .bool(list.showsHeaders)])
            let place: JSONValue = try await rule("rules.placeOfDrop", [cards, gap, .null])
            await drop(item, from: from, to: ["kind": "place", "column": .string(column.rawValue), "place": place])
        } catch {
            problem = Self.words(error)
        }
    }

    /// A card let go on the calendar at `minute` from the start of the day, the timeline drawn `hourHeight` an hour.
    func drop(_ id: String, atMinute minute: Double, hourHeight: CGFloat) async {
        guard let snapshot, let item = snapshot.item(id), let from = snapshot.column(of: id) else { return }
        let snapped: Int = (try? await read("tasks.snap", [.number(minute), .number(hourHeight), .number(9)])) ?? Int(minute)
        await drop(item, from: from, to: ["kind": "time", "start": .number(Double(snapped))])
    }

    private func drop(_ item: TaskItem, from: String, to: JSONValue) async {
        guard let day = snapshot?.day else { return }
        await write("tasks.drop", [[["key": item.key.json, "from": .string(from)]], to, .string(day)])
    }

    private func isUnder(_ item: TaskItem, _ id: String) -> Bool {
        guard let lifted = snapshot?.item(id) else { return false }
        return lifted.allSubtasks.contains { $0.id == item.id || isUnderTree($0, item) }
    }

    private func isUnderTree(_ tree: TaskItem, _ item: TaskItem) -> Bool {
        tree.allSubtasks.contains { $0.id == item.id || isUnderTree($0, item) }
    }

    // MARK: Words

    static func words(_ error: Error) -> String {
        switch error {
        case BoardError.noAccess: "Choose your vault folder in Settings"
        case BoardError.noTasksFile: "No tasks file is set in Task Calendar's settings"
        case BoardError.busy: "The tasks file kept changing: try again"
        case BoardError.refused(let code, _) where code == "staleTask": "The task changed in Obsidian: here it is as it is now"
        case BoardError.refused(_, let message): message
        case BoardError.failed(let message): message
        default: error.localizedDescription
        }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
