import Foundation

/// A colour in both themes: the frontend picks by the one it draws in.
public struct Themed<Value: Sendable & Hashable>: Sendable, Hashable {
    public let dark: Value
    public let light: Value

    public init(dark: Value, light: Value) {
        self.dark = dark
        self.light = light
    }
}

/// A subtask's branch lines (`rules.branchOf`): whether its own line bends in (the last of its task's subtasks) or goes
/// on to a sibling, and for each task further up, from the outermost subtask level, whether that one's line runs past it.
public struct Branch: Decodable, Sendable, Hashable {
    public let last: Bool
    public let through: [Bool]

    public init(last: Bool, through: [Bool]) {
        self.last = last
        self.through = through
    }
}

/// How a card is coloured: the shades of each of its colours (`TaskItem.colors`, `rules.shadesOf`), the first tinting its
/// dot and corner; a card of several labels is painted with every one of them, as stripes or, with `blend`, one colour
/// flowing into the next (the settings' `labelPaint`).
public struct CardPaint: Sendable, Hashable {
    public let colors: [Themed<Shades>]
    public let blend: Bool

    public init(colors: [Themed<Shades>], blend: Bool) {
        self.colors = colors
        self.blend = blend
    }
}

/// What a card's face shows and whose menu its taps open, as the core gives it for where the card is drawn: a list's card
/// (`TaskItem.card`), the timeline's block (`TaskItem.block`), or the task's own title (the full screen, a search).
public struct CardFace: Sendable, Hashable {
    /// The title drawn, with its links.
    public let text: String
    /// The small line over the title; nil for a card of one line.
    public let over: String?
    /// The symbol before the small line: a target over a folded task's next step, a folder over a task's subproject.
    public let overSymbol: String
    /// Whose menu a tap on the card (but on `over`) opens; nil: the card's own task.
    private let steps: [TaskItem]
    public var step: TaskItem? { steps.first }

    public init(text: String, over: String? = nil, overSymbol: String = "scope", step: TaskItem? = nil) {
        self.text = text
        self.over = over
        self.overSymbol = overSymbol
        self.steps = step.map { [$0] } ?? []
    }

    /// What the core says a card draws (`TaskItem.card`): a list's (a folded task's next step under its title), and the task's
    /// own title on the full screen and in a search, whose items carry that card.
    public init(_ card: TaskCard) {
        self.init(text: card.text, over: card.over, step: card.step)
    }

    /// The timeline's block (`TaskItem.block`): no line over it, and regular weight, as a block has no room for marks.
    public static func block(_ item: TaskItem) -> CardFace {
        CardFace(text: item.block.text, step: item.block.step)
    }

    /// Two lines: the folded task's title over its next step.
    public var twoLines: Bool { over != nil }
}

/// A card as a column draws it: its task, how deep it stands, the corner, and its colours.
public struct BoardCard: Sendable, Hashable, Identifiable {
    public let item: TaskItem
    public let level: Int
    public let branch: Branch?
    public let due: DueLabel?
    public let repeats: Bool
    public let paint: CardPaint?
    /// The first colour's shades: the card's tint, its dot's and its corner's.
    public var shades: Themed<Shades>? { paint?.colors.first }
    /// On the timeline, the corner's two lines (`stackCorner`): the start a stacked card is put on, or the duration of one
    /// shorter than it; nil for neither, and on a list's card.
    public let corner: [String]?
    /// The card's identity on the screen: its task's id, the core's, so a card changed, moved or ticked stays the same
    /// card and the lists move it to its new place instead of drawing a new one; on the Projects page, where a task of
    /// two parts is two cards, the core's id of the card (`ProjectsCard.id`).
    public var id: String { drawnId ?? item.id }
    private let drawnId: String?
    /// Its title in pieces (`rules.textParts`): text, and links drawn in the accent that a tap opens.
    public let parts: [TextPart]
    /// What its face shows: the task's own title, or a folded task's next step under the task's title.
    public let face: CardFace
    /// The Projects screen's mark of where the task stands in the funnel, in the date's place (`ProjectsStage`): a symbol.
    public let stage: String?

    /// The card shows the task `id`.
    public func names(_ id: String) -> Bool { item.id == id }

    /// Drawn in section `group`.
    public func stands(in group: String?) -> Bool { item.group == group }

    /// The card as the places of its list see it (`ListCard`): its task's id and key, level and section.
    public var listCard: JSONValue {
        ["id": .string(item.id), "key": item.key.json, "level": .number(Double(level)), "group": item.group.json]
    }

    public init(item: TaskItem, level: Int, branch: Branch?, due: DueLabel?, repeats: Bool, paint: CardPaint?, corner: [String]? = nil, parts: [TextPart]? = nil, face: CardFace? = nil, stage: String? = nil, id: String? = nil) {
        self.drawnId = id
        let face = face ?? CardFace(item.card)
        self.face = face
        self.stage = stage
        self.parts = parts ?? [TextPart(text: face.text)]
        self.corner = corner
        self.item = item
        self.level = level
        self.branch = branch
        self.due = due
        self.repeats = repeats
        self.paint = paint
    }
}

