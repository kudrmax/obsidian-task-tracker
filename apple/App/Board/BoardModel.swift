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
    /// In a list grouped by project, the project's part it stands in; nil in a plain list.
    var zone: JSONValue? = .none
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
        dropping.ended = { [weak self] in self?.dropSessionEnded(performed: $0) }
        dropping.foldsOnDrop = { [weak self] in self?.carry?.section != nil }
        dropping.fadesOnDrop = { [weak self] in self?.landsInFold == true }
        dropping.landed = { [weak self] in self?.carryLanded(at: $0) }
        entry.model = self
    }

    /// A screen the quick entry read after its write, drawn in the transaction the entry draws its own state in.
    func draw(_ read: BoardSnapshot) {
        forgetGone(read)
        snapshot = read
        problem = nil
    }

    /// Another day in the day list, as the quick entry's place menu asks: the screen read for it.
    func show(day: String) async {
        await go(toDay: day)
    }

    /// Another day by its date, from wherever it is asked (the bar's Date…, a found task): it slides in as the arrows
    /// bring it, from the side it lies on.
    private func go(toDay day: String) async {
        await afterTurns { [self] in
            guard let shown = snapshot?.day, day != shown else {
                shownDay = day
                return await reload()
            }
            await turn(to: day, motion: day > shown ? 1 : -1)
            if day == snapshot?.today { shownDay = nil }
        }
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
    private(set) var snapshot: BoardSnapshot? {
        didSet { if let timeline = snapshot?.timeline, timeline != oldValue?.timeline { layOutNow(timeline) } }
    }
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
    /// Another day coming in, as the plugin's `DayTrack`: the day read for it and the side it comes from (1: the next).
    private(set) var dayTurn: DayTurn?
    /// How far the day has come in, 0 to 1. Only the parts that read it move: the day's cards in each column.
    var dayShare: CGFloat = 0
    @ObservationIgnored private let daySlide = DaySlide()

    struct DayTurn {
        let peek: BoardSnapshot
        let shift: Int
    }
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
                // Another day was asked for meanwhile (a turn that went on): this read is not drawn, the day asked is read.
                guard shownDay == day else { readAgain = true; continue }
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
        forgetGone(read)
        let landsDrop = dropReadFrom.map { serial >= $0 } ?? false
        if landsDrop { dropReadFrom = nil }
        draw(motion: read.motion(from: snapshot)) {
            snapshot = read
            entry.screenChanged()
            if landsDrop { carryWritten() }
        }
        if landsDrop { carryDrawn() }
    }

    /// One transaction for one drawing: still, or the cards moved (each by its id slides, folds away or unfolds with the
    /// system's spring). Another day is drawn still: it came in through the day's own slide (`turn(to:)`).
    func draw(motion: BoardMotion, _ change: () -> Void) {
        if placedByDrop != nil { placedByDrop = nil }
        switch motion {
        case .still, .turn:
            var still = Transaction()
            still.disablesAnimations = true
            withTransaction(still, change)
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

    /// The vault's project notes changed: the screen reads again, once a carry or the quick entry's writes let it.
    func projectsChanged() async {
        guard carried == nil, !entry.writing else {
            readAfterCarry = true
            projectsAsked = true
            return
        }
        await reload()
    }

    /// The project notes changed while a carry or the quick entry held the read: it reads again whatever the file did.
    @ObservationIgnored private var projectsAsked = false

    /// The tasks file watched while the screen shows: a coordinated write elsewhere (iCloud, a reminder's button) reads again.
    func watchFile() {
        AppServices.shared.projects.changed = { [weak self] in
            Task { @MainActor in await self?.projectsChanged() }
        }
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

    private struct ScreenAt: Decodable {
        let mode: String
        let date: String
    }

    /// The finger starts carrying the day `shift` way when the core's `days.stepScreen` leads from this day's calendar to
    /// another day's (any other answer, Soon or the row's end, is the ribbon's own paging). Asked as the finger starts, so
    /// a swipe never pages the ribbon where the core leads to a day; the day comes in under the finger as the arrows bring
    /// it, the one read ahead, or read now when it is not yet.
    func beginDaySwipe(_ shift: Int) -> Bool {
        guard dayTurn == nil, turnsAhead == 0, carry == nil, let snapshot else { return false }
        let from: JSONValue = ["mode": "calendar", "date": .string(snapshot.day)]
        guard let at = try? board.read("days.stepScreen", [from, .number(Double(shift))], over: board.settingsOnly()).decode(ScreenAt.self),
              at.mode == "calendar" else { return false }
        // A text being typed is finished first, written for the day it was typed on, as before the arrows turn the day.
        if entry.isOpen || entry.writing {
            entry.blur()
            return true
        }
        let kept = ahead[at.date].flatMap { $0.tasksText == snapshot.tasksText ? $0 : nil }
        guard let peek = kept ?? (try? board.snapshot(day: at.date, measures: CardMetrics.timeline)) else { return true }
        dayTurn = DayTurn(peek: peek, shift: shift)
        dayShare = 0
        return true
    }

    /// The finger has carried the day this share of the way.
    func followDaySwipe(_ share: CGFloat) {
        guard dayTurn != nil else { return }
        dayShare = min(1, max(0, share))
    }

    /// Let go: the day runs on to the next one or back to where it stood, as the plugin's pager settles.
    func endDaySwipe(arrive: Bool) async {
        await afterTurns { [self] in await settleDaySwipe(arrive: arrive) }
    }

    private func settleDaySwipe(arrive: Bool) async {
        guard let turn = dayTurn else { return }
        let reached = await daySlide.run(from: dayShare, to: arrive ? 1 : 0) { [weak self] share in self?.dayShare = share }
        guard reached, dayTurn?.peek.day == turn.peek.day else { return }
        if arrive {
            shownDay = turn.peek.day == turn.peek.today ? nil : turn.peek.day
            neighbours = nil
            landTurn()
            Task { await reload() }
        } else {
            dayTurn = nil
            dayShare = 0
        }
    }

    var isToday: Bool { snapshot.map { $0.day == $0.today } ?? true }

    func step(_ days: Int) async {
        await afterTurns { [self] in
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
    }

    func showToday() async {
        await afterTurns { [self] in
            await entry.settle()
            guard let snapshot, snapshot.day != snapshot.today else { return }
            await turn(to: snapshot.today, motion: snapshot.day < snapshot.today ? 1 : -1)
            shownDay = nil
        }
    }

    /// The turns asked for and not yet landed, the one under way among them.
    @ObservationIgnored private var turnsAhead = 0
    /// The last turn asked for: the next one starts when it has landed and the screen has drawn its day.
    @ObservationIgnored private var lastTurn: Task<Void, Never>?

    /// A turn waits for the one under way, as the plugin's (decision 51): that one runs on from where it is to its day,
    /// never set down in one frame, and this one starts once that day is drawn, not once it is read again.
    private func afterTurns(_ work: @escaping @MainActor () async -> Void) async {
        let before = lastTurn
        turnsAhead += 1
        let mine = Task { @MainActor in
            await before?.value
            await work()
            turnsAhead -= 1
        }
        lastTurn = mine
        await mine.value
    }

    /// Another day, as the plugin turns it: the header and the hours stand still while in each column the day slides out
    /// and the next comes in, the header naming whichever stands nearer. The day read ahead comes in at once; another is
    /// read first. Arrived, the screen is read anew underneath.
    private func turn(to day: String, motion: Int) async {
        landTurn()
        shownDay = day
        neighbours = nil
        var peek = ahead[day].flatMap { $0.tasksText == snapshot?.tasksText ? $0 : nil }
        if peek == nil {
            let board = board
            peek = try? await Task.detached { try board.snapshot(day: day, measures: CardMetrics.timeline) }.value
        }
        guard let peek, shownDay == day else { return await reload() }
        dayTurn = DayTurn(peek: peek, shift: motion)
        dayShare = 0
        let arrived = await daySlide.run(from: 0, to: 1) { [weak self] share in self?.dayShare = share }
        if arrived { landTurn() }
        // The next turn starts from the day this one brought in, drawn now; the screen is read anew underneath, and a
        // read of a day no longer asked for is never drawn.
        Task { await reload() }
    }

    /// The day that came in stands for good: the screen is drawn from it, with no animation.
    private func landTurn() {
        daySlide.stop()
        guard let turn = dayTurn else { return }
        var instant = Transaction()
        instant.disablesAnimations = true
        forgetGone(turn.peek)
        withTransaction(instant) {
            snapshot = turn.peek
            entry.screenChanged()
            dayTurn = nil
            dayShare = 0
        }
    }

    /// The header's day while a day comes in: the one that stands nearer.
    var titleSnapshot: BoardSnapshot? {
        guard let turn = dayTurn, dayShare >= 0.5 else { return snapshot }
        return turn.peek
    }

    // MARK: A task's page

    /// Pages read ahead of their push, by task id.
    @ObservationIgnored private(set) var pages: [String: TaskPage] = [:]
    /// A page being read for its push: a second tap meanwhile pushes nothing more.
    @ObservationIgnored private var opening: String?

    /// A task's page: read first, in one go off the main thread, then pushed once.
    func openFullScreen(_ item: TaskItem) async {
        guard opening == nil, fullScreen.last?.id != item.id else { return }
        opening = item.id
        defer { opening = nil }
        guard await page(item) != nil, fullScreen.last?.id != item.id else { return }
        fullScreen.append(item)
    }

    /// The task as the file now has it, its subtasks, its list's name, the menus of its page and its description, kept
    /// for the page to draw its first frame from.
    @discardableResult
    func page(_ item: TaskItem) async -> TaskPage? {
        let board = board
        let screen = menuScreen
        guard let page = try? await Task.detached(operation: { try board.page(item, screen: screen) }).value else { return nil }
        pages[item.id] = page
        return page
    }

    // MARK: Search

    /// A found task shown: the ribbon goes where it lies and rings it until the next touch.
    func reveal(_ item: TaskItem) async {
        let board = board
        guard let place = try? await Task.detached(operation: { try board.write("tasks.reveal", [item.json]).decode(TaskScreenPlace.self) }).value else { return }
        if place.kind == "day" {
            go(to: .today)
            if let date = place.date ?? snapshot?.today { await go(toDay: date) }
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

    /// A section's header menu: inside a project's group (`menu.project`) only that project's tasks move.
    func renameSection(_ column: BoardColumn, _ menu: GroupMenu, to name: String) async {
        guard let list = sectionList(column) else { return }
        await write("tasks.renameGroup", [.string(list), .string(menu.section), .string(name)] + (menu.project.map { [$0] } ?? []))
    }

    func removeSection(_ column: BoardColumn, _ menu: GroupMenu) async {
        guard let list = sectionList(column) else { return }
        await write("tasks.removeGroup", [.string(list), .string(menu.section)] + (menu.project.map { [$0] } ?? []))
    }

    // MARK: Projects

    /// The title's menu: the list groups its tasks by project, or stops.
    func setGrouping(_ column: BoardColumn, _ on: Bool) async {
        await group("tasks.setGrouping", [.string(column.rawValue), .bool(on)])
    }

    /// A project group's header tapped: it folds, or opens again.
    func toggleFold(_ column: BoardColumn, _ key: String) async {
        UISelectionFeedbackGenerator().selectionChanged()
        await group("tasks.toggleFold", [.string(column.rawValue), .string(key)])
    }

    private func group(_ method: String, _ arguments: [JSONValue]) async {
        let board = board
        do {
            try await Task.detached { try board.group(method, arguments) }.value
        } catch {
            problem = Self.words(error)
        }
        await reload()
    }

    /// The Project page's pick: the tasks get the project (its link), or none.
    func setProject(_ items: [TaskItem], _ link: String?) async {
        await write("tasks.setProject", [keys(items), link.json])
        endSelection()
    }

    func openProject(of item: TaskItem) {
        guard let project = item.project else { return }
        Task { await openNote(project) }
    }

    /// The project's note in Obsidian: the folder mark's tap and the group's arrow.
    func openNote(_ project: ProjectRef) async {
        guard project.canOpenNote, let note = project.note, let vault = UserDefaults.standard.string(forKey: "vaultFolderName") else { return }
        var link = URLComponents(string: "obsidian://advanced-uri")!
        link.queryItems = [URLQueryItem(name: "vault", value: vault), URLQueryItem(name: "filepath", value: note)]
        if let url = link.url { await UIApplication.shared.open(url) }
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
    /// Told the moment a carry starts (a card, a section or the plus lifted): a gesture still waiting on the touch the
    /// drag took gives way, so the ribbon's own pan, which waits for the day swipe to fail, stops waiting.
    @ObservationIgnored var carryBegins: (() -> Void)?
    /// The card the drawing of a drop's write put in its new place: it goes there at once, hidden or not, never sliding
    /// over the list (its copy flies there). Until the next drawing.
    private(set) var placedByDrop: String?
    var carrying: Bool { carry != nil }
    /// The finger let the carry go: what it carries is still on its way to its place.
    private(set) var released = false
    /// The plus's slot is the cancel target while a finger holds a carry, and while the plus's own copy flies home into
    /// it; a card's copy flies to the card's place, so the slot is the plus again from the moment it is let go.
    var showsCancelTarget: Bool { carry.map { $0.id == Carried.plus || !released } ?? false }
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
        carryBegins?()
        found = nil
        arrival = nil
        ending = nil
        released = false
        touchdown = nil
        withAnimation(.snappy(duration: 0.25)) { carry = Carry(id: card.id, item: card.item, from: column, grab: grab) }
    }

    /// A section's header lifted: its header and tasks fold away and the list closes over them, as the plugin's.
    func startSectionCarry(_ column: BoardColumn, _ group: BoardGroup) {
        carryBegins?()
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
        released = false
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
        carryBegins?()
        ending = nil
        released = false
        touchdown = nil
        carry = Carry(id: Carried.plus, item: nil, from: "new", grab: 0)
    }

    /// The carry let go: it ends once its copy lands and, when it writes, once the screen shows the write.
    private func letGo(writes: Bool) {
        guard carry != nil, ending == nil else { return }
        ending = CarryEnd(writes: writes)
        released = true
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
        placedByDrop = carry?.id
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
        if projectsAsked {
            projectsAsked = false
            Task { await reload() }
        } else {
            Task { await reloadIfChanged() }
        }
    }

    /// The drag session ended, whatever came of it: anything still flying has landed. A drop still being written ends
    /// its carry once the screen shows the write.
    func carryEnded() {
        carryLanded()
    }

    /// A card's drag session ended with a drop. The board's own drop let the carry go when it took the drop, and its
    /// animation ends it; a drop nothing of the board took (another app's view, a field) ends it here, as a carry
    /// let go on no place: every carry ends exactly once.
    func carryDropped() {
        guard carry != nil, ending == nil else { return }
        letGo(writes: false)
        carryLanded()
    }

    /// The screen's drop session ended. Not dropped, a card's copy is still flying home: its card ends the carry once it
    /// is there. A section's lift has no end of its own, so its carry ends here.
    private func dropSessionEnded(performed: Bool) {
        if !performed, carry?.section == nil { return }
        carryEnded()
    }

    private func endCarry() {
        landsInFold = false
        carry = nil
        released = false
        gap = nil
        settling = nil
        sectionSlot = nil
        landing = nil
        hovered = nil
        litTitle = nil
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

    /// The frames of cards and headers the new drawing no longer shows (a group folded, a section gone) are dropped, so a
    /// carry never reads a header from an earlier drawing.
    private func forgetGone(_ read: BoardSnapshot) {
        for (column, list) in read.lists {
            guard var shape = geometry[column] else { continue }
            let cards = Set(list.cards.map(\.id))
            let heads = Set(list.groups.map(\.id) + list.projects.map(\.id))
            shape.cards = shape.cards.filter { cards.contains($0.key) }
            shape.heads = shape.heads.filter { heads.contains($0.key) }
            geometry[column] = shape
        }
    }

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
        dropping.register("title.\(column.rawValue)", DropPlace(
            hover: { [weak self] in self?.hoverTitle(column, at: $0) },
            leave: { [weak self] in self?.leaveTitle(column) },
            land: { [weak self] in self?.landOnTitle(column) }))
        if let frame = titleFrames[column] { dropping.move("title.\(column.rawValue)", visible: frame, origin: frame.origin) }
    }

    // MARK: A list's title as a place to drop on

    /// The title a carried card would land on: it lights as a drop target.
    private(set) var litTitle: BoardColumn?
    @ObservationIgnored private var titleFrames: [BoardColumn: CGRect] = [:]

    /// The title's row across its column, in the window.
    func titleMoved(_ column: BoardColumn, _ frame: CGRect) {
        titleFrames[column] = frame
        dropping.move("title.\(column.rawValue)", visible: frame, origin: frame.origin)
    }

    /// A card over the title lights it; the plus keeps the place at the list's top, as before.
    private func hoverTitle(_ column: BoardColumn, at point: CGPoint) {
        guard let carry, carry.section == nil else { return }
        guard carry.id != Carried.plus, snapshot?.lists[column]?.titleDrop != nil else { return hover(column, at: CGPoint(x: point.x, y: 0)) }
        if gap != nil { withAnimation(.snappy(duration: 0.12)) { gap = nil } }
        landing = nil
        guard litTitle != column else { return }
        UISelectionFeedbackGenerator().selectionChanged()
        withAnimation(.snappy(duration: 0.12)) { litTitle = column }
    }

    private func leaveTitle(_ column: BoardColumn) {
        leave(column)
        guard litTitle == column else { return }
        withAnimation(.snappy(duration: 0.2)) { litTitle = nil }
    }

    /// Let go on the title: the task goes where the core's drop on it means (`ScreenView.titleDrops`), its project kept.
    private func landOnTitle(_ column: BoardColumn) -> CGRect? {
        guard let carry, carry.section == nil else { return nil }
        guard carry.id != Carried.plus else { return land(column) }
        guard let to = snapshot?.lists[column]?.titleDrop, let item = carry.item else {
            letGo(writes: false)
            return nil
        }
        // As any drop: written, and the copy flies to where the core will leave the task (`tasks.landing`), the room
        // opened there; the carry ends once the copy has landed and the write is drawn.
        letGo(writes: true)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let others = others(in: column)
        let landed = landing(item, from: carry.from, to: to)
        let room = landed?.gap(in: column, among: others)
        if let room {
            withAnimation(.snappy(duration: 0.25)) { settling = ListGap(column: column, at: room.at, level: room.level, group: room.group, zone: room.zone, place: .null, line: nil) }
        }
        Task { await drop(item, from: carry.from, to: to) }
        // The room is the list's, in its content's space; the drop came down on the title, whose space it is given in.
        guard let rect = room.flatMap({ gapRect(column, ListGap(column: column, at: $0.at, level: $0.level, group: $0.group, zone: $0.zone, place: .null, line: nil)) }) ?? foldedHead(column, landed),
              let list = dropping.origin(of: "list.\(column.rawValue)"), let title = dropping.origin(of: "title.\(column.rawValue)") else { return nil }
        return rect.offsetBy(dx: list.x - title.x, dy: list.y - title.y)
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
            return PlacedCard(level: card.level, group: card.item.group, zone: card.zone, top: Double(frame.minY), height: Double(frame.height))
        }
        var heads: [PlacedHead] = []
        var before = 0
        for part in list.parts {
            switch part {
            case .project(let project):
                if let frame = shape.heads[project.id] {
                    heads.append(PlacedHead(group: project.head, opens: true, firstCard: before, top: Double(frame.minY), height: Double(frame.height)))
                }
            case .section(let index):
                let group = list.groups[index]
                if group.header != nil, let frame = shape.heads[group.id] {
                    heads.append(PlacedHead(group: group.place, firstCard: before, top: Double(frame.minY), height: Double(frame.height)))
                }
                before += group.cards.filter { !isCarried($0) }.count
            }
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
        let zone = place.field("project")
        // The card back where it was lifted from, at its level, changes nothing: the core's null, which comes back as no value.
        let stays = home.map { home in
            let drop: JSONValue? = ruleNow("rules.placeOfDrop", [Self.listCards(others), place, home])
            return drop == nil || drop == .null
        } ?? false
        let lights = list.groups.contains { $0.holds(group: group, zone: zone) && $0.empty }
        let shown = stays || lights ? nil : lineAt(column, at: Int(at), level: Int(fitted), group: group, zone: zone, home: home)
        let next = ListGap(column: column, at: Int(at), level: Int(fitted), group: group, zone: zone, place: place, line: shown)
        if litTitle != nil { withAnimation(.snappy(duration: 0.12)) { litTitle = nil } }
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
        let landed = landing(item, from: carry.from, to: to)
        let room = landed?.gap(in: column, among: others)
        if let room {
            withAnimation(.snappy(duration: 0.25)) { settling = ListGap(column: column, at: room.at, level: room.level, group: room.group, zone: room.zone, place: place, line: nil) }
        }
        Task {
            let dropAt = ContinuousClock.now
            await drop(item, from: carry.from, to: to)
            DropTiming.report(since: dropAt)
        }
        return room.flatMap { gapRect(column, ListGap(column: column, at: $0.at, level: $0.level, group: $0.group, zone: $0.zone, place: place, line: nil)) } ?? foldedHead(column, landed)
    }

    /// A card landing in a folded project part (`tasks.landing`'s `part.folded`) flies to that part's header, found by its
    /// key: nothing of the part is drawn to open a room in.
    private func foldedHead(_ column: BoardColumn, _ landed: DropLanding?) -> CGRect? {
        guard let part = landed?.part, part.folded == true, let shape = geometry[column],
              let project = snapshot?.lists[column]?.projects.first(where: { $0.key == part.key }),
              let head = shape.heads[project.id] else { return nil }
        landsInFold = true
        return head
    }

    /// The carry's copy lands in a folded part's header: it takes the header's size and fades out on the way.
    @ObservationIgnored private var landsInFold = false

    /// Where the core will leave `item` dropped `to`, asked before the write over the text the screen is drawn from, on
    /// the pure rules' context: no file is read and no background read is waited for in the frame of the drop.
    private func landing(_ item: TaskItem, from: String, to: JSONValue) -> DropLanding? {
        let tasks: JSONValue = [["key": item.key.json, "from": .string(from)]]
        guard let snapshot else { return nil }
        do {
            return try board.landing(tasks, to: to, over: snapshot).first
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
    private func lineAt(_ column: BoardColumn, at: Int, level: Int, group: String?, zone: JSONValue?, home: JSONValue?) -> CGPoint? {
        let probe = ListGap(column: column, at: at, level: level, group: group, zone: zone, place: .null, line: nil)
        guard let rect = gapRect(column, probe) else { return nil }
        if let home, let carry, home["index"].number.map(Int.init) == at, home["group"].string == group, home.field("project") == zone, let waiting = geometry[column]?.cards[carry.id] {
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
        let inPart = { (card: BoardCard) in card.item.group == gap.group && card.zone == gap.zone }
        if let next = others[safe: gap.at], inPart(next), let frame = shape.cards[next.id] {
            return CGRect(x: x, y: frame.minY, width: w, height: CardMetrics.height)
        }
        let above = others.prefix(gap.at).last(where: inPart)
        let header = list.groups.first { $0.holds(group: gap.group, zone: gap.zone) }.flatMap { shape.heads[$0.id] }
        // A project's part without a section stands under the project's header.
        let projectHead = gap.zone.flatMap { zone in list.projects.first { $0.zone == zone } }.flatMap { shape.heads[$0.id] }
        guard let frame = above.flatMap({ shape.cards[$0.id] }) ?? header ?? projectHead else { return nil }
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
        var gap: [String: JSONValue] = ["kind": "gap", "index": .number(Double(index)), "level": .number(Double(card.level)), "group": card.item.group.json]
        if let zone = card.zone { gap["project"] = zone }
        return .object(gap)
    }

    /// The cards as places in a list see them (`ListCard`): each in its section, and its project's part in a grouped list.
    static func listCards(_ cards: [BoardCard]) -> JSONValue {
        .array(cards.map { card in
            var json: [String: JSONValue] = ["id": .string(card.id), "key": card.item.key.json, "level": .number(Double(card.level)), "group": card.item.group.json]
            if let zone = card.zone { json["project"] = zone }
            return .object(json)
        })
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
    func cardMenu(_ item: TaskItem, later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu? {
        guard let menu = snapshot?.menus[item.id] else { return nil }
        let dark = UITraitCollection.current.userInterfaceStyle == .dark
        return MenuNode.uiMenu(TaskMenu(items: [item], menu: menu, model: self).nodes, later: later) { [weak self] in self?.ink($0, dark: dark) }
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

    /// Another day's calendar cards while it slides in: its read's stack, scaled to the hour shown. The stack laid out for
    /// the day shown is left as it is; the core lays the new day out once it stands.
    func slidingSlots(_ timeline: BoardTimeline, hour: CGFloat) -> [BoardSlot] {
        let read = CGFloat(CardMetrics.timeline.hour)
        return abs(hour - read) < 0.5 ? timeline.slots : Self.scaled(timeline.slots, from: read, to: hour)
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

    /// A reading drawn at a zoom other than its own: the core lays its stack out before the drawing, in its transaction,
    /// so no frame shows the scaled guess (a block a frame taller). A pinch asks on every frame and keeps to `layOut`.
    private func layOutNow(_ timeline: BoardTimeline) {
        guard let hour = zoom.hour, abs(Double(hour) - CardMetrics.timeline.hour) >= 0.5 else { return }
        if let slots = try? board.stack(timeline, measures: Self.measures(hour), pure: true) {
            laidOut = Laid(timeline: timeline, hour: hour, slots: slots)
        }
    }

    private static func measures(_ hour: CGFloat) -> TimelineMeasures {
        let m = CardMetrics.timeline
        return TimelineMeasures(hour: Double(hour), cardHeight: m.cardHeight, cardGap: m.cardGap, itemInset: m.itemInset, itemGap: m.itemGap, overlayInset: m.overlayInset)
    }

    private func layOut(_ timeline: BoardTimeline, hour: CGFloat) {
        wanted = (timeline, hour)
        guard !laying else { return }
        laying = true
        Task {
            while let next = wanted {
                wanted = nil
                let board = board
                let measures = Self.measures(next.hour)
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
