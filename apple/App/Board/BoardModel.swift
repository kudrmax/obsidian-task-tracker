import Core
import SwiftUI
import UIKit
import os

/// The places of the ribbon the tab bar switches: the Projects page, the whole screen, then three of two half-screen
/// columns each. Projects' raw value keeps the places saved before it came.
enum RibbonPlace: Int, Hashable, CaseIterable {
    case projects = -1, inbox = 0, soon, today

    var title: LocalizedStringKey {
        switch self {
        case .projects: "Projects"
        case .inbox: "Inbox"
        case .soon: "Soon"
        case .today: "Today"
        }
    }

    /// The words the tab bar shows.
    var name: String {
        switch self {
        case .projects: String(localized: "Projects")
        case .inbox: String(localized: "Inbox")
        case .soon: String(localized: "Soon")
        case .today: String(localized: "Today")
        }
    }

    /// The core's name of the place (`SCREEN_PLACES`): Today is the calendar's. Projects is none of the core's places: it
    /// shows no list of the funnel.
    var key: String {
        switch self {
        case .projects: "projects"
        case .inbox: "inbox"
        case .soon: "soon"
        case .today: "calendar"
        }
    }

    init?(key: String) {
        guard let place = Self.allCases.first(where: { $0.key == key }) else { return nil }
        self = place
    }

    /// Where the ribbon stood when the app last showed it, on this device: Today the first time.
    static func remembered() -> RibbonPlace {
        UserDefaults.standard.object(forKey: key).flatMap { $0 as? Int }.flatMap(RibbonPlace.init(rawValue:)) ?? .today
    }

    func remember() {
        UserDefaults.standard.set(rawValue, forKey: Self.key)
    }

    private static let key = "ribbonPlace"

    var symbol: String {
        switch self {
        case .projects: "folder"
        case .inbox: "tray"
        case .soon: "hourglass"
        case .today: "sun.max"
        }
    }
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
    /// The Projects page: the tree and the chosen node's tasks.
    @ObservationIgnored let projects = ProjectsBoard()
    /// The timeline's zoom, kept across days.
    @ObservationIgnored let zoom = TimelineZoom()

    init() {
        place = RibbonPlace.remembered()
        entry.model = self
        projects.model = self
    }