public struct BoardGroup: Sendable, Hashable, Identifiable {
    /// Who the section is, the core's: its header stays the same header through a rename.
    public let id: String
    public let name: String?
    /// The header's words: the section's name, or the No section name when the column shows headers.
    public let header: String?
    public let cards: [BoardCard]
    public let empty: Bool
    public let menu: GroupMenu?
    /// A long press lifts its header to move it among the list's sections (`ListGroup.reorder`).
    public let reorder: Bool

    public init(id: String, name: String?, header: String?, cards: [BoardCard], empty: Bool, menu: GroupMenu?, reorder: Bool) {
        self.id = id
        self.name = name
        self.header = header
        self.cards = cards
        self.empty = empty
        self.menu = menu
        self.reorder = reorder
    }

    /// Whether a place (`GapPlace`, `ListPlace`) stands in this section: the same name.
    public func holds(group: String?) -> Bool { name == group }

    /// The section as a header a drop passes and the quick entry stands among: its name.
    public var place: JSONValue { name.json }
}

/// The lists the screen shows: the day list beside the calendar, Soon, Inbox over Backlog.
public enum BoardColumn: String, Sendable, CaseIterable {
    case day, soon, inbox, backlog
}

public struct BoardList: Sendable, Hashable {
    public let column: BoardColumn
    public let title: String
    public let groups: [BoardGroup]
    public let showsHeaders: Bool
    /// The column shows sections (`tasks.columnSections`): a section's name may be typed in it.
    public let sectioned: Bool
    /// Whose sections the column shows (`ColumnSections.list`): what `tasks.moveGroup`, `renameGroup` and `removeGroup`
    /// take; nil for a column that shows none.
    public let sectionsOf: String?
    /// What a drop on its title means (`ScreenView.titleDrops`); nil when the screen gives none.
    public let titleDrop: JSONValue?
    /// Every card of the list in drawing order, as a drop reads the gaps between them.
    public var cards: [BoardCard] { groups.flatMap(\.cards) }

    public init(column: BoardColumn, title: String, groups: [BoardGroup], showsHeaders: Bool, sectioned: Bool, sectionsOf: String?, titleDrop: JSONValue? = .none) {
        self.column = column
        self.title = title
        self.groups = groups
        self.showsHeaders = showsHeaders
        self.sectioned = sectioned
        self.sectionsOf = sectionsOf
        self.titleDrop = titleDrop
    }

    /// The sections as the quick entry stands among them (`EntryDrawing.sections`).
    public var places: JSONValue { .array(groups.map(\.place)) }
}

public struct BoardEvent: Sendable, Hashable, Identifiable {
    public let event: WireEvent
    public let start: Int
    public let end: Int
    public let level: Int
    public let layer: Int
    /// Its left edge in the timeline's items area, by how deep it lies over others.
    public let left: Double
    public let paint: Themed<EventPaint>
    public var id: String { event.id }
}

public struct BoardSlot: Sendable, Hashable, Identifiable {
    public let card: BoardCard
    public let start: Int
    public let end: Int?
    /// The start the task is put on in the file, which a stacked card shows.
    public let slotStart: Int
    /// Where its card stands in the stack the core lays out: tasks never share the width.
    public let box: StackBox
    public var id: String { card.id }

    public init(card: BoardCard, start: Int, end: Int?, slotStart: Int, box: StackBox) {
        self.card = card
        self.start = start
        self.end = end
        self.slotStart = slotStart
        self.box = box
    }
}

/// `StackBox`: a task card's place in the timeline's items area.
public struct StackBox: Decodable, Sendable, Hashable {
    public let top: Double
    public let height: Double
    public let left: Double
    public let overlay: Bool
    public let stacked: Bool
    public let hiddenDuration: Bool

    public init(top: Double, height: Double, left: Double, overlay: Bool, stacked: Bool, hiddenDuration: Bool) {
        self.top = top
        self.height = height
        self.left = left
        self.overlay = overlay
        self.stacked = stacked
        self.hiddenDuration = hiddenDuration
    }
}

/// The frontend's measures of the timeline, which the core lays its blocks out in.
public struct TimelineMeasures: Sendable {
    public let hour: Double
    public let cardHeight: Double
    public let cardGap: Double
    public let itemInset: Double
    public let itemGap: Double
    public let overlayInset: Double

    public init(hour: Double, cardHeight: Double, cardGap: Double, itemInset: Double, itemGap: Double, overlayInset: Double) {
        self.hour = hour
        self.cardHeight = cardHeight
        self.cardGap = cardGap
        self.itemInset = itemInset
        self.itemGap = itemGap
        self.overlayInset = overlayInset
    }

    var card: JSONValue { ["height": .number(cardHeight), "gap": .number(cardGap)] }
    var insets: JSONValue { ["itemInset": .number(itemInset), "itemGap": .number(itemGap), "overlayInset": .number(overlayInset)] }
}

public struct BoardHour: Sendable, Hashable {
    public let minute: Int
    public let label: String
}

/// A line of the grid between the hours (`rules.gridMarks`): its minute from the day's start, and its label (`:30`) or none.
public struct GridMark: Decodable, Sendable, Hashable {
    public let minute: Int
    public let label: String?
}

