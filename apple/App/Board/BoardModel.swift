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

    /// The core's name of the place (`SCREEN_PLACES`): Today is the calendar's.
    var key: String {
        switch self {
        case .inbox: "inbox"
        case .soon: "soon"
        case .today: "calendar"
        }
    }

    init?(key: String) {
        guard let place = Self.allCases.first(where: { $0.key == key }) else { return nil }
        self = place
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
/// core's `GapPlace` as `rules.placeAt` fitted it.
struct ListGap: Equatable {
    let column: BoardColumn
    let at: Int
    let level: Int
    let group: String?
    let place: JSONValue
    /// The drop line as the plugin draws it (`DropLine`), in the list's content space: from `line.x`, the left edge of
    /// the gap's level, to the list's right edge, through `line.y`, the middle of the gap; nil where the drop changes
    /// nothing (the card back where it was lifted from) or lands on an empty section's plate, which lights instead.
    let line: CGPoint?
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

    /// Typing tasks in place: the core's quick entry, driven for this screen.
    @ObservationIgnored let entry = QuickEntryHost()
    /// The timeline's zoom, kept across days.
    @ObservationIgnored let zoom = TimelineZoom()

    init() {
        dropping.ended = { [weak self] in self?.carryEnded() }
        dropping.landed = { [weak self] in self?.carryLanded(at: $0) }
        entry.model = self
    }

    /// A screen the quick entry read after its write, drawn in the transaction the entry draws its own state in.
    func draw(_ read: BoardSnapshot) {
        if case .turn(let forward) = read.motion(from: snapshot) { dayMotion = forward ? 1 : -1 }
        snapshot = read
        problem = nil
    }

    /// Another day in the day list, as the quick entry's place menu asks: the screen read for it.
    func show(day: String) async {
        shownDay = day
        await reload()
    }

    func problem(_ error: Error) {
        problem = Self.words(error)
    }

    /// A level's or a label's shades in both themes, asked once per colour.
    func shades(_ color: String) -> Themed<Shades>? {
        if let known = shadesByColor[color] { return known }
        guard let dark: Shades = ruleNow("rules.shadesOf", [.string(color), "dark"]), let light: Shades = ruleNow("rules.shadesOf", [.string(color), "light"]) else { return nil }
        let found = Themed(dark: dark, light: light)
        shadesByColor[color] = found
        return found
    }

    @ObservationIgnored private var shadesByColor: [String: Themed<Shades>] = [:]

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
    var newSection: TaskItem?
    var fullScreen: [TaskItem] = []

    /// A read asked for while one runs: it runs again once that one ends, so the screen always ends on the latest ask.
    private var readAgain = false
    /// A read the file asked for while something was carried or the quick entry wrote: made once they end.
    private var readAfterCarry = false
    /// A drop's write is made: the next read drawn ends its carry.
    /// The reads started so far, counted as each begins.
    @ObservationIgnored private var readsStarted = 0
    /// A drop's write is made: the first read started after it ends its carry (one started before shows the file without it).
    @ObservationIgnored private var dropReadFrom: Int?
    /// The day before and after the shown one, read ahead so the arrows show them in the same frame.
    @ObservationIgnored private var ahead: [String: BoardSnapshot] = [:]
    @ObservationIgnored private var neighbours: (previous: String, next: String)?
    /// Which way the last change of the day went: the day list and the calendar slide in from that side.
    private(set) var dayMotion = 1
    @ObservationIgnored private var watch: FileWatch?

    /// The screen read again. A read asked while one runs makes that one read once more, and waits for it: every caller
    /// returns with the screen drawn from the file as it was after its ask. How the drawing moves follows from what
    /// changed (`BoardSnapshot.motion`), never from who asked.
    func reload() async {
        if let running {
            readAgain = true
            await running.value
            if readAgain { await reload() }
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

    private func readLoop() async {
        repeat {
            readAgain = false
            let day = shownDay
            let board = board
            readsStarted += 1
            let serial = readsStarted
            do {
                let read = try await Task.detached { try board.snapshot(day: day, measures: CardMetrics.timeline) }.value
                show(read, serial: serial)
                problem = nil
            } catch {
                problem = Self.words(error)
            }
        } while readAgain
    }

    /// The screen drawn from `read` in one transaction, its motion chosen by what differs from the drawing on the screen;
    /// the first read after a drop's write puts the dropped card in its new place, hidden until its copy lands there.
    private func show(_ read: BoardSnapshot, serial: Int) {
        let landsDrop = dropReadFrom.map { serial >= $0 } ?? false
        if landsDrop { dropReadFrom = nil }
        draw(motion: read.motion(from: snapshot)) {
            snapshot = read
            entry.screenChanged()
            if landsDrop { carryWritten() }
        }
        if landsDrop { carryDrawn() }
    }

    /// One transaction for one drawing: still, the day turned (the day part slides in from the day's side), or the cards
    /// moved (each by its id slides, folds away or unfolds with the system's spring).
    func draw(motion: BoardMotion, _ change: () -> Void) {
        switch motion {
        case .still:
            var still = Transaction()
            still.disablesAnimations = true
            withTransaction(still, change)
        case .turn(let forward):
            dayMotion = forward ? 1 : -1
            withAnimation(.smooth, change)
        case .change:
            withAnimation(.snappy, change)
        }
    }

    /// Reads again only when the tasks file changed under the screen: Obsidian, Sync, a reminder's button. While a card is
    /// carried or the quick entry's writes run, the read waits for them: the entry draws each of its writes itself, in
    /// the same drawing as the line it ends.
    func reloadIfChanged() async {
        guard carried == nil, !entry.writing else {
            readAfterCarry = true
            return
        }
        let board = board
        guard let files = try? await Task.detached(operation: { try board.files() }).value else { return }
        // The settings count too: a list renamed or a colour changed in Settings or in Obsidian redraws every name.
        if files.tasks != snapshot?.tasksText || files.settingsJSON != snapshot?.settingsJSON { await reload() }
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
        await entry.settle()
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
        await entry.settle()
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
            draw(motion: kept.motion(from: snapshot)) {
                snapshot = kept
                entry.screenChanged()
            }
        }
        // Read anew, the clock and the undo steps as they are now: the same screen draws nothing new.
        await reload()
    }

    // MARK: A task's page

    /// What a task's page shows, read before the page is pushed so its first frame is whole.
    struct TaskPage {
        let task: TaskItem
        let tree: FullTree?
        let listName: String
        let menu: TaskMenuModel?
        let subtaskMenus: [String: TaskMenuModel]
        /// The description as the editor opens it (`description.open`).
        let opened: [String: JSONValue]?
    }

    /// Pages read ahead of their push, by task id.
    @ObservationIgnored private(set) var pages: [String: TaskPage] = [:]

    /// A task's page: read first, then pushed.
    func openFullScreen(_ item: TaskItem) async {
        pages[item.id] = await page(item)
        fullScreen.append(item)
    }

    /// The task as the file now has it, its subtasks, its list's name and the menus of its page.
    func page(_ item: TaskItem) async -> TaskPage {
        let found: TaskItem? = try? await read("tasks.find", [item.key.json, .string(item.text)])
        let task = found ?? item
        let tree: FullTree? = try? await rule("tasks.fullTree", [task.json])
        let listName: String = (try? await read("tasks.listName", [.string(task.list)])) ?? ""
        let menu = await menu(for: task, from: "full")
        var menus: [String: TaskMenuModel] = [:]
        for row in tree?.rows ?? [] { menus[row.item.id] = await self.menu(for: row.item, from: "full") }
        let opened: [String: JSONValue]? = try? await rule("description.open", [task.description.json])
        let page = TaskPage(task: task, tree: tree, listName: listName, menu: menu, subtaskMenus: menus, opened: opened)
        pages[item.id] = page
        return page
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
        found = snapshot?.item(item.id) != nil ? item.id : nil
    }

    // MARK: Writing

    /// A call through the door that may write, then the screen read again: the change moves as it differs.
    func write(_ method: String, _ arguments: [JSONValue]) async {
        let board = board
        do {
            _ = try await Task.detached { try board.write(method, arguments) }.value
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

    /// Whose sections a column shows, as the core names the list.
    private func sectionList(_ column: BoardColumn) -> String? {
        snapshot?.lists[column]?.sectionsOf
    }

    // MARK: Select Tasks

    /// Select Tasks slides in: the circles come from the leading edge as the cards make room, in one transaction.
    func startSelection() {
        withAnimation(.snappy) {
            picked = []
            selecting = true
        }
    }

    func endSelection() {
        guard selecting else { return }
        withAnimation(.snappy) {
            selecting = false
            picked = []
        }
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


    /// What is carried: a card (its id, its task, the column it is drawn in, where the finger holds it from its top), or
    /// the plus, a task not written yet.
    struct Carry {
        let id: String
        let item: TaskItem?
        let from: String
        let grab: CGFloat
        /// A section lifted by its header, carried among its list's sections.
        var section: SectionCarry? = nil
        /// The drop is written and the screen shows it: the card stands in its new place, hidden until its copy lands.
        var written = false
    }

    /// A section carried by its header, as the plugin's (`GroupDrag`): its list, its index among the list's groups, and
    /// each slot's place read as it was lifted: the top of the header it would go before, or the list's end, the ones
    /// below it as if it were gone.
    struct SectionCarry {
        let column: BoardColumn
        let list: String
        let names: [String?]
        let lifted: Int
        let places: [CGFloat]
    }

    /// The carry: its rows close up in their list while it lasts.
    private(set) var carry: Carry?
    /// Where a carry held over a list would land: the core's gap, its level drawn by the drop line as the finger moves.
    private(set) var gap: ListGap?
    /// The gap a card let go over a list flies into: the rows part for it there, until the screen shows the card in it.
    private(set) var settling: ListGap?
    /// The minute a carry held over the calendar would start at.
    private(set) var landing: Int?

    var carried: String? { carry?.id }
    var carrying: Bool { carry != nil }
    /// The screen's drop interaction, which every list and the calendar register with.
    @ObservationIgnored let dropping = BoardDrop()
    /// How the carry ends, once it was let go: the one owner of its end (`CarryEnd`), nil while the finger holds it.
    @ObservationIgnored private var ending: CarryEnd?
    /// Where the carried copy came down, in the window: the card glides from there if the screen drew it elsewhere.
    @ObservationIgnored private var touchdown: CGRect?
    /// The card a carry just ended on, and where its copy came down: the card glides from there to where it stands.
    private(set) var arrival: Arrival?

    struct Arrival: Equatable {
        let id: String
        let from: CGRect
    }

    /// A card lifted: it waits as a dashed place where it stood and its subtasks fold away under it, as the plugin's.
    func startCarry(_ card: BoardCard, from column: String, grab: CGFloat) {
        found = nil
        arrival = nil
        ending = nil
        touchdown = nil
        withAnimation(.snappy(duration: 0.25)) { carry = Carry(id: card.id, item: card.item, from: column, grab: grab) }
    }

    /// A section's header lifted: its header and tasks fold away and the list closes over them, as the plugin's.
    func startSectionCarry(_ column: BoardColumn, _ group: BoardGroup) {
        guard let list = snapshot?.lists[column], let name = list.sectionsOf, let lifted = list.groups.firstIndex(where: { $0.id == group.id }),
              let shape = geometry[column] else { return }
        let heads = list.groups.map { shape.heads[$0.id]?.minY }
        guard !heads.contains(where: { $0 == nil }) else { return }
        let tops = heads.compactMap { $0 }
        let bottoms = shape.cards.values.map(\.maxY) + shape.heads.values.map(\.maxY)
        let end = (bottoms.max() ?? 0) + (list.groups.last?.empty == true ? CardMetrics.height + CardMetrics.gap : 0)
        let all = tops + [end]
        let height = all[lifted + 1] - all[lifted]
        let places = all.enumerated().map { $0.offset > lifted ? $0.element - height : $0.element }
        found = nil
        ending = nil
        touchdown = nil
        let section = SectionCarry(column: column, list: name, names: list.groups.map(\.name), lifted: lifted, places: places)
        withAnimation(.snappy(duration: 0.25)) {
            carry = Carry(id: "\u{0}section/\(group.id)", item: nil, from: column.rawValue, grab: 0, section: section)
        }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    /// Where a carried section would go: the slot whose place is nearest the finger, the mark there; none at its own place.
    private(set) var sectionSlot: Int?

    private func hoverSection(_ section: SectionCarry, _ column: BoardColumn, at point: CGPoint) {
        guard column == section.column else { return leaveSection() }
        let slot = section.places.indices.min { abs(section.places[$0] - point.y) < abs(section.places[$1] - point.y) } ?? section.lifted
        let place: JSONValue? = ruleNow("rules.groupPlaceOf", [.array(section.names.map(\.json)), .number(Double(section.lifted)), .number(Double(slot))])
        // Its own place (the core's null, which comes back as no value) shows no mark.
        let shown = place == nil || place == .null ? nil : slot
        guard shown != sectionSlot else { return }
        if shown != nil { UISelectionFeedbackGenerator().selectionChanged() }
        withAnimation(.snappy(duration: 0.25)) { sectionSlot = shown }
    }

    private func leaveSection() {
        guard sectionSlot != nil else { return }
        withAnimation(.snappy(duration: 0.25)) { sectionSlot = nil }
    }

    /// Let go: the section moves before the one at the slot, or to the list's end (`tasks.moveGroup`); its copy flies to
    /// the mark that showed where.
    private func landSection(_ section: SectionCarry, _ column: BoardColumn) -> CGRect? {
        guard column == section.column, let slot = sectionSlot,
              let place: JSONValue = ruleNow("rules.groupPlaceOf", [.array(section.names.map(\.json)), .number(Double(section.lifted)), .number(Double(slot))]),
              !place.isNull else {
            letGo(writes: false)
            return nil
        }
        letGo(writes: true)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Task {
            let board = board
            let arguments: [JSONValue] = [.string(section.list), section.names[section.lifted].json, place]
            do {
                _ = try await Task.detached { try board.write("tasks.moveGroup", arguments) }.value
            } catch {
                problem = Self.words(error)
            }
            dropReadFrom = readsStarted + 1
            await reload()
            carryDrawn()
        }
        return geometry[column]?.mark
    }

    /// The section a carry lifted, folded away in its list until the screen shows it where it was dropped.
    func isLifted(_ group: BoardGroup, in column: BoardColumn) -> Bool {
        guard let carry, !carry.written, let section = carry.section, section.column == column else { return false }
        return section.names.indices.contains(section.lifted) && section.names[section.lifted] == group.name
    }

    /// The card a carry lifted from a list, waiting there as a dashed place until the screen shows it where it was dropped.
    func isWaiting(_ card: BoardCard) -> Bool { card.id == carry?.id && carry?.written == false }

    /// The carried card itself, wherever the screen draws it: hidden until its copy has landed.
    func isHidden(_ card: BoardCard) -> Bool { card.id == carry?.id }

    /// A subtask of the carried card: folded away under it until the screen shows them where they were dropped.
    func isFolded(_ card: BoardCard) -> Bool {
        guard let carry, !carry.written, card.id != carry.id, let lifted = carry.item else { return false }
        return Self.contains(lifted, card.item)
    }

    func startCarryingPlus() {
        ending = nil
        touchdown = nil
        carry = Carry(id: Carried.plus, item: nil, from: "new", grab: 0)
    }

    /// The carry let go: it ends once its copy lands and, when it writes, once the screen shows the write.
    private func letGo(writes: Bool) {
        guard carry != nil, ending == nil else { return }
        ending = CarryEnd(writes: writes)
    }

    /// The carry let go with no drop (on the cancel target, or over no place): the line and the marks go now, the place
    /// is released once the copy is home.
    func cancelCarry() {
        guard carry != nil else { return }
        letGo(writes: false)
        withAnimation(.snappy(duration: 0.25)) {
            gap = nil
            landing = nil
            sectionSlot = nil
        }
    }

    /// The carried copy came down, at `rect` in the window when the drop's preview flew there.
    func carryLanded(at rect: CGRect? = nil) {
        guard carry != nil else { return }
        if let rect { touchdown = rect }
        letGo(writes: false)
        guard var end = ending else { return }
        if end.land() { finishCarry() } else { ending = end }
    }

    /// The drop's write is drawn, or failed and draws nothing.
    private func carryDrawn() {
        guard var end = ending else { return }
        if end.draw() { finishCarry() } else { ending = end }
    }

    /// The first drawing of the drop's write: the card takes its new place (still hidden), the room it flew into and the
    /// marks go, in the drawing's own transaction.
    private func carryWritten() {
        carry?.written = true
        gap = nil
        settling = nil
        landing = nil
        sectionSlot = nil
    }

    /// The copy is in its place and the screen shows the drop: the card shows where it stands, gliding there from where
    /// the copy came down if that is elsewhere, and its subtasks unfold.
    private func finishCarry() {
        ending = nil
        if let carry, let touchdown { arrival = Arrival(id: carry.id, from: touchdown) }
        touchdown = nil
        withAnimation(.snappy) { endCarry() }
        readIfAsked()
    }

    /// A read the file asked for while a carry or the quick entry's writes held it: made now.
    func readIfAsked() {
        guard readAfterCarry, carried == nil, !entry.writing else { return }
        readAfterCarry = false
        Task { await reloadIfChanged() }
    }

    /// The drag session ended, whatever came of it: anything still flying has landed. A drop still being written ends
    /// its carry once the screen shows the write.
    func carryEnded() {
        carryLanded()
    }

    private func endCarry() {
        carry = nil
        gap = nil
        settling = nil
        sectionSlot = nil
        landing = nil
        hovered = nil
    }

    /// Whether a card stands in the carry: the card itself or one of its subtasks, which go with it. A drop reads the gaps
    /// among the others.
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
        /// Where a carried section's mark stands.
        var mark: CGRect?
        var width: CGFloat = 0
    }

    @ObservationIgnored private var geometry: [BoardColumn: ListGeometry] = [:]
    /// The last point a carry was read at over a list, so a finger standing still asks nothing.
    @ObservationIgnored private var hovered: (column: BoardColumn, point: CGPoint)?

    /// A card's or a header's frame as the list lays it out; kept only while no gap is open in the list.
    func rest(_ column: BoardColumn, card id: String, _ frame: CGRect) {
        guard settling?.column != column else { return }
        geometry[column, default: ListGeometry()].cards[id] = frame
    }

    func rest(_ column: BoardColumn, head id: String, _ frame: CGRect) {
        guard settling?.column != column else { return }
        geometry[column, default: ListGeometry()].heads[id] = frame
    }

    func rest(_ column: BoardColumn, mark frame: CGRect) {
        geometry[column, default: ListGeometry()].mark = frame
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
        if let section = carry?.section { return hoverSection(section, column, at: point) }
        guard let carry, let list = snapshot?.lists[column], let shape = geometry[column] else { return }
        if let hovered, hovered.column == column, abs(hovered.point.x - point.x) < 1, abs(hovered.point.y - point.y) < 1 { return }
        hovered = (column, point)
        let others = others(in: column)
        let placed = others.map { card in
            let frame = shape.cards[card.id] ?? .zero
            return PlacedCard(level: card.level, group: card.item.group, top: Double(frame.minY), height: Double(frame.height))
        }
        let order = Dictionary(list.groups.enumerated().map { ($0.element.name ?? "\u{0}", $0.offset) }, uniquingKeysWith: { first, _ in first })
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
        let home = homeGap(carry.id, in: column)
        // As the plugin's: no row moves while the finger does, so nothing shifts under it; the place holds against the last.
        let held = (gap?.column == column ? gap?.place : nil) ?? home ?? .null
        guard let place = try? board.placeAt(placed, y: y, level: level, shift: 0, room: .null, heads: heads, held: held, hysteresis: 6),
              let at = place["index"].number, let fitted = place["level"].number else { return }
        let group = place["group"].string
        // The card back where it was lifted from, at its level, changes nothing: the core's null, which comes back as no value.
        let stays = home.map { home in
            let drop: JSONValue? = ruleNow("rules.placeOfDrop", [Self.listCards(others), place, home])
            return drop == nil || drop == .null
        } ?? false
        let lights = list.groups.contains { $0.name == group && $0.empty }
        let shown = stays || lights ? nil : lineAt(column, at: Int(at), level: Int(fitted), group: group, home: home)
        let next = ListGap(column: column, at: Int(at), level: Int(fitted), group: group, place: place, line: shown)
        guard next != gap else { return }
        if next.place != gap?.place { UISelectionFeedbackGenerator().selectionChanged() }
        landing = nil
        withAnimation(.snappy(duration: 0.12)) { gap = next }
    }

    private func leave(_ column: BoardColumn) {
        if carry?.section != nil { return leaveSection() }
        if hovered?.column == column { hovered = nil }
        guard gap?.column == column else { return }
        withAnimation(.snappy(duration: 0.25)) { gap = nil }
    }

    /// Let go over a list (in the list's content space): the place is the core's (`rules.placeOfDrop`), and so is where
    /// the task lands (`tasks.landing`), asked before the write: the rows part there and the copy flies straight into
    /// that room, or into its dashed place when nothing is written. The plus opens the field there at once, and its
    /// copy becomes the field's place.
    private func land(_ column: BoardColumn) -> CGRect? {
        guard let carry else { return nil }
        if let section = carry.section { return landSection(section, column) }
        guard let gap, gap.column == column else {
            letGo(writes: false)
            return nil
        }
        let home: JSONValue = homeGap(carry.id, in: column) ?? .null
        let others = others(in: column)
        let place: JSONValue? = ruleNow("rules.placeOfDrop", [Self.listCards(others), gap.place, home])
        if carry.id == Carried.plus {
            endPlus()
            if let place { entry.openAtDrop(column, ["kind": "place", "column": .string(column.rawValue), "place": place]) }
            return gapRect(column, gap)
        }
        // The core's null: back where it was lifted from, nothing written.
        guard let item = carry.item, let place, !place.isNull else {
            letGo(writes: false)
            return geometry[column]?.cards[carry.id]
        }
        let to: JSONValue = ["kind": "place", "column": .string(column.rawValue), "place": place]
        letGo(writes: true)
        let room = landing(item, from: carry.from, to: to)?.gap(in: column, among: others)
        if let room {
            withAnimation(.snappy(duration: 0.25)) { settling = ListGap(column: column, at: room.at, level: room.level, group: room.group, place: place, line: nil) }
        }
        Task {
            let dropAt = ContinuousClock.now
            await drop(item, from: carry.from, to: to)
            DropTiming.report(since: dropAt)
        }
        return room.flatMap { gapRect(column, ListGap(column: column, at: $0.at, level: $0.level, group: $0.group, place: place, line: nil)) }
    }

    /// Where the core will leave `item` dropped `to`, asked over the file as it is, before the write.
    private func landing(_ item: TaskItem, from: String, to: JSONValue) -> DropLanding? {
        guard let day = snapshot?.day else { return nil }
        let tasks: JSONValue = [["key": item.key.json, "from": .string(from)]]
        do {
            return try board.landing(tasks, to: to, day: day).first
        } catch {
            problem = Self.words(error)
            return nil
        }
    }

    /// The plus let go on a place: its carry ends at once, the field opening where it came down.
    private func endPlus() {
        ending = nil
        touchdown = nil
        var still = Transaction()
        still.disablesAnimations = true
        withTransaction(still) { endCarry() }
    }

    /// The drop line of a gap: through the middle of the room above the card it parts from, or above the dashed place
    /// when the card goes back where it was lifted from at another level, from the left edge of its level.
    private func lineAt(_ column: BoardColumn, at: Int, level: Int, group: String?, home: JSONValue?) -> CGPoint? {
        let probe = ListGap(column: column, at: at, level: level, group: group, place: .null, line: nil)
        guard let rect = gapRect(column, probe) else { return nil }
        if let home, let carry, home["index"].number.map(Int.init) == at, home["group"].string == group, let waiting = geometry[column]?.cards[carry.id] {
            return CGPoint(x: rect.minX, y: waiting.minY - CardMetrics.gap / 2)
        }
        return CGPoint(x: rect.minX, y: rect.minY - CardMetrics.gap / 2)
    }

    /// Where a card put in the gap stands in the list: before the card it parts from, or under the last card of its section.
    private func gapRect(_ column: BoardColumn, _ gap: ListGap) -> CGRect? {
        guard let shape = geometry[column], let list = snapshot?.lists[column] else { return nil }
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
        // A section lands only among its list's sections.
        guard carry?.section == nil else { return leaveSection() }
        let snapped = snap(minute, hourHeight: hourHeight)
        if gap != nil { withAnimation(.snappy(duration: 0.25)) { gap = nil } }
        guard snapped != landing else { return }
        if landing != nil { UISelectionFeedbackGenerator().selectionChanged() }
        withAnimation(.snappy(duration: 0.15)) { landing = snapped }
    }

    private func leaveCalendar() {
        withAnimation(.snappy(duration: 0.15)) { landing = nil }
    }

    /// A long press on the calendar's empty space, held at `minute` of the grid: the line shows where a new task will
    /// stand, as the plus carried there.
    func pressCalendar(at minute: Double) {
        if landing == nil { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        hover(minute: minute, hourHeight: calendarHour)
    }

    func cancelCalendarPress() {
        leaveCalendar()
    }

    /// The long press let go: the field of a new task at the line's time.
    func releaseCalendar() {
        guard carry == nil, let minute = landing else { return leaveCalendar() }
        leaveCalendar()
        entry.openAtDrop(nil, ["kind": "time", "start": .number(Double(minute))])
    }

    /// Let go over the calendar: the copy flies straight to the block the core will make (`tasks.landing`): its span
    /// on the now line for a past time of today, its box in the stack the core lays out with the day's other blocks.
    private func landOnCalendar() -> CGRect? {
        guard let carry, carry.section == nil, let minute = landing, let snapshot else {
            letGo(writes: false)
            return nil
        }
        let to: JSONValue = ["kind": "time", "start": .number(Double(minute))]
        if carry.id == Carried.plus {
            let top = CGFloat(minute) / 60 * calendarHour + TimelineGeometry.labelLift
            endPlus()
            entry.openAtDrop(nil, to)
            return CGRect(x: TimelineGeometry.itemsLeft, y: top, width: calendarWidth - TimelineGeometry.itemsLeft - TimelineGeometry.itemsRight, height: CardMetrics.height)
        }
        guard let item = carry.item else {
            letGo(writes: false)
            return nil
        }
        letGo(writes: true)
        let spot = landing(item, from: carry.from, to: to).flatMap { blockRect($0, events: snapshot.timeline.events) }
        Task {
            let dropAt = ContinuousClock.now
            await drop(item, from: carry.from, to: to)
            DropTiming.report(since: dropAt)
        }
        return spot
    }

    /// The block a timeline landing makes, in the calendar's content space at the hour's height drawn now.
    private func blockRect(_ landed: DropLanding, events: [BoardEvent]) -> CGRect? {
        let m = CardMetrics.timeline
        let measures = TimelineMeasures(hour: Double(calendarHour), cardHeight: m.cardHeight, cardGap: m.cardGap, itemInset: m.itemInset, itemGap: m.itemGap, overlayInset: m.overlayInset)
        guard let box = try? board.box(of: landed, events: events, measures: measures) else { return nil }
        let left = TimelineGeometry.itemsLeft + CGFloat(box.left)
        return CGRect(
            x: left,
            y: TimelineGeometry.labelLift + CGFloat(box.top),
            width: calendarWidth - left - TimelineGeometry.itemsRight - CGFloat(m.itemInset),
            height: max(CGFloat(box.height), CardMetrics.height))
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

    private func drop(_ item: TaskItem, from: String, to: JSONValue) async {
        guard let day = snapshot?.day else { return }
        let board = board
        let arguments: [JSONValue] = [[["key": item.key.json, "from": .string(from)]], to, .string(day)]
        do {
            _ = try await Task.detached { try board.write("tasks.drop", arguments) }.value
        } catch {
            problem = Self.words(error)
        }
        dropReadFrom = readsStarted + 1
        await reload()
        // Drawn by the read, or nothing to draw when the write or the read failed: the carry waits no longer.
        carryDrawn()
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
                    // The core's stack replaces the scaled guess by sliding there, never in one frame.
                    withAnimation(.snappy(duration: 0.2)) { laidOut = Laid(timeline: next.timeline, hour: next.hour, slots: slots) }
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

    /// Every row's branch among rows of these `levels`, asked once per list of levels: the quick entry's lists draw them
    /// on each keystroke.
    func branches(levels: [Int]) -> [Branch?] {
        if let known = branchesByLevels[levels] { return known }
        let found = levels.indices.map { levels[$0] > 0 ? branch(levels: levels, index: $0) : nil }
        if branchesByLevels.count > 64 { branchesByLevels = [:] }
        branchesByLevels[levels] = found
        return found
    }

    @ObservationIgnored private var branchesByLevels: [[Int]: [Branch?]] = [:]

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
