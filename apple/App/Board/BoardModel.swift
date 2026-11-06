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
    /// Its branch lines (`rules.gapBranch`), nil at the tasks' level.
    let branch: Branch?
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

    init() {
        dropping.ended = { [weak self] in self?.carryEnded() }
    }

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

    /// The screen read again. A read asked while one runs makes that one read once more, and waits for it: every caller
    /// returns with the screen drawn from the file as it was after its ask. A drop's read draws at once, the rest with the
    /// system's spring.
    func reload(animated: Bool = false) async {
        if !animated { instantNext = true }
        if let running {
            readAgain = true
            await running.value
            if readAgain || !animated && instantNext { await reload(animated: animated) }
            return
        }
        let task = Task { await readLoop() }
        running = task
        await task.value
        running = nil
        readAhead()
        rewatchIfMoved()
    }

    @ObservationIgnored private var running: Task<Void, Never>?
    /// A drop's read is waiting: the next drawing comes with no animation.
    @ObservationIgnored private var instantNext = false

    private func readLoop() async {
        repeat {
            readAgain = false
            let day = shownDay
            let board = board
            do {
                let read = try await Task.detached { try board.snapshot(day: day, measures: CardMetrics.timeline) }.value
                let instant = instantNext
                instantNext = false
                show(read, animated: !instant)
                problem = nil
            } catch {
                problem = Self.words(error)
            }
        } while readAgain
    }

    /// The screen drawn from `read`; a drop's in one step with the end of its carry, so the card stands in its place at once.
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

    /// The settings named another tasks file: the watch follows it.
    private func rewatchIfMoved() {
        guard let watch, let path = try? AppServices.shared.vault.tasksFilePath(), watch.presentedItemURL?.path.hasSuffix("/" + path) != true else { return }
        stopWatching()
        watchFile()
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

    /// What is carried: a card (its id, its task, the column it is drawn in, where the finger holds it from its top), or
    /// the plus, a task not written yet.
    struct Carry {
        let id: String
        let item: TaskItem?
        let from: String
        let grab: CGFloat
    }

    /// The carry: its rows close up in their list while it lasts.
    private(set) var carry: Carry?
    /// Where a carry held over a list would land: the core's gap, its level drawn as the finger moves.
    private(set) var gap: ListGap?
    /// The minute a carry held over the calendar would start at.
    private(set) var landing: Int?

    var carried: String? { carry?.id }
    var carrying: Bool { carry != nil }
    /// The screen's drop interaction, which every list and the calendar register with.
    @ObservationIgnored let dropping = BoardDrop()
    /// A drop is being written: its carry ends with it, once the screen is drawn from the file it wrote.
    @ObservationIgnored private var writingDrop = false

    func startCarry(_ card: BoardCard, from column: String, grab: CGFloat) {
        found = nil
        carry = Carry(id: card.id, item: card.item, from: column, grab: grab)
    }

    func startCarryingPlus() {
        carry = Carry(id: Carried.plus, item: nil, from: "new", grab: 0)
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

    /// The drag session ended, whatever came of it: a carry still standing ends now, unless its drop is still being
    /// written, which ends it once the screen shows the write.
    func carryEnded() {
        guard carry != nil, !writingDrop else { return }
        cancelCarry()
    }

    private func endCarry() {
        carry = nil
        gap = nil
        landing = nil
        hovered = nil
    }

    /// Whether a card stands in the carry: the card itself or one of its subtasks, which go with it.
    func isCarried(_ card: BoardCard) -> Bool {
        guard let carry else { return false }
        if card.id == carry.id { return true }
        guard let lifted = carry.item else { return false }
        return Self.contains(lifted, card.item)
    }

    /// The cards a carry over `column` moves between: the column's, without the carried ones.
    func others(in column: BoardColumn) -> [BoardCard] {
        (snapshot?.lists[column]?.cards ?? []).filter { !isCarried($0) }
    }

    // MARK: A list as a place to drop on

    /// Where a list's cards and headers stand with no gap open in it, in its content's space, and its width.
    struct ListGeometry {
        var cards: [String: CGRect] = [:]
        var heads: [String: CGRect] = [:]
        var width: CGFloat = 0
    }

    @ObservationIgnored private var geometry: [BoardColumn: ListGeometry] = [:]
    /// The last point a carry was read at over a list, so a finger standing still asks nothing.
    @ObservationIgnored private var hovered: (column: BoardColumn, point: CGPoint)?

    /// A card's or a header's frame as the list lays it out; kept only while no gap is open in the list.
    func rest(_ column: BoardColumn, card id: String, _ frame: CGRect) {
        guard gap?.column != column else { return }
        geometry[column, default: ListGeometry()].cards[id] = frame
    }

    func rest(_ column: BoardColumn, head id: String, _ frame: CGRect) {
        guard gap?.column != column else { return }
        geometry[column, default: ListGeometry()].heads[id] = frame
    }

    func rest(_ column: BoardColumn, width: CGFloat) {
        geometry[column, default: ListGeometry()].width = width
    }

    /// The list registers with the screen's drop interaction; the place holds the model weakly.
    func registerList(_ column: BoardColumn) {
        dropping.register("list.\(column.rawValue)", DropPlace(
            hover: { [weak self] in self?.hover(column, at: $0) },
            leave: { [weak self] in self?.leave(column) },
            land: { [weak self] in self?.land(column) }))
    }

    /// The carry held over `column` at `point`: the gap the core places under the finger, its level from the finger's
    /// `x` (a card by its middle, the plus by the finger itself), held until the finger is well past its edge.
    private func hover(_ column: BoardColumn, at point: CGPoint) {
        guard let carry, let list = snapshot?.lists[column], let shape = geometry[column] else { return }
        if let hovered, hovered.column == column, abs(hovered.point.x - point.x) < 1, abs(hovered.point.y - point.y) < 1 { return }
        hovered = (column, point)
        let others = others(in: column)
        let placed = others.map { card in
            let frame = shape.cards[card.id] ?? .zero
            return PlacedCard(level: card.level, group: card.item.group, top: Double(frame.minY), height: Double(frame.height))
        }
        let order = Dictionary(list.groups.enumerated().map { ($0.element.id, $0.offset) }, uniquingKeysWith: { first, _ in first })
        let orderOf = { (name: String?) in order[name ?? "\u{0}"] ?? 0 }
        var heads: [PlacedHead] = []
        for group in list.groups where group.header != nil {
            guard let frame = shape.heads[group.id] else { continue }
            let mine = orderOf(group.name)
            let first = others.firstIndex { orderOf($0.item.group) >= mine } ?? others.count
            heads.append(PlacedHead(group: group.name, firstCard: first, top: Double(frame.minY), height: Double(frame.height)))
        }
        let inset = Double(CardMetrics.columnInset)
        let y = carry.id == Carried.plus ? Double(point.y) : (try? board.carriedMiddle(y: Double(point.y), grab: Double(carry.grab), cardHeight: Double(CardMetrics.height))) ?? Double(point.y)
        let level = (try? board.levelAt(x: Double(point.x), left: inset, width: Double(shape.width) - 2 * inset, indent: Double(CardMetrics.indent))) ?? 0
        let held = gap?.column == column ? gap?.place ?? .null : .null
        guard let place = try? board.placeAt(placed, y: y, level: level, shift: Double(CardMetrics.height + CardMetrics.gap), room: held, heads: heads, held: held, hysteresis: 6),
              let at = place["index"].number, let fitted = place["level"].number else { return }
        let branch = try? board.gapBranch(levels: others.map(\.level), gap: place)
        let next = ListGap(column: column, at: Int(at), level: Int(fitted), group: place["group"].string, place: place, branch: branch)
        guard next != gap else { return }
        UISelectionFeedbackGenerator().selectionChanged()
        landing = nil
        withAnimation(.snappy(duration: 0.25)) { gap = next }
    }

    private func leave(_ column: BoardColumn) {
        if hovered?.column == column { hovered = nil }
        guard gap?.column == column else { return }
        withAnimation(.snappy(duration: 0.25)) { gap = nil }
    }

    /// Let go over a list: the drop is written, and the card settles into the gap shown (in the list's content space).
    private func land(_ column: BoardColumn) -> CGRect? {
        guard let carry else { return nil }
        let spot = gapRect(column)
        writingDrop = true
        Task {
            await drop(carry, in: column)
            finishDrop()
        }
        return carry.id == Carried.plus ? nil : spot
    }

    /// Where the gap stands in the list: before the card it parts from, or under the last card of its section.
    private func gapRect(_ column: BoardColumn) -> CGRect? {
        guard let gap, gap.column == column, let shape = geometry[column], let list = snapshot?.lists[column] else { return nil }
        let others = others(in: column)
        let indent = CGFloat(gap.level) * CardMetrics.indent
        let x = CardMetrics.columnInset + indent
        let w = shape.width - CardMetrics.columnInset * 2 - indent
        if let next = others[safe: gap.at], next.item.group == gap.group, let frame = shape.cards[next.id] {
            return CGRect(x: x, y: frame.minY, width: w, height: CardMetrics.height)
        }
        let above = others.prefix(gap.at).last { $0.item.group == gap.group }
        guard let frame = above.flatMap({ shape.cards[$0.id] }) ?? list.groups.first(where: { $0.name == gap.group }).flatMap({ shape.heads[$0.id] }) else { return nil }
        return CGRect(x: x, y: frame.maxY + CardMetrics.gap, width: w, height: CardMetrics.height)
    }

    /// A drop's write is done, or failed: its carry ends here whatever the reads did.
    private func finishDrop() {
        writingDrop = false
        if carry != nil { cancelCarry() }
    }

    private func drop(_ carry: Carry, in column: BoardColumn) async {
        guard let snapshot, let gap, gap.column == column else { return }
        let others = others(in: column)
        let home: JSONValue = homeGap(carry.id, in: column) ?? .null
        let dropAt = ContinuousClock.now
        do {
            let place: JSONValue = try await rule("rules.placeOfDrop", [Self.listCards(others), gap.place, home])
            if carry.id == Carried.plus {
                cancelCarry()
                guard !place.isNull else { return }
                let look: JSONValue = ["cards": [:], "day": .string(snapshot.day), "shown": [], "sections": [:], "sectioned": [:]]
                let entry: [String: JSONValue] = try await read("entry.placeOf", [.null, look, .string(column.rawValue), place])
                if let spot = entry["value"], !spot.isNull { newTaskAt = NewTaskSpot(place: spot) }
            } else if !place.isNull, let item = carry.item {
                await drop(item, from: carry.from, to: ["kind": "place", "column": .string(column.rawValue), "place": place])
                DropTiming.report(since: dropAt)
            }
        } catch {
            problem = Self.words(error)
        }
    }

    // MARK: The calendar as a place to drop on

    /// The hour's height the calendar is drawn at now: a carry over it reads minutes by it.
    @ObservationIgnored var calendarHour: CGFloat = CardMetrics.hour
    @ObservationIgnored var calendarWidth: CGFloat = 0

    func registerCalendar() {
        dropping.register("timeline", DropPlace(
            hover: { [weak self] point in
                guard let self else { return }
                self.hover(minute: Double(max(0, point.y - TimelineGeometry.labelLift) / self.calendarHour * 60), hourHeight: self.calendarHour)
            },
            leave: { [weak self] in self?.leaveCalendar() },
            land: { [weak self] in self?.landOnCalendar() }))
    }

    /// The carry held over the calendar at `minute`, the timeline drawn `hourHeight` an hour: the line on the grid's step.
    private func hover(minute: Double, hourHeight: CGFloat) {
        let snapped = snap(minute, hourHeight: hourHeight)
        if gap != nil { withAnimation(.snappy(duration: 0.25)) { gap = nil } }
        guard snapped != landing else { return }
        if landing != nil { UISelectionFeedbackGenerator().selectionChanged() }
        withAnimation(.snappy(duration: 0.15)) { landing = snapped }
    }

    private func leaveCalendar() {
        withAnimation(.snappy(duration: 0.15)) { landing = nil }
    }

    /// Let go over the calendar: the card settles at the time the line shows.
    private func landOnCalendar() -> CGRect? {
        guard let carry, let minute = landing, let snapshot else { return nil }
        let hour = calendarHour
        writingDrop = true
        Task {
            let dropAt = ContinuousClock.now
            if carry.id == Carried.plus {
                cancelCarry()
                if let slot: JSONValue = try? await read("tasks.newSlot", [.string(snapshot.day), .number(Double(minute))]) {
                    newTaskAt = NewTaskSpot(place: ["kind": "slot", "slot": slot])
                }
            } else if let item = carry.item {
                await drop(item, from: carry.from, to: ["kind": "time", "start": .number(Double(minute))])
                DropTiming.report(since: dropAt)
            }
            finishDrop()
        }
        guard carry.id != Carried.plus else { return nil }
        let top = CGFloat(minute) / 60 * hour + TimelineGeometry.labelLift
        return CGRect(x: TimelineGeometry.itemsLeft, y: top, width: calendarWidth - TimelineGeometry.itemsLeft - TimelineGeometry.itemsRight, height: CardMetrics.height)
    }

    /// The minute a carry over the calendar stands at, on the grid's step for the timeline drawn `hourHeight` an hour.
    func snap(_ minute: Double, hourHeight: CGFloat) -> Int {
        let whole = Int(minute.rounded())
        let key = SnapKey(minute: whole, hour: Int(hourHeight.rounded()))
        if let known = snapped[key] { return known }
        let step: Int = ruleNow("tasks.snap", [.number(Double(whole)), .number(hourHeight), .number(9)]) ?? whole
        if snapped.count > 4000 { snapped = [:] }
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

    private static func listCards(_ cards: [BoardCard]) -> JSONValue {
        .array(cards.map { ["key": $0.item.key.json, "level": .number(Double($0.level)), "group": $0.item.group.json] })
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

    /// The calendar's task cards at an hour's height: the read's own at its height; at another, the stack the core laid
    /// out last, its places scaled to this height while the core lays it out anew off the main thread (a pinch asks on
    /// every frame).
    func stacked(_ timeline: BoardTimeline, hour: CGFloat) -> [BoardSlot] {
        if abs(Double(hour) - CardMetrics.timeline.hour) < 0.5 { return timeline.slots }
        let laid = laidOut.flatMap { $0.timeline == timeline ? $0 : nil }
        if laid?.hour != hour { layOut(timeline, hour: hour) }
        guard let laid else { return Self.scaled(timeline.slots, from: CGFloat(CardMetrics.timeline.hour), to: hour) }
        return laid.hour == hour ? laid.slots : Self.scaled(laid.slots, from: laid.hour, to: hour)
    }

    /// The last stack the core laid out, and for which timeline and hour.
    private(set) var laidOut: Laid?

    struct Laid {
        let timeline: BoardTimeline
        let hour: CGFloat
        let slots: [BoardSlot]
    }

    @ObservationIgnored private var laying = false
    @ObservationIgnored private var wanted: (timeline: BoardTimeline, hour: CGFloat)?

    private func layOut(_ timeline: BoardTimeline, hour: CGFloat) {
        wanted = (timeline, hour)
        guard !laying else { return }
        laying = true
        Task {
            while let next = wanted {
                wanted = nil
                let board = board
                let m = CardMetrics.timeline
                let measures = TimelineMeasures(hour: Double(next.hour), cardHeight: m.cardHeight, cardGap: m.cardGap, itemInset: m.itemInset, itemGap: m.itemGap, overlayInset: m.overlayInset)
                let timeline = next.timeline
                if let slots = try? await Task.detached(operation: { try board.stack(timeline, measures: measures) }).value {
                    laidOut = Laid(timeline: next.timeline, hour: next.hour, slots: slots)
                }
            }
            laying = false
        }
    }

    private static func scaled(_ slots: [BoardSlot], from: CGFloat, to: CGFloat) -> [BoardSlot] {
        let k = Double(to / from)
        return slots.map { slot in
            let b = slot.box
            let box = StackBox(top: b.top * k, height: max(Double(CardMetrics.height), b.height * k), left: b.left, overlay: b.overlay, stacked: b.stacked, hiddenDuration: b.hiddenDuration)
            return BoardSlot(card: slot.card, start: slot.start, end: slot.end, slotStart: slot.slotStart, box: box)
        }
    }

    /// The grid at each whole hour height asked, and the lines of each grid: they change only where the grid does.
    @ObservationIgnored private var grids: [Int: GridStep] = [:]
    @ObservationIgnored private var marks: [GridStep: [GridMark]] = [:]

    func gridMarks(hour: CGFloat, measures: GridMeasures) -> [GridMark] {
        let whole = Int(hour.rounded())
        guard let grid = grids[whole] ?? (try? board.grid(hour: Double(whole), measures: measures)) else { return [] }
        if grids.count > 1000 { grids = [:] }
        grids[whole] = grid
        if let known = marks[grid] { return known }
        let found = (try? board.gridMarks(grid)) ?? []
        marks[grid] = found
        return found
    }

    /// Whether a grid label at `y` hides under the now pill: asked of the core only for the labels near it.
    func labelHides(_ y: CGFloat, now: CGFloat?, lift: CGFloat, pill: CGFloat) -> Bool {
        guard let now, abs(y - now) < 2 * (lift + pill) else { return false }
        return (try? board.labelHides(y: Double(y), now: Double(now), lift: Double(lift), pill: Double(pill))) ?? false
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

    func branch(levels: [Int], index: Int) -> Branch? {
        try? board.branchOf(levels: levels, index: index)
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