/// `Grid`: the minutes between the grid's labelled lines and between all its lines.
public struct GridStep: Decodable, Sendable, Hashable {
    public let labels: Int
    public let lines: Int
}

/// `PlacedCard`: a card of a list as a drop sees it, where it stands without the carried ones.
public struct PlacedCard: Sendable {
    public let level: Int
    public let group: String?
    public let top: Double
    public let height: Double

    public init(level: Int, group: String?, top: Double, height: Double) {
        self.level = level
        self.group = group
        self.top = top
        self.height = height
    }

    var json: JSONValue {
        ["level": .number(Double(level)), "group": group.json, "top": .number(top), "height": .number(height)]
    }
}

/// `PlacedHead`: a section's header as a drop sees it, and the first card after it.
public struct PlacedHead: Sendable {
    /// The header as a place sees it: a section's name.
    public let group: JSONValue
    public let firstCard: Int
    public let top: Double
    public let height: Double

    public init(group: JSONValue, firstCard: Int, top: Double, height: Double) {
        self.group = group
        self.firstCard = firstCard
        self.top = top
        self.height = height
    }

    var json: JSONValue { ["group": group, "firstCard": .number(Double(firstCard)), "top": .number(top), "height": .number(height)] }
}

/// The frontend's measures of the grid between the hours (`rules.gridAt`).
public struct GridMeasures: Sendable {
    public let divisions: [Int]
    public let labelGap: Double
    public let tickMinutes: Int
    public let tickGap: Double

    public init(divisions: [Int], labelGap: Double, tickMinutes: Int, tickGap: Double) {
        self.divisions = divisions
        self.labelGap = labelGap
        self.tickMinutes = tickMinutes
        self.tickGap = tickGap
    }

    var json: JSONValue {
        ["divisions": .array(divisions.map { .number(Double($0)) }), "labelGap": .number(labelGap), "tickMinutes": .number(Double(tickMinutes)), "tickGap": .number(tickGap)]
    }
}

/// The calendar beside the day list: minutes from the start of the shown day.
public struct BoardTimeline: Sendable, Hashable {
    public let hours: [BoardHour]
    public let events: [BoardEvent]
    public let allDay: [BoardEvent]
    public let slots: [BoardSlot]
    /// The now line, on today only.
    public let now: Int?
    /// Where the timeline opens.
    public let opening: Int
    /// An event that is over, whatever its calendar's colour (`rules.pastEventPaint`), on the system's ground.
    public let pastPaint: Themed<EventPaint>
    /// The hour's heights a pinch moves between, as the settings keep them (`timeline.zoomLevels`).
    public let zoomLevels: [Double]
}

/// How today changed between two reads (`DayChange`).
public enum DayChange: Sendable, Equatable {
    case passed
    case moved
}

/// Everything the main screen draws for a day, read at one moment through the door.
public struct BoardSnapshot: Sendable {
    public let today: String
    public let day: String
    public let dayTitle: String
    public let screen: ScreenView
    public let lists: [BoardColumn: BoardList]
    public let timeline: BoardTimeline
    public let statuses: [SourceStatus]
    /// The badge on «⋯» → Calendars, and what it says.
    public let calendarsAlert: CalendarAlert
    public let calendarWords: DayWords
    public let canUndo: Bool
    /// Each card's menu by its task's id (`TaskItem.id`), as opened from where the card stands.
    public let menus: [String: TaskMenuModel]
    /// What every screen reads of the shared settings: the cards' height and gap, the long press, the labels' paint.
    public let look: ScreenSettings
    /// The tasks file's text it was read from: the screen reads again only when it changes.
    public let tasksText: String?
    /// The plugin's settings (`data.json`) it was read over: what is named by them is asked again when they change.
    public let settingsJSON: String
    /// Each calendar file's text it was read over, by source: a file Sync brings redraws the timeline.
    public let calendarTexts: [String: String]
    /// The moment it was read at: the now line and an overdue task riding it stand where they were then.
    public let readAt: Date
    /// The hour the day starts at, as the core read it (`days.boundary`).
    public let startHour: Int
    /// The funnel's view it was read with (`tasks.funnelView`): the filter every list shows, the view mode, the panel.
    public let funnel: FunnelView

    /// The node the lists are filtered by (`ProjectFilter.node`): what a drop, its preview and its landing take.
    public var filter: String? { funnel.filter?.node }

    /// The same screen under another view of the same filter (the panel opened, another mode): no file is read again.
    public func with(funnel: FunnelView) -> BoardSnapshot {
        BoardSnapshot(
            today: today, day: day, dayTitle: dayTitle, screen: screen, lists: lists, timeline: timeline, statuses: statuses,
            calendarsAlert: calendarsAlert, calendarWords: calendarWords, canUndo: canUndo, menus: menus, look: look,
            tasksText: tasksText, settingsJSON: settingsJSON, calendarTexts: calendarTexts, readAt: readAt, startHour: startHour,
            funnel: funnel)
    }

    /// How the screen is drawn: the core's view decoded.
    public var presentation: FunnelPresentation { FunnelPresentation(funnel) }