    /// A screen the quick entry read after its write, drawn in the transaction the entry draws its own state in.
    func draw(_ read: BoardSnapshot) {
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

    /// Where the ribbon stands, remembered on the device as the plugin's wheel is. A swipe sets it as the ribbon settles;
    /// `go(to:)` moves the ribbon there.
    var place: RibbonPlace {
        didSet { if place != oldValue { place.remember() } }
    }
    /// The place a tap on a tab asked the ribbon to scroll to, each ask new.
    private(set) var asked: PlaceAsk?

    struct PlaceAsk: Equatable {
        let place: RibbonPlace
        /// To the Done column, left of the place.
        var done = false
        let id = UUID()
    }

    func go(to place: RibbonPlace) {
        self.place = place
        asked = PlaceAsk(place: place)
    }
    private(set) var snapshot: BoardSnapshot? {
        didSet {
            if let snapshot { CardMetrics.follow(snapshot.look) }
            if let timeline = snapshot?.timeline, timeline != oldValue?.timeline {
                // A drop's calendar was laid out as it was let go: that stack, not another ask of the core.
                if let laid = comingLaid, laid.timeline == timeline {
                    laidOut = laid
                    comingLaid = nil
                } else if let laid = slidingLaid, laid.timeline == timeline, laid.hour == zoom.hour {
                    laidOut = laid
                } else {
                    layOutNow(timeline)
                }
            }
        }
    }
    /// The screen a drop leaves while it is drawn: the lists draw it in the let-go's frame, the rest of the board (the
    /// calendar, the titles) in the next, so no one frame does all of the drop's drawing.
    @ObservationIgnored private var coming: (serial: Int, snapshot: BoardSnapshot)?
    @ObservationIgnored private var comingSerial = 0
    /// The screen as it is drawn now, or as the drop under way leaves it: what the lists and the drop read, never observed.
    var drawing: BoardSnapshot? { coming?.snapshot ?? snapshot }
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
    /// «New project…» picked on a Project page: the alert asks the name for these tasks or for the quick entry's field.
    var newProjectFor: NewProjectAsk?
    var fullScreen: [TaskItem] = []
    /// The full screen opened by Description (Add description): its page opens with the caret in the description.
    var describing: String?

    /// Description in a menu: the task on the whole screen, typing its description, as the plugin's Add description.
    func describe(_ item: TaskItem) {
        describing = item.id
        Task { await openFullScreen(item) }
    }

    /// A read asked for while one runs: it runs again once that one ends, so the screen always ends on the latest ask.
    private var readAgain = false
    /// A read the file asked for while something was carried or the quick entry wrote: made once they end.
    private var readAfterCarry = false
    /// The reads started so far, counted as each begins.
    @ObservationIgnored private var readsStarted = 0
    /// The day before and after the shown one, read ahead so the arrows show them in the same frame.
    @ObservationIgnored private var ahead: [String: BoardSnapshot] = [:]
    @ObservationIgnored private var neighbours: (previous: String, next: String)?
    /// Another day coming in, as the plugin's `DayTrack`: the day read for it and the side it comes from (1: the next).
    private(set) var dayTurn: DayTurn? {
        didSet { coverHours() }
    }
    /// How far the day has come in, 0 to 1. Only the parts that read it move: the day's cards in each column.
    var dayShare: CGFloat = 0 {
        didSet { coverHours() }
    }

    /// Whose now pill lies over the hours' labels while a day slides: the labels redraw only when this changes.
    private(set) var pillOver = PillOver.shown

    enum PillOver {
        case shown, coming, none
    }

    private func coverHours() {
        let width = calendarWidth
        let pill = TimelineGeometry.nowWidth
        let over: PillOver = dayTurn == nil || dayShare * width < pill ? .shown : (1 - dayShare) * width < pill ? .coming : .none
        if over != pillOver { pillOver = over }
    }
    @ObservationIgnored private let daySlide = DaySlide()

    struct DayTurn {
        let peek: BoardSnapshot
        let shift: Int
        /// A finger took the turn where it showed: the finger, not the turn that started it, lets it go.
        var caught = false
    }
    @ObservationIgnored private var watch: FileWatch?
    @ObservationIgnored private var settingsWatch: FileWatch?

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
        if doneShown { await readDone() }
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

    /// The screen drawn from `read` in one transaction, its motion chosen by what differs from the drawing on the screen.
    /// While a drop's preview stands, a read begun before its write is not drawn: it shows the file from before the drop.
    private func show(_ read: BoardSnapshot, serial: Int) {
        guard dropReads.mayDraw(serial) else { return }
        if let before = snapshot { follow(read.dayChange(since: before), from: before) }
        defer { if reopen, read.day == read.today, !readAgain { reopen = false; dayMoved += 1 } }
        draw(motion: read.motion(from: snapshot)) {
            snapshot = read
            sectionMove = nil
            entry.screenChanged()
        }
    }

    /// One transaction for one drawing: still, or the cards moved (each by its id slides, folds away or unfolds with the
    /// system's spring). Another day is drawn still: it came in through the day's own slide (`turn(to:)`).
    func draw(motion: BoardMotion, _ change: () -> Void) {
        switch motion {
        case .still, .turn:
            var still = Transaction()
            still.disablesAnimations = true
            withTransaction(still, change)
        case .change:
            withAnimation(.snappy, change)
        }
    }

    /// Reads again only when the screen no longer stands for the files or the clock: the tasks file changed (Obsidian,
    /// Sync, a reminder's button), the settings (a list renamed, a colour changed), a calendar file Sync brought, or a
    /// minute passed since the read. While a card is carried or the quick entry's writes run, the read waits for them:
    /// the entry draws each of its writes itself, in the same drawing as the line it ends.
    func reloadIfChanged() async {
        guard carried == nil, !entry.writing else {
            readAfterCarry = true
            return
        }
        let board = board
        guard let files = try? await Task.detached(operation: { try board.files() }).value else { return }
        guard let snapshot, snapshot.readFrom(files), snapshot.current(at: files.now) else { return await reload() }
    }

    // MARK: The clock

    /// The host's clock, as the plugin keeps it (`DayService`'s `onDayChange`, `catchUp`): while the screen shows, the
    /// screen is read at each new minute, so the now line and an overdue task riding it move and a day that passed
    /// brings the new today. A carry, a day's turn or the quick entry (typing or writing) hold the tick until they let go.
    @ObservationIgnored private var clock: Task<Void, Never>?

    /// Bumped when the day's start hour moved: the calendar opens today afresh, on the now line.
    private(set) var dayMoved = 0
    @ObservationIgnored private var reopen = false

    func startClock() {
        guard clock == nil else { return }
        clock = Task { [weak self] in
            while !Task.isCancelled {
                let now = Date()
                let next = Calendar.current.dateInterval(of: .minute, for: now)?.end ?? now.addingTimeInterval(60)
                try? await Task.sleep(for: .seconds(next.timeIntervalSince(now) + 0.05))
                while !Task.isCancelled, self?.clockHeld == true { try? await Task.sleep(for: .seconds(1)) }
                guard !Task.isCancelled, let self else { return }
                await self.reloadIfChanged()
            }
        }
    }

    func stopClock() {
        clock?.cancel()
        clock = nil
    }

    private var clockHeld: Bool { carried != nil || entry.isOpen || entry.writing || dayTurn != nil || running != nil }

    /// Today by the clock: a screen that showed today shows the new today; another start hour opens today afresh.
    private func follow(_ change: DayChange?, from before: BoardSnapshot) {
        guard let change else { return }
        neighbours = nil
        ahead = [:]
        let showedToday = shownDay == nil || shownDay == before.today
        if change == .moved { reopen = true }
        guard change == .moved || showedToday, shownDay != nil else { return }
        shownDay = nil
        readAgain = true
    }

    /// The tasks file and the plugin's settings watched while the screen shows: a write elsewhere (Obsidian, iCloud, a
    /// reminder's button) reads again, and a setting changed in Obsidian redraws the screen at once, as the plugin's.
    func watchFile() {
        let changed: @Sendable () -> Void = { [weak self] in
            Task { @MainActor in await self?.reloadIfChanged() }
        }
        if watch == nil { watch = AppServices.shared.vault.watchTasksFile(changed) }
        if settingsWatch == nil { settingsWatch = AppServices.shared.vault.watchSettingsFile(changed) }
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
        settingsWatch?.cancel()
        settingsWatch = nil
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
                if let kept = ahead[other], kept.readAlike(shown) { continue }
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
        // A carry the finger holds takes no swipe.
        guard carry == nil else { return false }
        // A day still sliding (an arrow's turn, a swipe let go) is taken by the finger where it shows now, as a scroll
        // view's deceleration is: the turns asked after it give way to the finger.
        if let turn = dayTurn {
            daySlide.stop()
            turnEpoch += 1
            dayTurn?.caught = true
            swipeSign = shift == turn.shift ? 1 : -1
            swipeBase = dayShare
            return true
        }
        guard turnsAhead == 0, let snapshot else { return false }
        swipeSign = 1
        swipeBase = 0
        let from: JSONValue = ["mode": "calendar", "date": .string(snapshot.day)]
        guard let at = try? board.read("days.stepWheel", [from, .number(Double(shift))], over: board.settingsOnly()).decode(ScreenAt.self),
              at.mode == "calendar" else { return false }
        // A text being typed is finished first, written for the day it was typed on, as before the arrows turn the day.
        if entry.isOpen || entry.writing {
            entry.blur()
            return true
        }
        let kept = ahead[at.date].flatMap { $0.readAlike(snapshot) ? $0 : nil }
        guard let peek = kept ?? (try? board.snapshot(day: at.date, measures: CardMetrics.timeline)) else { return true }
        dayTurn = DayTurn(peek: peek, shift: shift)
        dayShare = 0
        return true
    }

    /// The finger has carried the day this share of the way.
    func followDaySwipe(_ share: CGFloat) {
        guard dayTurn != nil else { return }
        dayShare = min(1, max(0, swipeBase + swipeSign * share))
    }

    /// The finger's swipe against the turn it carries: 1 the same way, -1 back; and the share it took the turn at.
    @ObservationIgnored private var swipeSign: CGFloat = 1
    @ObservationIgnored private var swipeBase: CGFloat = 0

    /// Let go: the day runs on to the next one or back to where it stood, as the plugin's pager settles: a flick goes
    /// the way it was flicked (`onward`: the swipe's own way), else the day goes where more than half of it stands.
    /// The finger let go going `speed` points per millisecond the way it started: the day arrives where the core's
    /// `swipeLanding` takes it.
    func endDaySwipe(speed: CGFloat) async {
        let arrive = swipeLanding(moved: dayShare, distance: 1, speed: speed * CGFloat(swipeSign)) == 1
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
            // Back where it stood: the day shown is the one asked again (a caught turn had asked for the other).
            if let shown = snapshot { shownDay = shown.day == shown.today ? nil : shown.day }
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
    /// Counts the fingers that took a sliding day: a turn asked before one is not made.
    @ObservationIgnored private var turnEpoch = 0
    /// The last turn asked for: the next one starts when it has landed and the screen has drawn its day.
    @ObservationIgnored private var lastTurn: Task<Void, Never>?

    /// A turn waits for the one under way, as the plugin's (decision 51): that one runs on from where it is to its day,
    /// never set down in one frame, and this one starts once that day is drawn, not once it is read again.
    private func afterTurns(_ work: @escaping @MainActor () async -> Void) async {
        let before = lastTurn
        let epoch = turnEpoch
        turnsAhead += 1
        let mine = Task { @MainActor in
            await before?.value
            // A finger took the day meanwhile: what was asked before it gives way.
            if epoch == turnEpoch { await work() }
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
        var peek = ahead[day].flatMap { shown in snapshot.map(shown.readAlike) == true ? shown : nil }
        if peek == nil {
            let board = board
            peek = try? await Task.detached { try board.snapshot(day: day, measures: CardMetrics.timeline) }.value
        }
        guard let peek, shownDay == day else { return await reload() }
        dayTurn = DayTurn(peek: peek, shift: motion)
        dayShare = 0
        let arrived = await daySlide.run(from: 0, to: 1) { [weak self] share in self?.dayShare = share }
        // Taken by a finger: the finger's swipe lands it or brings it back.
        if dayTurn?.caught == true { return }
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
        withTransaction(instant) {
            snapshot = turn.peek
            entry.screenChanged()
            dayTurn = nil
            dayShare = 0
        }
        // A carry over the day that came in (a swipe let go, or a day arrow it was held over) points at that day's places
        // now, the finger still: its lists are drawn at once and the place under the finger is read anew.
        guard carry != nil else { return }
        for list in lists.values { list.controller?.update() }
        drag.holdAgain()
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
        if place.list == "done" {
            await openDone()
            found = doneCards.first { $0.item.id == item.id }?.id
            return
        }
        found = snapshot?.item(item.id) != nil ? item.id : nil
    }

    // MARK: Done

    /// The Done column, left of Inbox: only the search opens it, and the ribbon leaving it for Inbox closes it.
    private(set) var doneShown = false
    /// Its cards and their menus, read as it opens and again with each read while it shows.
    private(set) var doneCards: [BoardCard] = []
    @ObservationIgnored private var doneMenus: [String: TaskMenuModel] = [:]

    func openDone() async {
        await readDone()
        withAnimation(.snappy) { doneShown = true }
        // The tab bar names the nearest place: Inbox, beside the Done column.
        place = .inbox
        asked = PlaceAsk(place: .inbox, done: true)
    }

    func closeDone() {
        guard doneShown else { return }
        doneShown = false
        doneCards = []
        doneMenus = [:]
    }

    private func readDone() async {
        guard let snapshot else { return }
        let board = board
        let rows = snapshot.screen.done.map { ListRow(item: $0, level: 0) }
        let screen = menuScreen
        guard let read = try? await Task.detached(operation: { () throws -> ([BoardCard], [String: TaskMenuModel]) in
            let cards = try board.cards(rows)
            var menus: [String: TaskMenuModel] = [:]
            for card in cards { menus[card.item.id] = try board.read("tasks.menu", [card.item.json, "done", screen], over: board.settingsOnly()) }
            return (cards, menus)
        }).value else { return }
        doneCards = read.0
        doneMenus = read.1
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
        return snapshot.screen.menuScreen(today: snapshot.today, day: snapshot.day)
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

    /// The menu and the picks stay for the next label: the picked tasks keep their ids through the write.
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

    /// A section's header menu: Rename.
    func renameSection(_ column: BoardColumn, _ menu: GroupMenu, to name: String) async {
        guard let list = sectionList(column) else { return }
        await write("tasks.renameGroup", [.string(list), .string(menu.section), .string(name)])
    }

    func removeSection(_ column: BoardColumn, _ menu: GroupMenu) async {
        guard let list = sectionList(column) else { return }
        await write("tasks.removeGroup", [.string(list), .string(menu.section)])
    }

    // MARK: Projects

    /// The Project page's No project: the tasks' projects all go.
    func setProject(_ items: [TaskItem], _ name: String?) async {
        await write("tasks.setProject", [keys(items), name.json])
        endSelection()
    }

    /// A project picked on the Project page: on for every task, or off for all when all had it.
    func toggleProject(_ items: [TaskItem], _ name: String) async {
        await write("tasks.toggleProject", [keys(items), .string(name)])
        endSelection()
    }

    /// «New project…» on a Project page: the name is asked; the quick entry's field keeps its keyboard's place meanwhile.
    func askNewProject(_ target: NewProjectAsk.Target) {
        if case .entry = target { entry.paused = true }
        newProjectFor = NewProjectAsk(target: target)
    }

    /// The name asked for «New project…»: a project at the tree's top (`tasks.newProject`), checked on the tasks, or the
    /// quick entry's field given it; a taken name is that project; a blank one, or Cancel (`name` nil), changes nothing.
    func newProject(_ name: String?, for target: NewProjectAsk.Target) async {
        defer { if case .entry = target { entry.resume() } }
        guard let name else { return }
        let board = board
        var keys: [TaskKey] = []
        if case .tasks(let items) = target { keys = items.map(\.key) }
        let made: ProjectRef?
        do {
            made = try await Task.detached { [keys] in try board.newProject(name, for: keys) }.value
        } catch {
            problem = Self.words(error)
            return
        }
        await reload()
        endSelection()
        if case .entry = target, let made { entry.setProject(made.name) }
    }

    /// Apple's Calendar at an event, as the plugin opens it on the iPhone (`calshow:`, seconds from 2001): at its start.
    func openInCalendar(_ event: WireEvent) {
        let start = Date(timeIntervalSince1970: event.startMs / 1000)
        if let url = URL(string: "calshow:\(Int(start.timeIntervalSinceReferenceDate))") { UIApplication.shared.open(url) }
    }

    /// A note of the vault in Obsidian, by its path, through Advanced URI as every Open in Obsidian of the app: a title's
    /// note link.
    func openNote(_ path: String) {
        guard let vault = UserDefaults.standard.string(forKey: "vaultFolderName") else { return }
        var link = URLComponents(string: "obsidian://advanced-uri")!
        link.queryItems = [URLQueryItem(name: "vault", value: vault), URLQueryItem(name: "filepath", value: path)]
        if let url = link.url { UIApplication.shared.open(url) }
    }

    /// Cards for rows drawn outside the lists (the full screen's subtasks), coloured and dated as a list draws them.
    func cards(_ rows: [ListRow]) async -> [BoardCard] {
        let board = board
        return (try? await Task.detached { try board.cards(rows) }.value) ?? []
    }

    /// What a tap on a card's folder mark does: the Projects page opens on the task's project, the branches above it open.
    func projectOpener(_ item: TaskItem) -> (() -> Void)? {
        guard let project = item.project, project.mark else { return nil }
        return { [weak self] in self?.openProject(project) }
    }

    /// The Projects page on `project`: chosen, with the branches above it opened (`tasks.selectProjectNode`).
    func openProject(_ project: ProjectRef) {
        fullScreen = []
        go(to: .projects)
        Task { await projects.select(project.name) }
    }

    /// A card on the calendar lifted with its subtasks while a subtask is typed under it (Add Subtask there).
    var stackShown: ShownStack?

    struct ShownStack {
        let card: BoardCard
        /// Where the card stands, on the screen.
        let frame: CGRect
    }

    /// A link in a title tapped: an address opens as it is, a note in Obsidian, the file the core resolves it to.
    func openLink(_ part: TextPart) {
        guard let target = part.target else { return }
        if part.kind == "url" {
            if let url = URL(string: target) { UIApplication.shared.open(url) }
            return
        }
        let board = board
        Task {
            guard let note = try? await Task.detached(operation: { try board.noteToOpen(target) }).value else { return }
            openNote(note.path)
        }
    }

    /// The vault's files listed again, back in front: a note made, renamed or moved elsewhere is offered by `[[` and
    /// opened by a link.
    func refreshNotes() async {
        let board = board
        await Task.detached { board.refreshNotes() }.value
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

    /// The day list's width beside the calendar for the saved share of the screen, and the bounds the divider moves
    /// within (`rules.listWidths`); the divider is drawn over the line, taking no width of its own.
    func listWidths(share: Double, viewWidth: CGFloat) -> ListWidths? {
        let key = "\(share)/\(viewWidth)"
        if let known = widths[key] { return known }
        guard let found = try? board.listWidths(share: share, viewWidth: Double(viewWidth), dividerWidth: 0) else { return nil }
        if widths.count > 256 { widths = [:] }
        widths[key] = found
        return found
    }

    @ObservationIgnored private var widths: [String: ListWidths] = [:]

    /// Where the divider dragged towards `wanted` stands, the finger moving `speed` points per millisecond: brought slowly
    /// near the middle it holds to it (`rules.dividerAt`).
    func dividerAt(_ wanted: CGFloat, widths: ListWidths, speed: Double) -> DividerStop? {
        try? board.dividerAt(Double(wanted), widths: widths, speed: speed)
    }

    /// Where a screen let go after a swipe lands, never further than the next one (`rules.swipeLanding`): 1 on, -1 back,
    /// 0 where it stood.
    func swipeLanding(moved: CGFloat, distance: CGFloat, speed: CGFloat) -> Int {
        (try? board.swipeLanding(moved: Double(moved), distance: Double(distance), speed: Double(speed))) ?? 0
    }

    /// The share a divider let go at `width` saves (`rules.listShareOf`).
    func listShare(of width: CGFloat, viewWidth: CGFloat) -> Double? {
        ruleNow("rules.listShareOf", [.number(Double(width)), .number(Double(viewWidth)), .number(0)])
    }

    /// Whether Select Tasks picks a card drawn at `from` (a list column's, never the calendar's), as the core says.
    func canPick(_ from: String) -> Bool {
        if let known = pickable[from] { return known }
        let found: Bool = ruleNow("rules.canPick", [.string(from)]) ?? false
        pickable[from] = found
        return found
    }

    @ObservationIgnored private var pickable: [String: Bool] = [:]

    // MARK: Drag and drop

    /// What a carry holds: a card (its task, the column it is drawn in), the other picked tasks with it, a section by its
    /// header, or the plus, a task not written yet. The board's drag (`DragController`) begins and ends it.
    struct Carry {
        /// This carry among all: what ends a carry names it, so an earlier session's end never ends a later carry.
        let token: Int
        let id: String
        let item: TaskItem?
        let from: String
        /// A section lifted by its header, carried among its list's sections.
        var section: SectionCarry? = nil
        /// Select Tasks: every picked task the lift carries (`tasks.carried`), each with the column it is drawn in; empty
        /// for a card carried alone.
        var group: [(item: TaskItem, from: String)] = []
        /// Let go where it writes: the screen after the drop stands, the cards in their new places, while the copy lands.
        var landed = false

        /// What `tasks.drop` takes: each carried task's key and where it was drawn.
        var dropped: JSONValue {
            let carried = group.isEmpty ? item.map { [($0, from)] } ?? [] : group
            return .array(carried.map { ["key": $0.0.key.json, "from": .string($0.1)] })
        }
    }

    /// A section carried by its header, as the plugin's (`GroupDrag`): its list, its sections' names and its own index.
    struct SectionCarry {
        let column: BoardColumn
        let list: String
        let names: [String?]
        let lifted: Int
    }

    private(set) var carry: Carry? {
        didSet {
            markCards()
            // The rows a carry folds away (a card's subtasks, the other picked tasks, a lifted section's) go and come back.
            if oldValue?.token != carry?.token || oldValue?.group.count != carry?.group.count || oldValue?.landed != carry?.landed {
                for list in lists.values { list.controller?.update() }
            }
        }
    }
    @ObservationIgnored private var carries = CarryTurns()
    var carried: String? { carry?.id }
    var carrying: Bool { carry != nil }
    /// The plus's slot is the cancel target while anything is carried.
    var showsCancelTarget: Bool { carry != nil }
    /// Told the moment a carry starts: a gesture still waiting on the touch the drag took gives way, so the ribbon's own
    /// pan, which waits for the day swipe to fail, stops waiting.
    @ObservationIgnored var carryBegins: (() -> Void)?

    /// What lights for a carry held over a list or a title: the card a subtask would go under, an empty section's plate,
    /// the title. The target itself is the gap the system opens.
    enum DropHover: Equatable {
        case list(BoardColumn, place: JSONValue, plate: String?)
        case title(BoardColumn)
    }

    private(set) var hover: DropHover?
    /// The minute a carry held over the calendar would start at.
    private(set) var landing: Int?
    /// Which reads may draw while drops are written.
    @ObservationIgnored private var dropReads = DropReads()
    /// The lists on the screen, which a drop's preview is drawn into at once.
    @ObservationIgnored private var lists: [BoardColumn: WeakList] = [:]
    /// The one routing of a carry's point to its place.
    @ObservationIgnored let route = BoardRoute()
    /// The board's drag: lift, carry, drop.
    @ObservationIgnored lazy var drag = DragController(model: self, route: route)

    private struct WeakList {
        weak var controller: ListController?
    }

    func register(_ list: ListController) {
        lists[list.column] = WeakList(controller: list)
        route.add(list)
    }

    func listController(_ column: BoardColumn) -> ListController? { lists[column]?.controller }

    private func begin() -> Int {
        carryBegins?()
        // Set only when it changes: the board reads it, and a set redraws all of it.
        if found != nil { found = nil }
        return carries.begin()
    }

    /// A card lifted: its row is the gap it was lifted from; its subtasks, and with a picked card the other picked tasks,
    /// fold away while it is carried. A picked card carries every picked task the core says go along (`tasks.carried`).
    @discardableResult
    func startCarry(_ card: BoardCard, from column: String) -> Int {
        let token = begin()
        guard selecting, picked.contains(card.id), let snapshot else {
            withAnimation(CarryMotion.carry) { carry = Carry(token: token, id: card.id, item: card.item, from: column) }
            return token
        }
        let picked = pickedItems
        let froms = Dictionary(picked.map { ($0.id, snapshot.column(of: $0.id) ?? column) }, uniquingKeysWith: { first, _ in first })
        let all = picked.map { (item: $0, from: froms[$0.id] ?? column) }
        withAnimation(CarryMotion.carry) { carry = Carry(token: token, id: card.id, item: card.item, from: column, group: all) }
        let board = board
        let arguments: [JSONValue] = [card.item.key.json, keys(picked)]
        Task {
            guard let kept: [TaskKey] = try? await Task.detached(operation: {
                try board.read("tasks.carried", arguments, over: try board.files(), as: [TaskKey].self)
            }).value,
                  carry?.token == token else { return }
            // The core names the ones that go along with the lifted one, which leads, by their keys as read.
            let going = kept.compactMap { key in all.first { $0.item.key == key } }
            carry?.group = [(item: card.item, from: column)] + going
        }
        return token
    }

    /// A project lifted in the tree by its row: carried among the tree's gaps, to reorder or nest it.
    @discardableResult
    func startTreeCarry(_ row: ProjectsRow) -> Int {
        let token = begin()
        withAnimation(CarryMotion.carry) { carry = Carry(token: token, id: row.node, item: nil, from: "tree") }
        return token
    }

    /// A section's header lifted: its tasks fold away and the list closes over them, as the plugin's.
    @discardableResult
    func startSectionCarry(_ column: BoardColumn, _ group: BoardGroup) -> Int? {
        guard let list = snapshot?.lists[column], let name = list.sectionsOf, let lifted = list.groups.firstIndex(where: { $0.id == group.id }) else { return nil }
        let token = begin()
        let section = SectionCarry(column: column, list: name, names: list.groups.map(\.name), lifted: lifted)
        withAnimation(CarryMotion.carry) {
            carry = Carry(token: token, id: "\u{0}section/\(group.id)", item: nil, from: column.rawValue, section: section)
        }
        return token
    }

    @discardableResult
    func startCarryingPlus() -> Int {
        let token = begin()
        carry = Carry(token: token, id: Carried.plus, item: nil, from: "new")
        return token
    }

    /// The carry ended, its copy down, whatever came of it: once, and only the carry under way.
    func endCarry(_ token: Int) {
        guard carries.end(token) else { return }
        arriving = []
        previews.clear()
        if readAfterDrop {
            readAfterDrop = false
            Task { await reload() }
        }
        withAnimation(CarryMotion.carry) {
            carry = nil
            hover = nil
            landing = nil
        }
        readIfAsked()
    }

    /// A read the file asked for while a carry or the quick entry's writes held it: made now.
    func readIfAsked() {
        guard readAfterCarry, carried == nil, !entry.writing else { return }
        readAfterCarry = false
        Task { await reloadIfChanged() }
    }

    /// A press may lift `card` now, in a list or on the calendar alike: nothing else is carried, no text is being typed,
    /// and the card may be lifted at all.
    func mayLift(_ card: BoardCard, from column: String) -> Bool {
        drag.mayLift && entry.state == nil && canLift(card, from: column)
    }

    /// A press may lift section `group` by its header now.
    func mayLift(_ group: BoardGroup, in column: BoardColumn) -> Bool {
        drag.mayLift && entry.state == nil && canLift(group, in: column)
    }

    /// A card may be lifted: any card but while tasks are picked, then only a picked one.
    func canLift(_ card: BoardCard, from column: String) -> Bool {
        !selecting || (canPick(column) && picked.contains(card.id))
    }

    /// A section may be lifted by its header: where the list moves sections, never while tasks are picked.
    func canLift(_ group: BoardGroup, in column: BoardColumn) -> Bool {
        !selecting && group.reorder && snapshot?.lists[column]?.sectionsOf != nil
    }

    /// The section a carry lifted: its tasks are folded away in its list while it is carried, and come back in the drop's
    /// own motion as it is let go.
    func isLifted(_ group: BoardGroup, in column: BoardColumn) -> Bool {
        carry?.landed != true && hidesHeader(group, in: column)
    }

    /// The header of the section a carry holds: its floating copy stands for it until the copy is down.
    func hidesHeader(_ group: BoardGroup, in column: BoardColumn) -> Bool {
        guard let section = carry?.section, section.column == column else { return false }
        return section.names.indices.contains(section.lifted) && section.names[section.lifted] == group.name
    }

    /// The copy of carry `token` is down: the cards and the header it lands as show in this same frame, the carry ends,
    /// and only the rows the carry drew otherwise (the carried card's dashed place, the cards it lands as) are drawn anew
    /// now; the rows it folded away come back in their own motion.
    func finishCarry(_ token: Int) {
        let changed = landingIds
        CardControl.reveal(changed)
        for list in lists.values { list.controller?.showHeaders(all: true) }
        endCarry(token)
        for list in lists.values { list.controller?.redraw(changed) }
    }

    /// The carried card itself, wherever the screen draws it: its copy stands for it until the carry ends, once the copy
    /// is down (let go where it writes, in its new row).
    func isHidden(_ card: BoardCard) -> Bool { isHidden(card.id) }

    private func isHidden(_ id: String) -> Bool { id == carry?.id || arriving.contains(id) }

    /// A drop's copy is flying into the screen the drop left: what comes with it waits for it to land.
    var dropFlies: Bool { carry?.landed == true && carry?.section == nil }

    /// The carried card's own row is its dashed place, until the carry lands or ends.
    func isWaiting(_ card: BoardCard) -> Bool { isWaiting(card.id) }

    private func isWaiting(_ id: String) -> Bool { id == carry?.id && carry?.landed != true }

    /// What a carry draws on one card, observed by that card's row alone: a carry lifted, landing or ended redraws only the
    /// rows whose card it hides or turns into its dashed place, never every row of every list.
    @Observable
    final class CardMark {
        /// Its copy stands for it: the card is not drawn.
        fileprivate(set) var hidden = false
        /// Its row is the dashed place it was lifted from.
        fileprivate(set) var waiting = false
    }

    @ObservationIgnored private var cardMarks: [String: CardMark] = [:]

    /// The carry's marks on the card of task `id`.
    func mark(_ id: String) -> CardMark {
        if let known = cardMarks[id] { return known }
        let made = CardMark()
        made.hidden = isHidden(id)
        made.waiting = isWaiting(id)
        cardMarks[id] = made
        return made
    }

    /// Each card's marks set anew from the carry, only where they change, in the transaction the carry changed in.
    private func markCards() {
        for (id, mark) in cardMarks {
            let hidden = isHidden(id), waiting = isWaiting(id)
            if mark.hidden != hidden { mark.hidden = hidden }
            if mark.waiting != waiting { mark.waiting = waiting }
        }
    }

    /// The cards a drop's copy is still flying into: their place stands empty until it lands, as the system's own list
    /// drop keeps its row.
    private(set) var arriving: Set<String> = [] {
        didSet { markCards() }
    }


    /// The cards the copy of the carry lands as: the carried card, and the card it is in the screen after the drop. They
    /// stay hidden until the copy is down, then show in that frame (`CardControl.reveal`).
    var landingIds: Set<String> {
        var ids = arriving
        if let id = carry?.id { ids.insert(id) }
        return ids
    }

    /// The card the last drop landed as, in the screen it leaves.
    private(set) var landedId: String?

    /// The card `id` as the screen draws it now: in a list, or on the calendar as the stack at the zoom shown draws it (its
    /// corner is that stack's: the read's own stack is laid out at the default zoom).
    func drawnCard(_ id: String, onCalendar: Bool) -> BoardCard? {
        guard let snapshot = drawing else { return nil }
        if onCalendar { return stacked(snapshot.timeline, hour: calendarHour).first { $0.id == id }?.card }
        for list in snapshot.lists.values { if let card = list.cards.first(where: { $0.id == id }) { return card } }
        return nil
    }

    /// A drop on the column's title means something: a card carried, the list taking it there.
    func titleTakes(_ column: BoardColumn) -> Bool {
        guard let carry, carry.item != nil, carry.section == nil else { return false }
        return snapshot?.lists[column]?.titleDrop != nil
    }

    /// A subtask of the carried card, or another picked task carried with it: folded away while it is carried.
    func isFolded(_ card: BoardCard) -> Bool {
        guard let carry, carry.section == nil, !carry.landed, card.id != carry.id else { return false }
        return isCarried(card)
    }

    /// Whether a card stands in the carry: the card itself or one of its subtasks, which go with it.
    func isCarried(_ card: BoardCard) -> Bool {
        guard let carry else { return false }
        if card.id == carry.id { return true }
        let lifted = carry.group.isEmpty ? carry.item.map { [$0] } ?? [] : carry.group.map(\.item)
        return lifted.contains { $0.id == card.item.id || Self.contains($0, card.item) }
    }

    /// The cards a carry over `column` moves between: the column's, without the carried ones.
    func others(in column: BoardColumn) -> [BoardCard] {
        (snapshot?.lists[column]?.cards ?? []).filter { !isCarried($0) }
    }

    // MARK: A list as a place to drop on

    /// The place a carry over `column` points at, the rows standing still under it, as the plugin's (`rules.placeAt`):
    /// `cards` and `heads` where they stand in the list without the carried ones, the finger at `point`. A card is placed
    /// by its middle (`rules.carriedMiddle`, the finger's hold on it known from the lift), the plus by the finger; the level
    /// by the finger's `x` (`rules.levelAt`); the place shown holds until the finger is well past it.
    func placeUnder(_ column: BoardColumn, cards: [PlacedCard], heads: [PlacedHead], at point: CGPoint, grab: CGFloat?, width: CGFloat, held: JSONValue?) -> JSONValue? {
        let inset = Double(CardMetrics.columnInset)
        // A folded result's card of two lines is held by its own middle.
        let carried = carry.flatMap { $0.from == "timeline" ? nil : $0.item }.map { CardFace($0.card).twoLines ? CardMetrics.twoLineHeight : CardMetrics.height } ?? CardMetrics.height
        let y = grab.flatMap { try? board.carriedMiddle(y: Double(point.y), grab: Double($0), cardHeight: Double(carried)) } ?? Double(point.y)
        do {
            let level = try board.levelAt(x: Double(point.x), left: inset, width: Double(width) - 2 * inset, indent: Double(CardMetrics.indent))
            let hold = held ?? carry.flatMap { homeGap($0.id, in: column) } ?? .null
            return try board.placeAt(cards, y: y, level: level, shift: 0, room: .null, heads: heads, held: hold, hysteresis: CardMetrics.dropHysteresis)
        } catch {
            problem = Self.words(error)
            return nil
        }
    }


    /// Whether `column` places the carry under the finger in a gap, or only at its end (`rules.placesInGap`, as the
    /// plugin asks it): a list that shows no sections takes a card from another column at its end.
    func placesInGap(_ column: BoardColumn, carrying payload: DragPayload?) -> Bool {
        let from = payload?.from ?? "new"
        let grouped = snapshot?.lists[column]?.sectioned ?? false
        let key = "\(column.rawValue)/\(from)/\(grouped)"
        if let known = inGap[key] { return known }
        let found = (try? board.placesInGap(column: column.rawValue, from: from, grouped: grouped)) ?? true
        inGap[key] = found
        return found
    }

    @ObservationIgnored private var inGap: [String: Bool] = [:]

    /// The gap the carried card was lifted from in `column`, at its level: nil when it was not lifted from this list.
    func liftedFrom(_ column: BoardColumn) -> JSONValue? {
        carry.flatMap { homeGap($0.id, in: column) }
    }

    /// `place` is the gap the carried card was lifted from (at any level): its line stands over its dashed place.
    func isLiftedGap(_ column: BoardColumn, _ place: JSONValue) -> Bool {
        guard let home = liftedFrom(column) else { return false }
        return ruleNow("rules.sameGap", [place, home]) ?? false
    }

    /// What a carry held over a list at `place` shows and what a drop there writes: the drop line, or an empty section's
    /// lit plate; at the card's own place (`stays`, a drop there writes nothing) no line, only its dashed place, as the
    /// plugin's. `to`: the drop (`DropTo`) let go there.
    struct Aim {
        let stays: Bool
        let plate: Bool
        let to: JSONValue?
    }

    /// The carry held over a list at `place`: an empty section's plate lights, as the plugin's; no card lights. `anywhere`:
    /// the list places the carry in a gap (`placesInGap`); else at its end, the drop naming no place.
    @discardableResult
    func hoverList(_ column: BoardColumn, place: JSONValue, anywhere: Bool) -> Aim {
        guard let list = snapshot?.lists[column] else { return Aim(stays: false, plate: false, to: nil) }
        let meant: JSONValue?
        if carry?.item == nil {
            meant = place
        } else if anywhere {
            let home: JSONValue = liftedFrom(column) ?? .null
            meant = ruleNow("rules.placeOfDrop", [Self.listCards(others(in: column)), place, home])
        } else {
            meant = .null
        }
        let stays = anywhere && (meant == nil || meant == .null)
        let to: JSONValue? = stays ? nil : ["kind": "place", "column": .string(column.rawValue), "place": meant ?? .null]
        let plate = list.groups.first { $0.empty && $0.holds(group: place["group"].string) }?.id
        let next = DropHover.list(column, place: place, plate: plate)
        if next != hover {
            if case .list(_, let shown, _) = hover, shown["index"] != place["index"] || shown["level"] != place["level"] || shown["group"] != place["group"] {
                CarryFeel.tick()
            }
            landing = nil
            withAnimation(CarryMotion.hover) { hover = next }
            if let to { prefetch(to) }
        }
        return Aim(stays: stays, plate: plate != nil, to: to)
    }

    func leaveList(_ column: BoardColumn) {
        guard case .list(column, _, _) = hover else { return }
        withAnimation(CarryMotion.hover) { hover = nil }
    }

    /// The empty section a carry would land in: its plate lights, as the plugin's (`is-hot`).
    func platesLit(_ column: BoardColumn, _ group: BoardGroup) -> Bool {
        if case .list(column, _, let plate) = hover { return plate == group.id }
        return false
    }

    /// What came of a drop: back where it was lifted from (nothing written), written with the card's id in the screen
    /// it leaves, or nothing the board takes.
    enum Dropped {
        case stays
        case landed(DropLanding?)
        case refused
    }

    /// Let go over a list where `aim` was shown: its drop is written and its screen drawn at once.
    func dropOnList(_ aim: Aim) -> Dropped {
        guard let carry, carry.item != nil, carry.section == nil else { return .refused }
        guard let to = aim.to, !aim.stays else { return .stays }
        return land(carry, to: to)
    }

    /// A card carried over a column's title: it lights where a drop on it means something (`ScreenView.titleDrops`).
    func hoverTitle(_ column: BoardColumn) -> Bool {
        guard let carry, carry.item != nil, carry.section == nil, snapshot?.lists[column]?.titleDrop != nil else { return false }
        guard hover != .title(column) else { return true }
        CarryFeel.tick()
        landing = nil
        withAnimation(CarryMotion.hover) { hover = .title(column) }
        if let to = snapshot?.lists[column]?.titleDrop { prefetch(to) }
        return true
    }

    func leaveTitle(_ column: BoardColumn) {
        guard hover == .title(column) else { return }
        withAnimation(CarryMotion.hover) { hover = nil }
    }

    func isTitleLit(_ column: BoardColumn) -> Bool { hover == .title(column) }

    /// Let go on the title: the task goes where the core's drop on it means, its project kept.
    func dropOnTitle(_ column: BoardColumn) -> Dropped {
        guard let carry, carry.item != nil, carry.section == nil, let to = snapshot?.lists[column]?.titleDrop else { return .refused }
        return land(carry, to: to)
    }

    /// The carried tasks dropped `to`: the screen the core says the drop leaves (`tasks.dropPreview`) is drawn at once,
    /// every list in the same animation the system drops the card in, then the drop is written; the read after the write
    /// draws the same screen, so nothing moves again. A carry of picked tasks ends Select Tasks, as any action does.
    private func land(_ carry: Carry, to: JSONValue) -> Dropped {
        guard let snapshot else { return .refused }
        let preview: DropPreview
        do {
            // Worked out while the carry was held there; else (let go the moment it came over the place) asked now.
            preview = try previews.take(PreviewKey(carry: carry, to: to, over: snapshot)).flatMap { try $0.get() }
                ?? board.dropPreview(carry.dropped, to: to, over: snapshot, measures: CardMetrics.timeline)
        } catch {
            problem = Self.words(error)
            return .refused
        }
        CarryFeel.drop()
        // The screen after the drop in one drawing: the carried tasks in their new rows, the selection ended after it.
        landedId = preview.landings.first?.id
        // The card the copy lands as waits for it; the other picked tasks come in with the rows, the copy being the lead's.
        arriving = Set(preview.landings.prefix(1).map(\.id))
        showPreview(preview.snapshot, landed: true)
        if !carry.group.isEmpty { endSelection() }
        writeDrop("tasks.drop", [carry.dropped, to, .string(snapshot.day)])
        return .landed(preview.landings.first)
    }

    /// The screens drops would leave, worked out off the main thread while a carry is held over a place
    /// (`TaskBoard`'s previews' own core), so the let-go draws at once instead of asking the core in its frame.
    @ObservationIgnored private let previews = Prefetch<PreviewKey, Result<DropPreview, Error>>(label: "com.kudrmax.taskcalendar.preview")

    /// A drop's preview by what it drops, where, over which screen.
    struct PreviewKey: Hashable, Sendable {
        let tasks: JSONValue
        let to: JSONValue
        let day: String
        let text: String?

        init(carry: Carry, to: JSONValue, over snapshot: BoardSnapshot) {
            tasks = carry.dropped
            self.to = to
            day = snapshot.day
            text = snapshot.tasksText
        }
    }

    /// The carry is held over the place a drop `to` means: its preview is worked out now, off the main thread.
    private func prefetch(_ to: JSONValue) {
        guard let carry, carry.item != nil, carry.section == nil, let snapshot else { return }
        let key = PreviewKey(carry: carry, to: to, over: snapshot)
        let board = board, measures = CardMetrics.timeline, tasks = carry.dropped
        previews.want(key) {
            Result { try board.dropPreview(tasks, to: to, over: snapshot, measures: measures) }
        }
    }

    /// The last drop's write: the next one waits for it, so drops are written in the order they were let go.
    @ObservationIgnored private var lastDrop: Task<Void, Never>?

    /// A drop's write after its screen was drawn: in drop order; a read begun before it never draws, the one after it does.
    private func writeDrop(_ method: String, _ arguments: [JSONValue]) {
        let before = lastDrop
        let board = board
        lastDrop = Task {
            await before?.value
            let dropAt = ContinuousClock.now
            do {
                _ = try await Task.detached { try board.write(method, arguments) }.value
            } catch {
                problem = Self.words(error)
            }
            dropReads.written(readsStarted: readsStarted)
            DropTiming.report(since: dropAt)
            // The read after the write draws the screen the preview drew: made once the copy is down, never redrawing the
            // board under the copy's flight.
            if carry != nil { readAfterDrop = true } else { await reload() }
        }
    }

    /// A drop's write finished while its copy still flew: the board reads once the carry has ended.
    @ObservationIgnored private var readAfterDrop = false

    /// The screen a drop leaves, drawn now: every list and the calendar in this same frame, in the copy's one animation.
    private func showPreview(_ next: BoardSnapshot, landed: Bool = false) {
        dropReads.previewDrawn()
        // The lists' rows open and close in this frame, in the copy's own spring; the rest of the board (the calendar's
        // blocks moving to their new stack, in the same spring) one frame on, so the let-go's frame is not the whole
        // board's drawing at once.
        comingSerial += 1
        let serial = comingSerial
        coming = (serial, next)
        withAnimation(CarryMotion.dropAnimation) {
            if landed { carry?.landed = true }
            if hover != nil { hover = nil }
            if landing != nil { landing = nil }
        }
        // The calendar the drop leaves, laid out at the zoom shown now: the copy flies to its block in it.
        if next.timeline != snapshot?.timeline, let hour = zoom.hour, abs(Double(hour) - CardMetrics.timeline.hour) >= 0.5,
           let slots = try? board.stack(next.timeline, measures: Self.measures(hour), pure: true) {
            comingLaid = Laid(timeline: next.timeline, hour: hour, slots: slots)
        }
        for list in lists.values { list.controller?.update() }
        NextFrame.run { [self] in
            guard coming?.serial == serial else { return }
            withAnimation(CarryMotion.dropAnimation) {
                snapshot = next
                entry.screenChanged()
            }
            coming = nil
        }
    }

    /// A section let go before the section at `slot` (nil: at the list's end): moved there (`tasks.moveGroup`), unless
    /// that is its own place.
    @discardableResult
    func dropSection(_ column: BoardColumn, _ group: BoardGroup, slot: Int?) -> Bool {
        guard let section = carry?.section, section.column == column, let list = snapshot?.lists[column] else { return false }
        let at = slot ?? section.names.count
        guard let place: JSONValue = ruleNow("rules.groupPlaceOf", [.array(section.names.map(\.json)), .number(Double(section.lifted)), .number(Double(at))]),
              !place.isNull else { return false }
        CarryFeel.drop()
        // The section stands where it was let go, header and tasks, until the read after its write draws it there: the
        // core has no preview of a section's move, so its group moves among the drawn groups, nothing else.
        dropReads.previewDrawn()
        sectionMove = SectionMove(column: column, group: group.id, before: list.groups[safe: at]?.id)
        carry?.landed = true
        for list in lists.values { list.controller?.update() }
        writeDrop("tasks.moveGroup", [.string(section.list), section.names[section.lifted].json, place])
        return true
    }

    /// A section let go and written, drawn where it was let go until the read after its write.
    struct SectionMove: Equatable {
        let column: BoardColumn
        let group: String
        /// The group it goes before; nil: the list's end.
        let before: String?
    }

    private(set) var sectionMove: SectionMove?

    /// Where the copy of a drop written in `column` goes, as the plugin's: the card the task is drawn as on the screen now,
    /// in that list first, then any other list, then the calendar;
    /// where none shows (a past day's list sends the task to Soon, off the screen), the copy fades where it was let go,
    /// never back to where it was lifted from.
    func landingOnScreen(_ landed: DropLanding?, from column: BoardColumn) -> CarryLanding {
        guard let landed else { return .away }
        var places: [(place: CarryLanding, rect: CGRect, shown: CGRect)] = []
        for other in [column] + BoardColumn.allCases.filter({ $0 != column }) {
            guard let list = listController(other), let shown = list.shown, let landing = list.landing(of: landed) else { continue }
            places.append((landing, landing.rect, shown))
        }
        if let canvas = calendarCanvas as? CanvasProbe.Probe, let shown = canvas.target.area, let drawn = drawing,
           let rect = slotRect(landed.id, in: drawn.timeline) {
            let block = canvas.convert(rect, to: nil)
            places.append((CarryLanding(rect: block, onCalendar: true), block, shown))
        }
        return LandingPick.first(places) ?? .away
    }

    /// The plus let go on a list's place: the field opens there.
    func openPlus(_ column: BoardColumn, place: JSONValue) {
        guard let at: JSONValue = ruleNow("rules.placeOfDrop", [Self.listCards(others(in: column)), place, .null]) else { return }
        entry.openAtDrop(column, ["kind": "place", "column": .string(column.rawValue), "place": at])
    }

    // MARK: Stretching a calendar card

    /// The calendar card tapped, as the plugin selects it: ringed, with the two dots that stretch it, until a touch
    /// elsewhere once its menu has gone.
    private(set) var selectedSlot: String?
    /// Where the selected card stands, in the window: a touch there keeps it selected (its dots lie on its edges).
    @ObservationIgnored var selectedFrame: CGRect = .null
    /// The selected card while a dot is held: the span it shows, minutes from the day's start.
    private(set) var stretched: (id: String, start: Int, end: Int)?

    func select(_ slot: BoardSlot) {
        selectedSlot = slot.card.item.can.resize ? slot.id : nil
    }

    /// A touch anywhere: one outside the selected card and its dots lets it go, but not the touch that closes its menu.
    func touched(at point: CGPoint) {
        guard selectedSlot != nil, stretched == nil, !CardControl.menuShowing else { return }
        if !selectedFrame.insetBy(dx: -Self.gripReach, dy: -Self.gripReach).contains(point) { selectedSlot = nil }
    }

    private static let gripReach: CGFloat = 24

    /// A dot held at `minute` of the grid: the card shows the span the core gives (`tasks.stretch`).
    func stretch(_ slot: BoardSlot, edge: String, minute: Int) {
        guard let day = snapshot?.day,
              let span: StretchSpan = try? board.read("tasks.stretch", [slot.card.item.json, .string(day), .string(edge), .number(Double(minute))], over: board.settingsOnly())
        else { return }
        guard stretched?.start != span.start || stretched?.end != span.end || stretched?.id != slot.id else { return }
        if stretched != nil { UISelectionFeedbackGenerator().selectionChanged() }
        stretched = (slot.id, span.start, span.end)
    }

    /// The dot let go at `minute`: the new time written as the core says (`tasks.resize`); a card no longer than its
    /// least height (`least` minutes) loses its duration.
    func endStretch(_ slot: BoardSlot, edge: String, minute: Int, least: Double) async {
        guard let day = snapshot?.day else { return }
        let board = board
        let arguments: [JSONValue] = [slot.card.item.key.json, .string(day), .string(edge), .number(Double(minute)), .number(least)]
        do {
            let changed = try await Task.detached { try board.write("tasks.resize", arguments).bool ?? false }.value
            if changed { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        } catch {
            problem = Self.words(error)
        }
        await reload()
        stretched = nil
    }

    // MARK: The calendar as a place to drop on

    /// The hour's height the calendar is drawn at now: a carry over it reads minutes by it.
    @ObservationIgnored var calendarHour: CGFloat = CardMetrics.hour
    @ObservationIgnored var calendarWidth: CGFloat = 0
    /// The calendar's content, which a carry over it reads its minute from.
    @ObservationIgnored weak var calendarCanvas: UIView?

    /// The carry held over the calendar at `minute` of its grid: the line on the grid's step.
    func hoverCalendar(minute: Double) {
        guard carry?.section == nil else { return }
        let snapped = snap(minute, hourHeight: calendarHour)
        if hover != nil { withAnimation(CarryMotion.hover) { hover = nil } }
        guard snapped != landing else { return }
        if landing != nil { CarryFeel.tick() }
        withAnimation(CarryMotion.hover) { landing = snapped }
        prefetch(["kind": "time", "start": .number(Double(snapped))])
        DropLog.target("calendar \(snapped)")
    }

    func leaveCalendar() {
        guard landing != nil else { return }
        withAnimation(CarryMotion.hover) { landing = nil }
    }

    /// A long press on the calendar's empty space, held at `minute` of the grid: the line shows where a new task will
    /// stand, as the plus carried there.
    func pressCalendar(at minute: Double) {
        if landing == nil { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        hoverCalendar(minute: minute)
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

    /// Let go over the calendar: the drop's screen is drawn at once; the copy flies to the block the core makes there
    /// (`tasks.landing`'s span and stack): on the now line for a past time of today. Its rect in the calendar's content.
    func dropOnCalendar() -> CGRect? {
        guard let carry, carry.section == nil, carry.item != nil, let minute = landing, snapshot != nil else { return nil }
        let to: JSONValue = ["kind": "time", "start": .number(Double(minute))]
        guard case .landed(let landed) = land(carry, to: to), let landed, let drawn = drawing else { return nil }
        return slotRect(landed.id, in: drawn.timeline)
    }

    /// Where the calendar draws the block of `id` in the screen `timeline` stands for, in the calendar's content: the same
    /// stack it draws (`stacked`), so the copy lands exactly on the block.
    private func slotRect(_ id: String, in timeline: BoardTimeline) -> CGRect? {
        guard let slot = stacked(timeline, hour: calendarHour).first(where: { $0.id == id }) else { return nil }
        let box = slot.box
        let left = TimelineGeometry.itemsLeft + CGFloat(box.left)
        return CGRect(
            x: left,
            y: TimelineGeometry.labelLift + CGFloat(box.top),
            width: max(1, calendarWidth - left - TimelineGeometry.itemsRight - CGFloat(CardMetrics.timeline.itemInset)),
            height: max(CGFloat(box.height), CardMetrics.height))
    }

    /// The plus let go on the calendar: the field opens at the line's time; its place in the calendar's content.
    func plusOnCalendar() -> CGRect? {
        guard let minute = landing else { return nil }
        let top = CGFloat(minute) / 60 * calendarHour + TimelineGeometry.labelLift
        leaveCalendar()
        entry.openAtDrop(nil, ["kind": "time", "start": .number(Double(minute))])
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

    /// Where a card carried alone was lifted from in its own list: let go there at its level, nothing is written.
    private func homeGap(_ id: String, in column: BoardColumn) -> JSONValue? {
        guard carry?.group.isEmpty != false else { return nil }
        guard let cards = snapshot?.lists[column]?.cards, let index = cards.firstIndex(where: { $0.names(id) }) else { return nil }
        let card = cards[index]
        return ["kind": "gap", "index": .number(Double(index)), "level": .number(Double(card.level)), "group": card.item.group.json]
    }

    /// The cards as places in a list see them (`ListCard`): each in its section.
    static func listCards(_ cards: [BoardCard]) -> JSONValue {
        .array(cards.map(\.listCard))
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

    /// A label's name as the screen shows it (`rules.labelTitle`): the tag's underscores read as spaces.
    func labelTitle(_ name: String) -> String {
        ruleNow("rules.labelTitle", [.string(name)]) ?? name
    }

    /// A weekly schedule's days as the Repeat row tells them: the week's letters (`REPEAT_WORDS`), the days off it as a
    /// dash, so the seven places read as the week.
    func weekLetters(_ days: [Int]) -> String {
        guard let words = repeatWords else { return "" }
        return words.weekdays.enumerated().map { days.contains($0.offset) ? $0.element.letter : "–" }.joined(separator: " ")
    }

    @ObservationIgnored private lazy var repeatWords: RepeatWords? = try? board.repeatWords()

    /// A level's or a label's colour as a menu's flag draws it, in either theme.
    func ink(_ color: String, dark: Bool) -> UIColor? {
        guard let hex: String = try? board.rule("rules.inkOf", [.string(color), .string(dark ? "dark" : "light")]) else { return nil }
        return UIColor(Color(hex: hex))
    }

    /// The card's menu as UIKit draws it, read from the screen as it stands. `later` holds a row that opens a sheet or a
    /// page until the menu has gone. Over the core's rows, as the plugin shows them over its menu: the start of the task's
    /// description, and, for a card on the calendar (`from: "timeline"`), its open subtasks, each opening its own menu.
    /// A result's card shows its next step (`CardFace.step`): a tap on the card opens the step's menu, a tap on the result's
    /// own line over it (`over`) the result's (results, point 5); on the calendar the step's, the result's open subtasks
    /// above it as for any task (point 8).
    func cardMenu(_ card: BoardCard, from: String = "list", over: Bool = false, later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu? {
        let item = over ? card.item : card.face.step ?? card.item
        guard let menu = snapshot?.menus[item.id] ?? doneMenus[item.id] ?? projects.menus[item.id] else { return nil }
        let dark = UITraitCollection.current.userInterfaceStyle == .dark
        let nodes = lead(item, stack: card.item, from: from) + TaskMenu(items: [item], menu: menu, model: self, selectsText: true).nodes
        return MenuNode.uiMenu(nodes, later: later) { [weak self] in self?.ink($0, dark: dark) }
    }

    /// What the plugin shows between a card and its menu, as the menu's first groups: `item`'s description, and on the
    /// calendar the open subtasks of the card's task (`stack`).
    private func lead(_ item: TaskItem, stack: TaskItem, from: String) -> [MenuNode] {
        var lead: [MenuNode] = []
        if let peek = descriptionPeek(item) { lead.append(.group(row: false, children: peek)) }
        if from == "timeline", !stack.subtasks.isEmpty {
            lead.append(.group(row: false, children: stack.subtasks.map(stackRow)))
        }
        return lead
    }

    /// A subtask's row over a calendar card's menu, opening its own menu. A folded result among them follows its card's two
    /// taps (results, point 5): the row is its step, whose menu it opens, the result's title under it; that menu starts with
    /// the result's own row, which opens the result's menu.
    private func stackRow(_ subtask: TaskItem) -> MenuNode {
        let symbol = subtask.closed ? "checkmark.circle" : "circle"
        guard let step = subtask.card.step, let over = subtask.card.over else {
            return .deferred(title: subtask.card.title, symbol: symbol, subtitle: nil) { [weak self] in
                await self?.stackMenu(subtask) ?? []
            }
        }
        return .deferred(title: subtask.card.title, symbol: symbol, subtitle: over) { [weak self] in
            guard let self else { return [] }
            let result: MenuNode = .deferred(title: over, symbol: "scope", subtitle: nil) { [weak self] in await self?.stackMenu(subtask) ?? [] }
            return [.group(row: false, children: [result])] + (await self.stackMenu(step))
        }
    }

    private func stackMenu(_ item: TaskItem) async -> [MenuNode] {
        guard let menu = await menu(for: item, from: "stack") else { return [] }
        return TaskMenu(items: [item], menu: menu, model: self).nodes
    }

    /// The start of a task's description, as the plugin's peek: its lines as they read (links by their words, no
    /// markup), the menu cutting it at its own height, a tap opening the task on the whole screen; under it each link of
    /// it, a tap opening the link.
    private func descriptionPeek(_ item: TaskItem) -> [MenuNode]? {
        guard let description = item.description?.trimmingCharacters(in: .whitespacesAndNewlines), !description.isEmpty else { return nil }
        let start = description.split(separator: "\n", omittingEmptySubsequences: true).joined(separator: "\n")
        let parts = ruleNow("rules.textParts", [.string(start)]) ?? [TextPart(text: start)]
        let shown = parts.map { $0.isLink ? $0.shown : Self.readable($0.text ?? "") }.joined()
        var rows: [MenuNode] = [.action(title: shown, symbol: "text.alignleft", opens: true) { [weak self] in Task { await self?.openFullScreen(item) } }]
        var seen: Set<String> = []
        for link in parts where link.isLink {
            guard let target = link.target, seen.insert(target).inserted else { continue }
            rows.append(.action(title: link.shown, symbol: link.kind == "url" ? "safari" : "doc.text") { [weak self] in self?.openLink(link) })
        }
        return rows
    }

    /// Markdown's inline marks read as text, as Obsidian draws them: `**intro**` reads «intro».
    private static func readable(_ markdown: String) -> String {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: markdown, options: options)).map { String($0.characters) } ?? markdown
    }

    // MARK: The timeline's zoom

    /// The calendar's task cards at an hour's height: the read's own at its height; at another, the stack the core laid
    /// out last, its places scaled to this height while the core lays it out anew off the main thread (a pinch asks on
    /// every frame).
    func stacked(_ timeline: BoardTimeline, hour: CGFloat) -> [BoardSlot] {
        if abs(Double(hour) - CardMetrics.timeline.hour) < 0.5 { return timeline.slots }
        if let laid = comingLaid, laid.timeline == timeline, laid.hour == hour { return laid.slots }
        let laid = laidOut.flatMap { $0.timeline == timeline ? $0 : nil }
        // Only the calendar the board draws is laid out: a view still holding the day a turn left (drawn once more in the
        // turn's own transaction) asks for a stack that, come back, would replace the new day's and slide it in again.
        if laid?.hour != hour, timeline == drawing?.timeline { layOut(timeline, hour: hour) }
        guard let laid else { return Self.scaled(timeline.slots, from: CGFloat(CardMetrics.timeline.hour), to: hour) }
        return laid.hour == hour ? laid.slots : Self.scaled(laid.slots, from: laid.hour, to: hour)
    }

    /// Another day's calendar cards while it slides in: stacked by the core at the hour shown, as they will stand once it
    /// has come in, so the day lands with no card moving. The stack laid out for the day shown is left as it is.
    func slidingSlots(_ timeline: BoardTimeline, hour: CGFloat) -> [BoardSlot] {
        if abs(Double(hour) - CardMetrics.timeline.hour) < 0.5 { return timeline.slots }
        if let laid = slidingLaid, laid.timeline == timeline, laid.hour == hour { return laid.slots }
        guard let slots = try? board.stack(timeline, measures: Self.measures(hour), pure: true) else {
            return Self.scaled(timeline.slots, from: CGFloat(CardMetrics.timeline.hour), to: hour)
        }
        slidingLaid = Laid(timeline: timeline, hour: hour, slots: slots)
        return slots
    }

    /// The stack of the day sliding in, at the hour it was laid out for: the day that comes in stands in it.
    @ObservationIgnored private var slidingLaid: Laid?

    /// The last stack the core laid out, and for which timeline and hour.
    private(set) var laidOut: Laid?

    struct Laid {
        let timeline: BoardTimeline
        let hour: CGFloat
        let slots: [BoardSlot]
    }

    @ObservationIgnored private var laying = false
    /// The stack of the calendar a drop leaves, laid out as it is let go, until the board draws that calendar.
    @ObservationIgnored private var comingLaid: Laid?
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
                if let slots = try? await Task.detached(operation: { try board.stack(timeline, measures: measures) }).value, timeline == drawing?.timeline {
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

/// «New project…» asked: for which tasks, or for the quick entry's field.
struct NewProjectAsk: Identifiable {
    enum Target {
        case tasks([TaskItem])
        case entry
    }

    let id = UUID()
    let target: Target
}
