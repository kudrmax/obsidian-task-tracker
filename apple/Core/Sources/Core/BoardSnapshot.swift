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
    /// The card's identity on the screen: its line as the file has it, so a card moved or ticked keeps it and the lists
    /// animate it to its new place instead of drawing a new card.
    public let id: String
    /// The project's part of a list grouped by project (or a project's view) it is drawn in (`ProjectGroup.zone`): the
    /// project's link, `.null` for No project; `nil` in a list that groups nothing.
    public let zone: JSONValue?
    /// Its title in pieces (`rules.textParts`): text, and links drawn in the accent that a tap opens.
    public let parts: [TextPart]

    /// The card goes by `id`: its own, or its task's.
    public func names(_ id: String) -> Bool { self.id == id || item.id == id }

    /// Drawn in section `group` of the project's part `zone`: the same section of the same part.
    public func stands(in group: String?, zone: JSONValue?) -> Bool { item.group == group && self.zone == zone }

    /// The card as the places of its list see it (`ListCard`): its task, level and section, and its project's part.
    public var listCard: JSONValue {
        var card: [String: JSONValue] = ["key": item.key.json, "level": .number(Double(level)), "group": item.group.json]
        if let zone { card["project"] = zone }
        return .object(card)
    }

    public init(item: TaskItem, level: Int, branch: Branch?, due: DueLabel?, repeats: Bool, paint: CardPaint?, corner: [String]? = nil, id: String? = nil, zone: JSONValue? = nil, parts: [TextPart]? = nil) {
        self.id = id ?? item.id
        self.zone = zone
        self.parts = parts ?? [TextPart(text: item.text)]
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
    public let name: String?
    /// The header's words: the section's name, or the No section name when the column shows headers.
    public let header: String?
    public let cards: [BoardCard]
    public let empty: Bool
    public let menu: GroupMenu?
    /// A long press lifts its header to move it among the list's sections (`ListGroup.reorder`).
    public let reorder: Bool
    /// In a list grouped by project, the project's part it stands in; nil in a plain list.
    public let zone: JSONValue?
    public var id: String { BoardGroup.id(name, zone) }

    public init(name: String?, header: String?, cards: [BoardCard], empty: Bool, menu: GroupMenu?, reorder: Bool, zone: JSONValue? = nil) {
        self.name = name
        self.header = header
        self.cards = cards
        self.empty = empty
        self.menu = menu
        self.reorder = reorder
        self.zone = zone
    }

    static func id(_ name: String?, _ zone: JSONValue?) -> String {
        let section = name ?? "\u{0}"
        guard let zone else { return section }
        return "\u{1}\(zone.string ?? "")\u{1}\(section)"
    }

    /// Whether a place (`GapPlace`, `ListPlace`) stands in this section: the same name, and the same project's part.
    public func holds(group: String?, zone: JSONValue?) -> Bool {
        name == group && self.zone == zone
    }

    /// The section as a header a drop passes and the quick entry stands among: its name, or with its project's part.
    public var place: JSONValue {
        guard let zone else { return name.json }
        return ["group": name.json, "project": zone]
    }
}

/// A project's group in a list grouped by project: its header (the core's `ProjectGroup`) and the sections it draws
/// while open, by their index in `BoardList.groups`.
public struct BoardProject: Sendable, Hashable, Identifiable {
    public let key: String
    public let title: String
    public let project: ProjectRef?
    public let folded: Bool
    public let count: Int
    public let canOpenNote: Bool
    public let titled: Bool
    public let zone: JSONValue
    /// What a drop on its header means.
    public let head: JSONValue
    public let sections: Range<Int>
    public var id: String { "\u{2}" + key }
}

/// What a list draws, top to bottom: a project's header, or a section by its index in `BoardList.groups`.
public enum BoardPart: Sendable, Hashable {
    case project(BoardProject)
    case section(Int)
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
    /// Its title's menu offers Group by project (`ListGrouping.canGroup`), checked while `grouped`.
    public let canGroup: Bool
    public let grouped: Bool
    /// What it draws in order: its project groups' headers and its sections.
    public let parts: [BoardPart]
    /// What a drop on its title means (`ScreenView.titleDrops`); nil when the screen gives none.
    public let titleDrop: JSONValue?
    /// Every card of the list in drawing order, as a drop reads the gaps between them.
    public var cards: [BoardCard] { groups.flatMap(\.cards) }