    /// The files as they are now say what this snapshot was read from: no file, no setting, no calendar changed.
    public func readFrom(_ files: BoardFiles) -> Bool {
        files.tasks == tasksText && files.settingsJSON == settingsJSON && files.calendars == calendarTexts
    }

    /// Read from the same files on the same day: a snapshot of another day can stand beside it in a day's turn.
    public func readAlike(_ other: BoardSnapshot) -> Bool {
        other.tasksText == tasksText && other.settingsJSON == settingsJSON && other.calendarTexts == calendarTexts && other.today == today && other.funnel == funnel
    }

    /// Still true at `now`: read within the same minute, so the now line stands where it should.
    public func current(at now: Date, calendar: Calendar = .current) -> Bool {
        calendar.isDate(readAt, equalTo: now, toGranularity: .minute)
    }

    /// How the day changed from `before` to this read, as the plugin's `DayService` tells it: `moved` when the day's start
    /// hour changed (the screen opens today afresh), `passed` when today is another day by the clock.
    public func dayChange(since before: BoardSnapshot) -> DayChange? {
        if before.startHour != startHour { return .moved }
        return before.today == today ? nil : .passed
    }

    /// The task the screen shows under `id`, a card's (`BoardCard.id`) or its task's (`TaskItem.id`), anywhere.
    public func item(_ id: String) -> TaskItem? {
        for list in lists.values { if let card = list.cards.first(where: { $0.names(id) }) { return card.item } }
        return timeline.slots.first { $0.card.names(id) }?.card.item
    }

    /// Which list or the calendar a card is drawn in, by the card's id or its task's.
    public func column(of id: String) -> String? {
        for (column, list) in lists where list.cards.contains(where: { $0.names(id) }) { return column.rawValue }
        return timeline.slots.contains { $0.card.names(id) } ? "timeline" : nil
    }
}

private struct DayStart: Decodable {
    let startHour: Int
}

extension TaskBoard {
    /// The screen for `day` (`nil`: today) over the vault's files as they are now. The cards' height and gap are the shared settings' (`look`), the
    /// timeline's stack laid out at them whatever `measures` say.
    /// `filter`: the node to read the lists under instead of the device's chosen one (a node a carry is about to open);
    /// the snapshot's view stays the device's until the caller hands it the view it is drawn with (`with(funnel:)`).
    public func snapshot(day wanted: String?, measures asked: TimelineMeasures, now: Date = Date(), filter: String?? = nil) throws -> BoardSnapshot {
        let files = try files(now: now)
        let today: String = try read("days.today", over: files)
        let day = wanted ?? today
        // The device's chosen node filters every list (`tasks.funnelView`): the screen is read with it.
        let funnel: FunnelView = try read("tasks.funnelView", [.bool(false)], over: files)
        let node = filter ?? funnel.filter?.node
        let screen: ScreenView = try read("tasks.screen", [.string(day), node.map { .string($0) } ?? .null], over: files)
        return try draw(screen, day: day, today: today, files: files, measures: asked, lane: .reading, canUndo: canUndo, funnel: funnel)
    }

    /// The screen a drop will leave, asked at the moment of the drop before anything is written (`tasks.dropPreview`):
    /// everything `snapshot` reads, read over the text the drop leaves, on the pure rules' context, so the main thread
    /// never waits for a read and no id or undo step of it is kept. The read after the drop's write draws the same.
    public func dropPreview(_ tasks: JSONValue, to: JSONValue, over shown: BoardSnapshot, measures asked: TimelineMeasures, now: Date = Date()) throws -> DropPreview {
        let before = BoardFiles(tasks: shown.tasksText, settingsJSON: shown.settingsJSON, calendars: shown.calendarTexts, now: now)
        let arguments: [JSONValue] = [tasks, to, .string(shown.day), shown.filter.json]
        let answer = try answerPure("tasks.dropPreview", arguments, over: before)
        let landings = try answer["landings"].decode([DropLanding].self)
        let screen = try answer["screen"].decode(ScreenView.self)
        let text = answer["tasks"].string ?? shown.tasksText
        let after = BoardFiles(tasks: text, settingsJSON: shown.settingsJSON, calendars: shown.calendarTexts, now: now)
        let drawn = try draw(screen, day: shown.day, today: shown.today, files: after, measures: asked, lane: .preview(shown), canUndo: shown.canUndo || text != shown.tasksText, funnel: shown.funnel)
        return DropPreview(landings: landings, snapshot: drawn)
    }

    /// Which core a drawing asks: the reading one, keeping the ids its answers give, or the pure rules' one over a text no
    /// file holds yet, keeping nothing, the menus already drawn reused for every task the drop leaves as it was.
    enum Lane {
        case reading
        case preview(BoardSnapshot)
    }

