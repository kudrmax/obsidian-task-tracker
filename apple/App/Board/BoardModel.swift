import Core
import SwiftUI
import UIKit
import os

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

    /// The words the tab bar shows.
    var name: String {
        switch self {
        case .inbox: String(localized: "Inbox")
        case .soon: String(localized: "Soon")
        case .today: String(localized: "Today")
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

/// A carry's gap in a list: before card `at` of the cards it moves between, at `level`, in section `group`; `place` is the
/// core's `GapPlace` as `rules.gapAt` fitted it.
struct ListGap: Equatable {
    let column: BoardColumn
    let at: Int
    let level: Int
    let group: String?
    let place: JSONValue
}

/// How long a drop takes to show the card in its new place, told to the log (`Drop landed in … ms`).
enum DropTiming {
    private static let log = Logger(subsystem: "com.kudrmax.taskcalendar", category: "drop")

    static func report(since start: ContinuousClock.Instant) {
        let elapsed = ContinuousClock.now - start
        let ms = Double(elapsed.components.attoseconds) / 1e15 + Double(elapsed.components.seconds) * 1000
        log.notice("Drop landed in \(ms, format: .fixed(precision: 1)) ms")
    }
}

/// The main screen's state: the day shown, what the door read for it, and every action, each a call through the door.
@MainActor
@Observable
final class BoardModel {
    private let board = AppServices.shared.board

    /// Where the ribbon stands. A swipe sets it as the ribbon settles; `go(to:)` moves the ribbon there.
    var place = RibbonPlace.today
    /// The place a tap on a tab asked the ribbon to scroll to, each ask new.
    private(set) var asked: PlaceAsk?

    struct PlaceAsk: Equatable {
        let place: RibbonPlace
        let id = UUID()
    }

    func go(to place: RibbonPlace) {
        self.place = place
        asked = PlaceAsk(place: place)
    }
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
    /// A read asked for while one runs: it runs again once that one ends, so the screen always ends on the latest ask.
    private var readAgain = false
    /// A read the file asked for while something was carried: made once the carry ends.
    private var readAfterCarry = false
    /// The day before and after the shown one, read ahead so the arrows show them in the same frame.
    @ObservationIgnored private var ahead: [String: BoardSnapshot] = [:]
    @ObservationIgnored private var neighbours: (previous: String, next: String)?
    /// Which way the last change of the day went: the day list and the calendar slide in from that side.
    private(set) var dayMotion = 1
    @ObservationIgnored private var watch: FileWatch?

    func reload(animated: Bool = false) async {
        guard !reading else {
            readAgain = true
            return
        }
        reading = true
        defer { reading = false }
        repeat {
            readAgain = false
            let day = shownDay
            let board = board
            do {
                let read = try await Task.detached { try board.snapshot(day: day, measures: CardMetrics.timeline) }.value
                show(read, animated: animated)
                problem = nil
            } catch {
                problem = Self.words(error)
            }
        } while readAgain
        readAhead()
    }

    /// The screen drawn from `read`: in one step with the end of a carry, so a dropped card stands in its place at once.
    private func show(_ read: BoardSnapshot, animated: Bool) {
        if animated {
            withAnimation(.snappy) { snapshot = read }
        } else {
            var instant = Transaction()
            instant.disablesAnimations = true
            withTransaction(instant) {
                snapshot = read
                endCarry()
            }
        }
    }

    /// Reads again only when the tasks file changed under the screen: Obsidian, Sync, a reminder's button.
    func reloadIfChanged() async {
        guard carried == nil else {
            readAfterCarry = true
            return
        }
        let board = board
        let text = try? await Task.detached { try board.files().tasks }.value
        if text != snapshot?.tasksText { await reload(animated: true) }
    }

    /// The tasks file watched while the screen shows: a coordinated write elsewhere (iCloud, a reminder's button) reads again.
    func watchFile() {
        guard watch == nil else { return }
        watch = AppServices.shared.vault.watchTasksFile { [weak self] in
            Task { @MainActor in await self?.reloadIfChanged() }
        }
    }

    func stopWatching() {
        watch?.cancel()
        watch = nil
    }

    private func readAhead() {
        guard let shown = snapshot else { return }
        let board = board
        let day = shown.day
        Task {
            guard let previous: String = try? await read("days.step", [.string(day), -1]),
                  let next: String = try? await read("days.step", [.string(day), 1]) else { return }
            neighbours = (previous, next)
            for other in [previous, next] {
                if let kept = ahead[other], kept.tasksText == shown.tasksText { continue }
                if let read = try? await Task.detached(operation: { try board.snapshot(day: other, measures: CardMetrics.timeline) }).value {
                    ahead[other] = read
                }
            }
            ahead = ahead.filter { [previous, next, day].contains($0.key) }
        }
    }

    // MARK: The day

    var isToday: Bool { snapshot.map { $0.day == $0.today } ?? true }

    func step(_ days: Int) async {
        guard let day = snapshot?.day else { return }
        let target: String
        if let neighbours, snapshot?.day == day {
            target = days < 0 ? neighbours.previous : neighbours.next
        } else {
            target = (try? await read("days.step", [.string(day), .number(Double(days))])) ?? day
        }
        await turn(to: target, motion: days < 0 ? -1 : 1)
    }

    func showToday() async {
        guard let snapshot, snapshot.day != snapshot.today else { return }
        await turn(to: snapshot.today, motion: snapshot.day < snapshot.today ? 1 : -1)
        shownDay = nil
    }

    /// Another day: the one read ahead slides in at once, as Calendar slides days, then the screen is read for it anew.
    private func turn(to day: String, motion: Int) async {
        dayMotion = motion
        shownDay = day
        if let kept = ahead[day], kept.tasksText == snapshot?.tasksText {
            neighbours = nil
            withAnimation(.smooth) { snapshot = kept }
            // Read anew underneath, the clock and the undo steps as they are now; the same screen draws nothing new.
            await reload()
        } else {
            await reload(animated: true)
        }
    }

    // MARK: Search

    /// A found task shown: the ribbon goes where it lies and rings it until the next touch.
    func reveal(_ item: TaskItem) async {
        let board = board
        guard let place = try? await Task.detached(operation: { try board.write("tasks.reveal", [item.json]).decode(TaskScreenPlace.self) }).value else { return }
        if place.kind == "day" {
            shownDay = place.date
            go(to: .today)
        } else if place.list == "soon" {
            shownDay = nil
            go(to: .soon)
        } else if place.list == "inbox" || place.list == "backlog" {
            go(to: .inbox)
        }
        await reload()
        found = snapshot.flatMap { snapshot in
            snapshot.lists.values.flatMap(\.cards).first { $0.item.key.raw == item.key.raw }?.id
                ?? snapshot.timeline.slots.first { $0.card.item.key.raw == item.key.raw }?.id
        }
    }

    // MARK: Writing

    /// A call through the door that may write, then the screen read again: the change moves the cards with the system's
    /// spring, a drop's lands at once (the card is already where the finger let it go).
    func write(_ method: String, _ arguments: [JSONValue], animated: Bool = true) async {
        let board = board
        do {
            try await Task.detached { try board.write(method, arguments) }.value
        } catch {
            problem = Self.words(error)
        }
        await reload(animated: animated)
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

    /// A pure rule asked in the same frame: a gap or a snap while a finger moves.
    func ruleNow<T: Decodable>(_ method: String, _ arguments: [JSONValue]) -> T? {
        try? board.rule(method, arguments)
    }

    // MARK: Menus

    var menuScreen: JSONValue {
        guard let snapshot else { return .null }
        return ["today": .string(snapshot.today), "day": .string(snapshot.day), "offer": snapshot.screen.offer]
    }

    /// A task's menu: it reads no file, only the settings.
    func menu(for item: TaskItem, from: String) async -> TaskMenuModel? {
        let board = board
        let arguments: [JSONValue] = [item.json, .string(from), menuScreen]
        return try? await Task.detached { try board.read("tasks.menu", arguments, over: board.settingsOnly()) }.value
    }

    func bulkMenu() async -> TaskMenuModel? {
        guard let snapshot else { return nil }
        let picked = picked.compactMap { id -> JSONValue? in
            guard let item = snapshot.item(id) else { return nil }
            return ["item": item.json, "from": .string(snapshot.column(of: id) ?? "day")]
        }
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

    func togglePick(_ id: String) {
        if picked.contains(id) { picked.remove(id) } else { picked.insert(id) }
    }

    /// Every card of the lists: the calendar's cannot be picked, as in the plugin.
    func pickAll() {
        guard let snapshot else { return }
        picked = Set(snapshot.lists.values.flatMap { $0.cards.map(\.id) })
    }

    // MARK: Drag and drop

    /// Where the plus was let go: the new task's place, waiting for its title.
    struct NewTaskSpot: Identifiable {
        let id = UUID()
        let place: JSONValue
    }

    var newTaskAt: NewTaskSpot?

    /// What is carried: a card by its id, or the plus (`Carried.plus`). Its rows close up in their list while it is.
    private(set) var carried: String?
    /// Where a carry held over a list would land: the core's gap, its level drawn as the finger moves.
    private(set) var gap: ListGap?
    /// The minute a carry held over the calendar would start at.
    private(set) var landing: Int?

    var carrying: Bool { carried != nil }
    /// The screen's drop interaction, which every list and the calendar register with.
    @ObservationIgnored let dropping = BoardDrop()

    func startCarry(_ id: String) {
        found = nil
        carried = id
    }

    /// The carry ended with no drop (on the cancel target, or over no place): the rows stand as they were.
    func cancelCarry() {
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) { endCarry() }
        if readAfterCarry {
            readAfterCarry = false
            Task { await reloadIfChanged() }
        }
    }

    private func endCarry() {
        carried = nil
        gap = nil
        landing = nil
    }

    /// Whether a card stands in the carry: the card itself or one of its subtasks, which go with it.
    func isCarried(_ card: BoardCard) -> Bool {
        guard let carried else { return false }
        return card.names(carried) || isUnder(card.item, carried)
    }

    /// The cards a carry over `column` moves between: the column's, without the carried ones.
    func others(in column: BoardColumn) -> [BoardCard] {
        (snapshot?.lists[column]?.cards ?? []).filter { !isCarried($0) }
    }

    /// The carry held over `column` before card `index` of `others(in:)`, its left edge at `level` (fractional), past the
    /// headers `passed`: the gap the core fits there.
    func hover(_ column: BoardColumn, before index: Int, level: Double, passed: [String?]) {
        guard let list = snapshot?.lists[column] else { return }
        let others = others(in: column)
        let cards = Self.levelCards(others)
        guard let place: JSONValue = ruleNow("rules.gapAt", [cards, .number(Double(index)), .number(level), .array(passed.map(\.json)), .bool(list.showsHeaders)]),
              let at = place["index"].number, let fitted = place["level"].number else { return }
        let next = ListGap(column: column, at: Int(at), level: Int(fitted), group: place["group"].string, place: place)
        guard next != gap else { return }
        UISelectionFeedbackGenerator().selectionChanged()
        landing = nil
        withAnimation(.snappy(duration: 0.25)) { gap = next }
    }

    func leave(_ column: BoardColumn) {
        guard gap?.column == column else { return }
        withAnimation(.snappy(duration: 0.25)) { gap = nil }
    }

    /// The carry held over the calendar at `minute`, the timeline drawn `hourHeight` an hour: the line on the grid's step.
    func hover(minute: Double, hourHeight: CGFloat) {
        let snapped = snap(minute, hourHeight: hourHeight)
        if gap != nil { withAnimation(.snappy(duration: 0.25)) { gap = nil } }
        guard snapped != landing else { return }
        if landing != nil { UISelectionFeedbackGenerator().selectionChanged() }
        withAnimation(.snappy(duration: 0.15)) { landing = snapped }
    }

    func leaveCalendar() {
        withAnimation(.snappy(duration: 0.15)) { landing = nil }
    }

    /// A card or the plus let go in a list, in the gap shown.
    func drop(_ id: String, in column: BoardColumn) async {
        guard let snapshot, let gap, gap.column == column else { return cancelCarry() }
        let others = others(in: column)
        let home: JSONValue = homeGap(id, in: column) ?? .null
        let dropAt = ContinuousClock.now
        do {
            let place: JSONValue = try await rule("rules.placeOfDrop", [Self.listCards(others), gap.place, home])
            if id == Carried.plus {
                cancelCarry()
                guard !place.isNull else { return }
                let look: JSONValue = ["cards": [:], "day": .string(snapshot.day), "shown": [], "sections": [:], "sectioned": [:]]
                let entry: [String: JSONValue] = try await read("entry.placeOf", [.null, look, .string(column.rawValue), place])
                if let spot = entry["value"], !spot.isNull { newTaskAt = NewTaskSpot(place: spot) }
            } else if !place.isNull, let item = snapshot.item(id), let from = snapshot.column(of: id) {
                await drop(item, from: from, to: ["kind": "place", "column": .string(column.rawValue), "place": place])
                DropTiming.report(since: dropAt)
            } else {
                cancelCarry()
            }
        } catch {
            problem = Self.words(error)
            cancelCarry()
        }
    }

    /// A card or the plus let go on the calendar, at the minute the line shows.
    func dropOnCalendar(_ id: String, hourHeight: CGFloat) async {
        guard let snapshot, let minute = landing else { return cancelCarry() }
        let dropAt = ContinuousClock.now
        if id == Carried.plus {
            cancelCarry()
            guard let slot: JSONValue = try? await read("tasks.newSlot", [.string(snapshot.day), .number(Double(minute))]) else { return }
            newTaskAt = NewTaskSpot(place: ["kind": "slot", "slot": slot])
        } else if let item = snapshot.item(id), let from = snapshot.column(of: id) {
            await drop(item, from: from, to: ["kind": "time", "start": .number(Double(minute))])
            DropTiming.report(since: dropAt)
        } else {
            cancelCarry()
        }
    }

    /// The minute a carry over the calendar stands at, on the grid's step for the timeline drawn `hourHeight` an hour.
    func snap(_ minute: Double, hourHeight: CGFloat) -> Int {
        let whole = Int(minute.rounded())
        let key = SnapKey(minute: whole, hour: Int(hourHeight.rounded()))
        if let known = snapped[key] { return known }
        let step: Int = ruleNow("tasks.snap", [.number(Double(whole)), .number(hourHeight), .number(9)]) ?? whole
        snapped[key] = step
        return step
    }

    private struct SnapKey: Hashable {
        let minute: Int
        let hour: Int
    }

    /// The grid's minute for each whole minute a carry has passed over at each zoom: a drag asks on every move.
    @ObservationIgnored private var snapped: [SnapKey: Int] = [:]

    /// The task the plus was let go for, once its title is typed.
    func create(_ text: String, at spot: NewTaskSpot) async {
        await write("tasks.createInPlace", [.string(text), .null, spot.place])
    }

    private func drop(_ item: TaskItem, from: String, to: JSONValue) async {
        guard let day = snapshot?.day else { return }
        await write("tasks.drop", [[["key": item.key.json, "from": .string(from)]], to, .string(day)], animated: false)
    }

    /// Where a card carried alone was lifted from in its own list: let go there at its level, nothing is written.
    private func homeGap(_ id: String, in column: BoardColumn) -> JSONValue? {
        guard let cards = snapshot?.lists[column]?.cards, let index = cards.firstIndex(where: { $0.names(id) }) else { return nil }
        let card = cards[index]
        return ["kind": "gap", "index": .number(Double(index)), "level": .number(Double(card.level)), "group": card.item.group.json]
    }

    private static func levelCards(_ cards: [BoardCard]) -> JSONValue {
        .array(cards.map { ["level": .number(Double($0.level)), "group": $0.item.group.json] })
    }

    private static func listCards(_ cards: [BoardCard]) -> JSONValue {
        .array(cards.map { ["key": $0.item.key.json, "level": .number(Double($0.level)), "group": $0.item.group.json] })
    }

    private func isUnder(_ item: TaskItem, _ id: String) -> Bool {
        guard let lifted = snapshot?.item(id) else { return false }
        return Self.contains(lifted, item)
    }

    private static func contains(_ tree: TaskItem, _ item: TaskItem) -> Bool {
        tree.allSubtasks.contains { $0.id == item.id || contains($0, item) }
    }

    func openInObsidian(_ item: TaskItem) async {
        guard let line: Int = try? await read("tasks.lineOf", [item.key.json]),
              let file = try? AppServices.shared.vault.tasksFilePath(),
              let vault = UserDefaults.standard.string(forKey: "vaultFolderName")
        else { return }
        var link = URLComponents(string: "obsidian://advanced-uri")!
        link.queryItems = [URLQueryItem(name: "vault", value: vault), URLQueryItem(name: "filepath", value: file), URLQueryItem(name: "line", value: String(line + 1))]
        if let url = link.url { await UIApplication.shared.open(url) }
    }

    /// A level's or a label's colour as a menu's flag draws it, in either theme.
    func ink(_ color: String, dark: Bool) -> UIColor? {
        guard let hex: String = try? board.rule("rules.inkOf", [.string(color), .string(dark ? "dark" : "light")]) else { return nil }
        return UIColor(Color(hex: hex))
    }

    /// The card's menu as UIKit draws it, read from the screen as it stands. `later` holds a row that opens a sheet or a
    /// page until the menu has gone.
    func cardMenu(_ item: TaskItem, ask: @escaping (MenuQuestion) -> Void, later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu? {
        guard let menu = snapshot?.menus[item.id] else { return nil }
        let dark = UITraitCollection.current.userInterfaceStyle == .dark
        return MenuNode.uiMenu(TaskMenu(items: [item], menu: menu, model: self, ask: ask).nodes, later: later) { [weak self] in self?.ink($0, dark: dark) }
    }

    // MARK: The timeline's zoom

    /// The calendar's task cards stacked at an hour's height: the read's own at its height, else laid out anew once per height.
    func stacked(_ timeline: BoardTimeline, hour: CGFloat) -> [BoardSlot] {
        if abs(Double(hour) - CardMetrics.timeline.hour) < 0.01 { return timeline.slots }
        if stackedFor != timeline {
            stackedFor = timeline
            stacks = [:]
        }
        let key = Int((hour * 10).rounded())
        if let known = stacks[key] { return known }
        let m = CardMetrics.timeline
        let laid = (try? board.stack(timeline, measures: TimelineMeasures(hour: Double(hour), cardHeight: m.cardHeight, cardGap: m.cardGap, itemInset: m.itemInset, itemGap: m.itemGap, overlayInset: m.overlayInset))) ?? timeline.slots
        stacks[key] = laid
        return laid
    }

    @ObservationIgnored private var stackedFor: BoardTimeline?
    @ObservationIgnored private var stacks: [Int: [BoardSlot]] = [:]
    @ObservationIgnored private var marks: [Int: [GridMark]] = [:]

    func gridMarks(hour: CGFloat, measures: GridMeasures) -> [GridMark] {
        let key = Int((hour * 10).rounded())
        if let known = marks[key] { return known }
        let found = (try? board.gridMarks(hour: Double(hour), measures: measures)) ?? []
        marks[key] = found
        return found
    }

    func zoomRange(wholeDay: Double, levels: [Double]) -> [Double] {
        (try? board.zoomRange(wholeDay: wholeDay, levels: levels)) ?? [wholeDay]
    }

    func zoomAfterPinch(hour: Double, wholeDay: Double, levels: [Double]) -> Double? {
        (try? board.zoomAfterPinch(hour: hour, wholeDay: wholeDay, levels: levels)) ?? hour
    }

    func zoomShown(saved: JSONValue, wholeDay: Double?, levels: [Double]) -> Double {
        (try? board.zoomShown(saved: saved, wholeDay: wholeDay, levels: levels)) ?? CardMetrics.timeline.hour
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