    public init(column: BoardColumn, title: String, groups: [BoardGroup], showsHeaders: Bool, sectioned: Bool, sectionsOf: String?, canGroup: Bool = false, grouped: Bool = false, parts: [BoardPart]? = nil, titleDrop: JSONValue? = nil) {
        self.column = column
        self.title = title
        self.groups = groups
        self.showsHeaders = showsHeaders
        self.sectioned = sectioned
        self.sectionsOf = sectionsOf
        self.canGroup = canGroup
        self.grouped = grouped
        self.parts = parts ?? groups.indices.map(BoardPart.section)
        self.titleDrop = titleDrop
    }

    /// The project groups it draws.
    public var projects: [BoardProject] {
        parts.compactMap { if case .project(let project) = $0 { project } else { nil } }
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
    public let zone: JSONValue?
    public let top: Double
    public let height: Double

    public init(level: Int, group: String?, zone: JSONValue? = nil, top: Double, height: Double) {
        self.level = level
        self.group = group
        self.zone = zone
        self.top = top
        self.height = height
    }

    var json: JSONValue {
        var card: [String: JSONValue] = ["level": .number(Double(level)), "group": group.json, "top": .number(top), "height": .number(height)]
        if let zone { card["project"] = zone }
        return .object(card)
    }
}

/// `PlacedHead`: a section's header as a drop sees it, and the first card after it.
public struct PlacedHead: Sendable {
    /// The header as a place sees it: a section's name, or `{ group, project }` in a list grouped by project.
    public let group: JSONValue
    /// A project group's header, which opens a part of the list.
    public let opens: Bool
    public let firstCard: Int
    public let top: Double
    public let height: Double

    public init(group: JSONValue, opens: Bool = false, firstCard: Int, top: Double, height: Double) {
        self.group = group
        self.opens = opens
        self.firstCard = firstCard
        self.top = top
        self.height = height
    }

    var json: JSONValue { ["group": group, "opens": .bool(opens), "firstCard": .number(Double(firstCard)), "top": .number(top), "height": .number(height)] }
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
    public let calendarsStale: Bool
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

    /// The files as they are now say what this snapshot was read from: no file, no setting, no calendar changed.
    public func readFrom(_ files: BoardFiles) -> Bool {
        files.tasks == tasksText && files.settingsJSON == settingsJSON && files.calendars == calendarTexts
    }