    private func draw(_ screen: ScreenView, day: String, today: String, files: BoardFiles, measures asked: TimelineMeasures, lane: Lane, canUndo: Bool, funnel: FunnelView) throws -> BoardSnapshot {
        let pure: Bool
        if case .preview = lane { pure = true } else { pure = false }
        func read<T: Decodable>(_ method: String, _ arguments: [JSONValue] = [], over files: BoardFiles, as type: T.Type = T.self) throws -> T {
            pure ? try answerPure(method, arguments, over: files).decode(T.self) : try self.read(method, arguments, over: files)
        }
        func readRule<T: Decodable>(_ method: String, _ arguments: [JSONValue] = [], as type: T.Type = T.self) throws -> T {
            pure ? try previewRule(method, arguments) : try self.readRule(method, arguments)
        }
        let look: ScreenSettings = try read("screenSettings.get", over: files)
        let measures = TimelineMeasures(hour: asked.hour, cardHeight: look.cardHeight, cardGap: look.cardGap, itemInset: asked.itemInset, itemGap: asked.itemGap, overlayInset: asked.overlayInset)
        let relation: String = try read("days.relation", [.string(day)], over: files)
        let dayTitle: String = try readRule("rules.dayTitle", [.string(day), .string(relation), .string(today)])
        var painter = Painter(board: self, blend: look.labelPaint == "blend", pure: pure)

        func list(_ column: BoardColumn, _ items: [TaskItem], title: String) throws -> BoardList {
            let sections: ColumnSections? = try read("tasks.columnSections", [.string(column.rawValue), .string(day)], over: files)
            let corner = column == .day ? JSONValue.string(day) : .null
            let ungrouped = screen.offer["ungrouped"].string ?? ""
            let titleDrop = screen.titleDrops[column.rawValue]
            let listSections = sections.flatMap { screen.sections[$0.list] } ?? []
            let view: ListView = try readRule("rules.listView", [.array(items.map(\.json)), .bool(sections != nil), try .encoding(listSections)])
            let groups = try view.groups.map { group in
                BoardGroup(
                    id: group.id,
                    name: group.name,
                    header: view.showsHeaders ? (group.name ?? ungrouped) : nil,
                    cards: try cards(group.rows, corner: corner, painter: &painter),
                    empty: group.empty,
                    menu: group.menu,
                    reorder: group.reorder ?? false)
            }
            return BoardList(column: column, title: title, groups: groups, showsHeaders: view.showsHeaders, sectioned: sections != nil, sectionsOf: sections?.list, titleDrop: titleDrop)
        }

        let name: (String) throws -> String = { try read("tasks.listName", [.string($0)], over: files) }
        let lists: [BoardColumn: BoardList] = [
            .day: try list(.day, screen.day.list, title: dayTitle),
            .soon: try list(.soon, screen.soon, title: name("soon")),
            .inbox: try list(.inbox, screen.inbox, title: name("inbox")),
            .backlog: try list(.backlog, screen.backlog, title: name("backlog")),
        ]
        let events: DayEvents = screen.calendars ? try read("calendars.events", [.string(day)], over: files) : try noDayEvents()
        let (statuses, alert, words) = (events.statuses, events.alert, events.words)
        let timeline = try self.timeline(
            day: day, today: today, screen: screen, events: events, files: files, measures: measures, painter: &painter,
            ask: { try read($0, $1, over: $2) as JSONValue }, askRule: { try readRule($0, $1) as JSONValue })
        let menuScreen = screen.menuScreen(today: today, day: day)
        // A menu reads no file: asked over the settings alone, it costs nothing per card.
        let settingsOnly = BoardFiles(tasks: nil, settingsJSON: files.settingsJSON, calendars: [:], now: files.now)
        var menus: [String: TaskMenuModel] = [:]
        // The menus of a drawing already shown are kept for every task still as it was there: a menu is the task's alone.
        var shown: BoardSnapshot?
        if case .preview(let before) = lane { shown = before }
        func menu(_ item: TaskItem, _ from: String) throws -> TaskMenuModel {
            if let shown, let kept = shown.menus[item.id], shown.item(item.id) == item, shown.column(of: item.id) == from { return kept }
            return try read("tasks.menu", [item.json, .string(from), menuScreen], over: settingsOnly)
        }
        for (column, list) in lists {
            for card in list.cards {
                menus[card.item.id] = try menu(card.item, column.rawValue)
            }
        }
        for slot in timeline.slots {
            menus[slot.card.item.id] = try menu(slot.card.item, "timeline")
        }
        return BoardSnapshot(
            today: today,
            day: day,
            dayTitle: dayTitle,
            screen: screen,
            lists: lists,
            timeline: timeline,
            statuses: statuses,
            calendarsAlert: alert,
            calendarWords: words,
            canUndo: canUndo,
            menus: menus,
            look: look,
            tasksText: files.tasks,
            settingsJSON: files.settingsJSON,
            calendarTexts: files.calendars,
            readAt: files.now,
            startHour: try read("days.boundary", over: files, as: DayStart.self).startHour,
            funnel: funnel)
    }

    /// Cards for rows drawn outside the screen's lists (a full screen's subtasks, a search's finds), coloured and dated as
    /// a list draws them: `corner` the day whose date a card leaves out, none for a list of no day.
    public func cards(_ rows: [ListRow], corner day: String? = nil) throws -> [BoardCard] {
        let look: ScreenSettings = try read("screenSettings.get", over: settingsOnly())
        var painter = Painter(board: self, blend: look.labelPaint == "blend")
        return try cards(rows, corner: day.json, painter: &painter)
    }

    private func cards(_ rows: [ListRow], corner: JSONValue, painter: inout Painter) throws -> [BoardCard] {
        let levels = JSONValue.array(rows.map { .number(Double($0.level)) })
        return try rows.enumerated().map { index, row in
            let due: CardDue? = try painter.rule("rules.cardDue", [row.item.json, corner])
            let face = CardFace(row.item.card)
            return BoardCard(
                item: row.item,
                level: row.level,
                branch: try painter.rule("rules.branchOf", [levels, .number(Double(index))]),
                due: try due?.date.map { try painter.due($0) },
                repeats: due?.repeats ?? false,
                paint: try painter.paint(row.item),
                parts: try painter.parts(face.text),
                face: face)
        }
    }

    private func timeline(
        day: String, today: String, screen: ScreenView, events: DayEvents, files: BoardFiles, measures: TimelineMeasures, painter: inout Painter,
        ask: (String, [JSONValue], BoardFiles) throws -> JSONValue, askRule: (String, [JSONValue]) throws -> JSONValue
    ) throws -> BoardTimeline {
        func read<T: Decodable>(_ method: String, _ arguments: [JSONValue] = [], over files: BoardFiles, as type: T.Type = T.self) throws -> T {
            try ask(method, arguments, files).decode(T.self)
        }
        func readRule<T: Decodable>(_ method: String, _ arguments: [JSONValue] = [], as type: T.Type = T.self) throws -> T {
            try askRule(method, arguments).decode(T.self)
        }
        let hours = try (0...24).map { index in
            let hour: Int = try read("boundary.hourAt", [.number(Double(index))], over: files)
            return BoardHour(minute: index * 60, label: String(format: "%02d", hour))
        }
        let timed = try events.timed.map { event -> (WireEvent, DaySpan) in
            (event, try read("boundary.clipToDay", [.string(day), .number(event.startMs), .number(event.endMs)], over: files))
        }
        let spans = timed.map { ["start": JSONValue.number(Double($0.1.start)), "end": .number(Double($0.1.end ?? $0.1.start))] as JSONValue }
        let levels: [EventLevel] = try readRule("rules.eventLevels", [.array(spans)])
        let placed = try zip(timed, levels).map { pair, level in
            let left: Double = try readRule("rules.overlayLeft", [.number(Double(level.level)), measures.insets])
            return BoardEvent(event: pair.0, start: pair.1.start, end: pair.1.end ?? pair.1.start, level: level.level, layer: level.layer, left: left, paint: try painter.event(pair.0))
        }
        let allDay = try events.allDay.map { BoardEvent(event: $0, start: 0, end: 0, level: 0, layer: 0, left: 0, paint: try painter.event($0)) }
        let shown = try screen.day.slotted.map { item -> (TaskItem, DaySpan) in (item, try read("tasks.shownSpan", [item.json, .string(day)], over: files)) }
        let taskSpans = JSONValue.array(shown.map { ["start": .number(Double($0.1.start)), "end": $0.1.end.map { .number(Double($0)) } ?? .null] })
        let eventSpans = JSONValue.array(placed.map { ["start": .number(Double($0.start)), "end": .number(Double($0.end)), "level": .number(Double($0.level))] })
        let boxes: [StackBox] = try readRule("rules.stackTasks", [taskSpans, eventSpans, .number(measures.hour), measures.card, measures.insets])
        let slots = try zip(shown, boxes).map { pair, box -> BoardSlot in
            let start = pair.0.slot?.start ?? pair.1.start
            let corner = try self.corner(box, start: start, pair.1.start, pair.1.end, pure: painter.pure)
            let face = CardFace.block(pair.0)
            let card = BoardCard(item: pair.0, level: 0, branch: nil, due: nil, repeats: false, paint: try painter.paint(pair.0), corner: corner, parts: try painter.parts(face.text), face: face)
            return BoardSlot(card: card, start: pair.1.start, end: pair.1.end, slotStart: start, box: box)
        }
        let now: Int? = day == today ? try read("boundary.offsetOf", [.string(day), .number((files.now.timeIntervalSince1970 * 1000).rounded())], over: files) : nil
        let opening: DayOpening = try read("days.openAt", [.string(day)], over: files)
        let zoom: [ZoomStep] = try read("timeline.zoomLevels", over: files)
        let past = Themed<EventPaint>(
            dark: try readRule("rules.pastEventPaint", ["#000000", "#FFFFFF", "dark"]),
            light: try readRule("rules.pastEventPaint", ["#FFFFFF", "#000000", "light"]))
        return BoardTimeline(hours: hours, events: placed, allDay: allDay, slots: slots, now: now, opening: opening.minute, pastPaint: past, zoomLevels: zoom.map(\.hourPx))
    }

    private func corner(_ box: StackBox, start: Int, _ shownStart: Int, _ shownEnd: Int?, pure: Bool = false) throws -> [String]? {
        let span: JSONValue = ["start": .number(Double(shownStart)), "end": shownEnd.map { .number(Double($0)) } ?? .null]
        let flags: JSONValue = ["stacked": .bool(box.stacked), "hiddenDuration": .bool(box.hiddenDuration)]
        let arguments: [JSONValue] = [flags, .number(Double(start)), span]
        return try pure ? rule("rules.stackCorner", arguments) : readRule("rules.stackCorner", arguments)
    }