    /// Read from the same files on the same day: a snapshot of another day can stand beside it in a day's turn.
    public func readAlike(_ other: BoardSnapshot) -> Bool {
        other.tasksText == tasksText && other.settingsJSON == settingsJSON && other.calendarTexts == calendarTexts && other.today == today
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
    /// The screen for `day` (`nil`: today) over the vault's files as they are now; with `project` (a project's link), that
    /// project's own view (`tasks.screen(date, project)`). The cards' height and gap are the shared settings' (`look`), the
    /// timeline's stack laid out at them whatever `measures` say.
    public func snapshot(day wanted: String?, measures asked: TimelineMeasures, now: Date = Date(), project: String? = nil) throws -> BoardSnapshot {
        let files = try files(now: now)
        let look: ScreenSettings = try read("screenSettings.get", over: files)
        let measures = TimelineMeasures(hour: asked.hour, cardHeight: look.cardHeight, cardGap: look.cardGap, itemInset: asked.itemInset, itemGap: asked.itemGap, overlayInset: asked.overlayInset)
        let today: String = try read("days.today", over: files)
        let day = wanted ?? today
        let screen: ScreenView = try read("tasks.screen", [.string(day)] + (project.map { [JSONValue.string($0)] } ?? []), over: files)
        let relation: String = try read("days.relation", [.string(day)], over: files)
        let dayTitle: String = try readRule("rules.dayTitle", [.string(day), .string(relation), .string(today)])
        var painter = Painter(board: self, blend: look.labelPaint == "blend")

        func list(_ column: BoardColumn, _ items: [TaskItem], title: String) throws -> BoardList {
            let sections: ColumnSections? = try read("tasks.columnSections", [.string(column.rawValue), .string(day)], over: files)
            let corner = column == .day ? JSONValue.string(day) : .null
            let ungrouped = screen.offer["ungrouped"].string ?? ""
            let titleDrop = screen.titleDrops[column.rawValue]
            // The grouping the core gives the column's own list (`ScreenView.projects`); the day column's is `now`, grouped
            // only in a project's view.
            let grouping = screen.projects[column == .day ? "now" : column.rawValue]
            if let grouping, grouping.on {
                var groups: [BoardGroup] = []
                var parts: [BoardPart] = []
                for project in grouping.groups {
                    let first = groups.count
                    if !project.folded {
                        for section in project.sections {
                            groups.append(BoardGroup(
                                name: section.name,
                                header: section.header == false ? nil : (section.name ?? ungrouped),
                                cards: try cards(section.rows, corner: corner, zone: project.zone, painter: &painter),
                                empty: section.empty,
                                menu: section.menu,
                                reorder: section.reorder ?? false,
                                zone: project.zone))
                        }
                    }
                    let head = BoardProject(key: project.key, title: project.title, project: project.project, folded: project.folded, count: project.count, canOpenNote: project.canOpenNote, titled: project.titled, zone: project.zone, head: project.head, sections: first..<groups.count)
                    if project.titled { parts.append(.project(head)) }
                    parts += (first..<groups.count).map(BoardPart.section)
                }
                // As the plugin draws it: headers once any group's title or a section's header shows.
                let headers = parts.contains { if case .project = $0 { true } else { false } } || groups.contains { $0.header != nil }
                return BoardList(column: column, title: title, groups: groups, showsHeaders: headers, sectioned: sections != nil, sectionsOf: sections?.list, canGroup: grouping.canGroup, grouped: true, parts: parts, titleDrop: titleDrop)
            }
            let listSections = sections.flatMap { screen.sections[$0.list] } ?? []
            let view: ListView = try readRule("rules.listView", [.array(items.map(\.json)), .bool(sections != nil), try .encoding(listSections)])
            let groups = try view.groups.map { group in
                BoardGroup(
                    name: group.name,
                    header: view.showsHeaders ? (group.name ?? ungrouped) : nil,
                    cards: try cards(group.rows, corner: corner, zone: nil, painter: &painter),
                    empty: group.empty,
                    menu: group.menu,
                    reorder: group.reorder ?? false)
            }
            return BoardList(column: column, title: title, groups: groups, showsHeaders: view.showsHeaders, sectioned: sections != nil, sectionsOf: sections?.list, canGroup: grouping?.canGroup ?? false, titleDrop: titleDrop)
        }

        let name: (String) throws -> String = { try self.read("tasks.listName", [.string($0)], over: files) }
        let lists: [BoardColumn: BoardList] = [
            .day: try list(.day, screen.day.list, title: dayTitle),
            .soon: try list(.soon, screen.soon, title: name("soon")),
            .inbox: try list(.inbox, screen.inbox, title: name("inbox")),
            .backlog: try list(.backlog, screen.backlog, title: name("backlog")),
        ]
        let events: DayEvents = screen.calendars ? try read("calendars.events", [.string(day)], over: files) : .none
        let timeline = try timeline(day: day, today: today, screen: screen, events: events, files: files, measures: measures, painter: &painter)
        let menuScreen: JSONValue = ["today": .string(today), "day": .string(day), "offer": screen.offer]
        // A menu reads no file: asked over the settings alone, it costs nothing per card.
        let settingsOnly = BoardFiles(tasks: nil, settingsJSON: files.settingsJSON, calendars: [:], now: files.now)
        var menus: [String: TaskMenuModel] = [:]
        for (column, list) in lists {
            for card in list.cards { menus[card.item.id] = try read("tasks.menu", [card.item.json, .string(column.rawValue), menuScreen], over: settingsOnly) }
        }
        for slot in timeline.slots { menus[slot.card.item.id] = try read("tasks.menu", [slot.card.item.json, "timeline", menuScreen], over: settingsOnly) }
        return BoardSnapshot(
            today: today,
            day: day,
            dayTitle: dayTitle,
            screen: screen,
            lists: lists,
            timeline: timeline,
            statuses: events.statuses,
            calendarsStale: events.stale,
            canUndo: canUndo,
            menus: menus,
            look: look,
            tasksText: files.tasks,
            settingsJSON: files.settingsJSON,
            calendarTexts: files.calendars,
            readAt: files.now,
            startHour: try read("days.boundary", over: files, as: DayStart.self).startHour)
    }

    /// Cards for rows drawn outside the screen's lists (a full screen's subtasks, a search's finds), coloured and dated as
    /// a list draws them: `corner` the day whose date a card leaves out, none for a list of no day.
    public func cards(_ rows: [ListRow], corner day: String? = nil) throws -> [BoardCard] {
        let look: ScreenSettings = try read("screenSettings.get", over: settingsOnly())
        var painter = Painter(board: self, blend: look.labelPaint == "blend")
        return try cards(rows, corner: day.json, zone: nil, painter: &painter)
    }

    private func cards(_ rows: [ListRow], corner: JSONValue, zone: JSONValue?, painter: inout Painter) throws -> [BoardCard] {
        let levels = JSONValue.array(rows.map { .number(Double($0.level)) })
        return try rows.enumerated().map { index, row in
            let due: CardDue? = try readRule("rules.cardDue", [row.item.json, corner])
            return BoardCard(
                item: row.item,
                level: row.level,
                branch: try readRule("rules.branchOf", [levels, .number(Double(index))]),
                due: try due?.date.map { try painter.due($0) },
                repeats: due?.repeats ?? false,
                paint: try painter.paint(row.item),
                id: painter.identity(row.item),
                zone: zone,
                parts: try painter.parts(row.item))
        }
    }

    private func timeline(day: String, today: String, screen: ScreenView, events: DayEvents, files: BoardFiles, measures: TimelineMeasures, painter: inout Painter) throws -> BoardTimeline {
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
            let corner = try self.corner(box, start: start, pair.1.start, pair.1.end)
            let card = BoardCard(item: pair.0, level: 0, branch: nil, due: nil, repeats: false, paint: try painter.paint(pair.0), corner: corner, id: painter.identity(pair.0), parts: try painter.parts(pair.0))
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

    private func corner(_ box: StackBox, start: Int, _ shownStart: Int, _ shownEnd: Int?) throws -> [String]? {
        let span: JSONValue = ["start": .number(Double(shownStart)), "end": shownEnd.map { .number(Double($0)) } ?? .null]
        let flags: JSONValue = ["stacked": .bool(box.stacked), "hiddenDuration": .bool(box.hiddenDuration)]
        return try readRule("rules.stackCorner", [flags, .number(Double(start)), span])
    }

    /// The timeline's task cards stacked anew at another hour's height (a pinch), each with its corner as it then stands.
    public func stack(_ timeline: BoardTimeline, measures: TimelineMeasures) throws -> [BoardSlot] {
        guard !timeline.slots.isEmpty else { return [] }
        let taskSpans = JSONValue.array(timeline.slots.map { ["start": .number(Double($0.start)), "end": $0.end.map { .number(Double($0)) } ?? .null] })
        let eventSpans = JSONValue.array(timeline.events.map { ["start": .number(Double($0.start)), "end": .number(Double($0.end)), "level": .number(Double($0.level))] })
        let boxes: [StackBox] = try readRule("rules.stackTasks", [taskSpans, eventSpans, .number(measures.hour), measures.card, measures.insets])
        return try zip(timeline.slots, boxes).map { slot, box in
            let old = slot.card
            let card = BoardCard(item: old.item, level: 0, branch: nil, due: nil, repeats: false, paint: old.paint, corner: try corner(box, start: slot.slotStart, slot.start, slot.end), id: old.id, parts: old.parts)
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

/// The core's paints, each asked for once per drawing.
struct Painter {
    let board: TaskBoard
    let blend: Bool
    private var shadesByColor: [String: Themed<Shades>] = [:]
    private var dueByDate: [String: DueLabel] = [:]
    private var partsByText: [String: [TextPart]] = [:]
    private var seen: [String: Int] = [:]

    /// A card's identity: its line, and which of the same lines it is when the file has two alike.
    mutating func identity(_ item: TaskItem) -> String {
        let line = "\(item.list)|\(item.key.raw)"
        let count = seen[line, default: 0]
        seen[line] = count + 1
        return count == 0 ? line : "\(line)#\(count)"
    }

    init(board: TaskBoard, blend: Bool) {
        self.board = board
        self.blend = blend
    }

    /// A task's card colours: none without a priority or a label.
    mutating func paint(_ item: TaskItem) throws -> CardPaint? {
        item.colors.isEmpty ? nil : CardPaint(colors: try item.colors.map { try shades($0) }, blend: blend)
    }

    mutating func shades(_ color: String) throws -> Themed<Shades> {
        if let known = shadesByColor[color] { return known }
        let shades = Themed<Shades>(
            dark: try board.readRule("rules.shadesOf", [.string(color), "dark"]),
            light: try board.readRule("rules.shadesOf", [.string(color), "light"]))
        shadesByColor[color] = shades
        return shades
    }

    /// A title's pieces, asked once per title.
    mutating func parts(_ item: TaskItem) throws -> [TextPart] {
        if let known = partsByText[item.text] { return known }
        let parts: [TextPart] = try board.readRule("rules.textParts", [.string(item.text)])
        partsByText[item.text] = parts
        return parts
    }

    mutating func due(_ date: String) throws -> DueLabel {
        if let known = dueByDate[date] { return known }
        let label: DueLabel = try board.readRule("rules.dueLabel", [.string(date)])
        dueByDate[date] = label
        return label
    }

    func event(_ event: WireEvent) throws -> Themed<EventPaint> {
        let hex: String = try board.readRule("rules.eventHex", [event.json])
        let alpha: Double = try board.readRule("rules.bgAlphaFor", [.string(event.source)])
        return Themed(
            dark: try board.readRule("rules.eventColors", [.string(hex), .number(alpha), "dark"]),
            light: try board.readRule("rules.eventColors", [.string(hex), .number(alpha), "light"]))
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