    /// The timeline's task cards stacked anew at another hour's height (a pinch), each with its corner as it then stands.
    /// `pure`: on the pure rules' context, for the main thread, which must never wait for a read made meanwhile on the
    /// reading core; a read's own thread lays out on that core.
    public func stack(_ timeline: BoardTimeline, measures: TimelineMeasures, pure: Bool = false) throws -> [BoardSlot] {
        guard !timeline.slots.isEmpty else { return [] }
        let taskSpans = JSONValue.array(timeline.slots.map { ["start": .number(Double($0.start)), "end": $0.end.map { .number(Double($0)) } ?? .null] })
        let eventSpans = JSONValue.array(timeline.events.map { ["start": .number(Double($0.start)), "end": .number(Double($0.end)), "level": .number(Double($0.level))] })
        let arguments: [JSONValue] = [taskSpans, eventSpans, .number(measures.hour), measures.card, measures.insets]
        let boxes: [StackBox] = try pure ? rule("rules.stackTasks", arguments) : readRule("rules.stackTasks", arguments)
        return try zip(timeline.slots, boxes).map { slot, box in
            let old = slot.card
            let card = BoardCard(item: old.item, level: 0, branch: nil, due: nil, repeats: false, paint: old.paint, corner: try corner(box, start: slot.slotStart, slot.start, slot.end, pure: pure), parts: old.parts, face: old.face)
            return BoardSlot(card: card, start: slot.start, end: slot.end, slotStart: slot.slotStart, box: box)
        }
    }

    /// The grid at an hour's height (`rules.gridAt`): the minutes between its labelled lines and between all its lines.
    public func grid(hour: Double, measures: GridMeasures) throws -> GridStep {
        try rule("rules.gridAt", [.number(hour), measures.json])
    }

    /// Every line between the hours of that grid (`rules.gridMarks`).
    public func gridMarks(_ grid: GridStep) throws -> [GridMark] {
        try rule("rules.gridMarks", [["labels": .number(Double(grid.labels)), "lines": .number(Double(grid.lines))], 24])
    }

    /// Whether a grid label at `y` hides under the now pill at `now` (nil: no now line on the day shown).
    public func labelHides(y: Double, now: Double?, lift: Double, pill: Double) throws -> Bool {
        try rule("rules.labelHidesNearNow", [.number(y), now.map(JSONValue.number) ?? .null, .number(lift), .number(pill)])
    }

    /// The gap a finger at `y` (`level` fractional) opens among `cards` as they stand without the carried ones (`rules.placeAt`).
    public func placeAt(_ cards: [PlacedCard], y: Double, level: Double, shift: Double, room: JSONValue, heads: [PlacedHead], held: JSONValue, hysteresis: Double) throws -> JSONValue {
        try rule("rules.placeAt", [.array(cards.map(\.json)), .number(y), .number(level), .number(shift), room, .array(heads.map(\.json)), held, .number(hysteresis)])
    }

    public func levelAt(x: Double, left: Double, width: Double, indent: Double) throws -> Double {
        try rule("rules.levelAt", [.number(x), ["left": .number(left), "width": .number(width)], .number(indent)])
    }

    /// Whether a list places a task carried from `from` in the gap under the finger, or only at its end
    /// (`rules.placesInGap`): a list that shows sections takes a task from anywhere in a gap, any list a new task (`new`),
    /// another only a task of its own.
    public func placesInGap(column: String, from: String, grouped: Bool) throws -> Bool {
        try rule("rules.placesInGap", [.string(column), .string(from), .bool(grouped)])
    }

    public func carriedMiddle(y: Double, grab: Double, cardHeight: Double) throws -> Double {
        try rule("rules.carriedMiddle", [.number(y), .number(grab), .number(cardHeight)])
    }

    /// The branch an open gap draws among `levels` (`rules.gapBranch`).
    public func gapBranch(levels: [Int], gap: JSONValue) throws -> Branch? {
        try rule("rules.gapBranch", [.array(levels.map { ["level": .number(Double($0))] }), gap])
    }

    /// A row's branch among rows of these `levels` (`rules.branchOf`).
    public func branchOf(levels: [Int], index: Int) throws -> Branch? {
        try rule("rules.branchOf", [.array(levels.map { .number(Double($0)) }), .number(Double(index))])
    }

    /// The hour's heights a pinch moves between at this screen's whole-day height, the whole day first.
    public func zoomRange(wholeDay: Double, levels: [Double]) throws -> [Double] {
        let steps: [ZoomStep] = try rule("rules.levelsFor", [.number(wholeDay), Self.levels(levels)])
        return steps.map(\.hourPx)
    }

    /// What a pinch let go at `hour` settles on, to keep on the device: `nil` for the whole day, else the hour's height.
    public func zoomAfterPinch(hour: Double, wholeDay: Double, levels: [Double]) throws -> Double? {
        let settled: JSONValue = try rule("rules.zoomAfterPinch", [.number(hour), .number(wholeDay), Self.levels(levels)])
        return settled.number
    }

    /// The hour's height a zoom kept on the device opens at (`saved`: `"wholeDay"`, a height, or nothing yet).
    public func zoomShown(saved: JSONValue, wholeDay: Double?, levels: [Double]) throws -> Double {
        try rule("rules.zoomShown", [saved, wholeDay.map(JSONValue.number) ?? .null, Self.levels(levels)])
    }

    private static func levels(_ levels: [Double]) -> JSONValue { .array(levels.map { ["hourPx": .number($0)] }) }

    /// How wide the copy of a pressed card grows to show a title the card cuts or fades (`rules.wholeWidth`): `nil` while
    /// the title shows whole, the card then lifted itself.
    public func wholeWidth(card: TitleFit, room: Double, margin: Double) throws -> GrownWidth? {
        try rule("rules.wholeWidth", [card.json, ["width": .number(room), "margin": .number(margin)]])
    }

    /// Where the grown copy of a card starts on one axis (`rules.grownStart`).
    public func grownStart(_ start: Double, size: Double, grown: Double, room: Double, margin: Double) throws -> Double {
        try rule("rules.grownStart", [.number(start), .number(size), .number(grown), .number(room), .number(margin)])
    }
}

/// A card's title as it is measured, for the copy that shows it whole: the card's width, the title's box, the title's text
/// on one line, the fade at its end.
public struct TitleFit: Sendable {
    public let width: Double
    public let titleWidth: Double
    public let textWidth: Double
    public let fade: Double

    public init(width: Double, titleWidth: Double, textWidth: Double, fade: Double) {
        self.width = width
        self.titleWidth = titleWidth
        self.textWidth = textWidth
        self.fade = fade
    }

    var json: JSONValue { ["width": .number(width), "titleWidth": .number(titleWidth), "textWidth": .number(textWidth), "fade": .number(fade)] }
}

/// How wide the copy grows, and whether the title is still cut at that width: it then wraps onto more lines.
public struct GrownWidth: Decodable, Sendable, Hashable {
    public let width: Double
    public let cut: Bool
}

/// What a drop leaves (`tasks.dropPreview`): where each dropped task lands and the whole screen after it, drawn before the
/// write.
public struct DropPreview: Sendable {
    public let landings: [DropLanding]
    public let snapshot: BoardSnapshot
}

/// The core's paints, each asked for once per drawing.
struct Painter {
    let board: TaskBoard
    let blend: Bool
    /// Asks the previews' core: a drop's preview, worked out before the drop.
    let pure: Bool
    private var shadesByColor: [String: Themed<Shades>] = [:]
    private var dueByDate: [String: DueLabel] = [:]
    private var partsByText: [String: [TextPart]] = [:]

    init(board: TaskBoard, blend: Bool, pure: Bool = false) {
        self.board = board
        self.blend = blend
        self.pure = pure
    }

    func rule<T: Decodable>(_ method: String, _ arguments: [JSONValue]) throws -> T {
        pure ? try board.previewRule(method, arguments) : try board.readRule(method, arguments)
    }

    /// A task's card colours: none without a priority or a label.
    mutating func paint(_ item: TaskItem) throws -> CardPaint? {
        item.colors.isEmpty ? nil : CardPaint(colors: try item.colors.map { try shades($0) }, blend: blend)
    }

    mutating func shades(_ color: String) throws -> Themed<Shades> {
        if let known = shadesByColor[color] { return known }
        let shades = Themed<Shades>(
            dark: try rule("rules.shadesOf", [.string(color), "dark"]),
            light: try rule("rules.shadesOf", [.string(color), "light"]))
        shadesByColor[color] = shades
        return shades
    }

    /// A title's pieces, asked once per title.
    mutating func parts(_ text: String) throws -> [TextPart] {
        if let known = partsByText[text] { return known }
        let parts: [TextPart] = try rule("rules.textParts", [.string(text)])
        partsByText[text] = parts
        return parts
    }

    mutating func due(_ date: String) throws -> DueLabel {
        if let known = dueByDate[date] { return known }
        let label: DueLabel = try rule("rules.dueLabel", [.string(date)])
        dueByDate[date] = label
        return label
    }

    func event(_ event: WireEvent) throws -> Themed<EventPaint> {
        let hex: String = try rule("rules.eventHex", [event.json])
        let alpha: Double = try rule("rules.bgAlphaFor", [.string(event.source)])
        return Themed(
            dark: try rule("rules.eventColors", [.string(hex), .number(alpha), "dark"]),
            light: try rule("rules.eventColors", [.string(hex), .number(alpha), "light"]))
    }
}

/// `ZoomLevel`: a level of the timeline's zoom.
struct ZoomStep: Decodable, Sendable {
    let hourPx: Double
}

/// `ColumnSections`: whose sections a column shows.
public struct ColumnSections: Decodable, Sendable {
    public let list: String
    public let date: String?
}


extension ScreenView {
    /// What a task's menu is read for (`MenuScreen`): the day, today, the sections offered, and the tree's projects, so
    /// a menu asked over the settings alone offers the whole tree on its Project page.
    public func menuScreen(today: String, day: String) -> JSONValue {
        ["today": .string(today), "day": .string(day), "offer": offer, "projects": projectTree]
    }
}
