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

/// How a card's line runs to it from the task above: through it to a later sibling, or ending at it.
public enum Branch: Sendable, Hashable {
    case mid
    case last
}

/// A card as a column draws it: its task, how deep it stands, the corner, and its colour.
public struct BoardCard: Sendable, Hashable, Identifiable {
    public let item: TaskItem
    public let level: Int
    public let branch: Branch?
    public let due: DueLabel?
    public let repeats: Bool
    public let shades: Themed<Shades>?
    public var id: String { item.id }

    public init(item: TaskItem, level: Int, branch: Branch?, due: DueLabel?, repeats: Bool, shades: Themed<Shades>?) {
        self.item = item
        self.level = level
        self.branch = branch
        self.due = due
        self.repeats = repeats
        self.shades = shades
    }
}

public struct BoardGroup: Sendable, Hashable, Identifiable {
    public let name: String?
    /// The header's words: the section's name, or the No section name when the column shows headers.
    public let header: String?
    public let cards: [BoardCard]
    public let empty: Bool
    public let menu: GroupMenu?
    public var id: String { name ?? "\u{0}" }
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
    /// Every card of the list in drawing order, as a drop reads the gaps between them.
    public var cards: [BoardCard] { groups.flatMap(\.cards) }
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
    /// Where its card stands in the stack the core lays out: tasks never share the width.
    public let box: StackBox
    public var id: String { card.id }
}

/// `StackBox`: a task card's place in the timeline's items area.
public struct StackBox: Decodable, Sendable, Hashable {
    public let top: Double
    public let height: Double
    public let left: Double
    public let overlay: Bool
    public let stacked: Bool
    public let hiddenDuration: Bool
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
    /// Each card's menu by its id, as opened from where the card stands.
    public let menus: [String: TaskMenuModel]
    /// The tasks file's text it was read from: the screen reads again only when it changes.
    public let tasksText: String?

    /// The task the screen shows under `id`, anywhere.
    public func item(_ id: String) -> TaskItem? {
        for list in lists.values { if let card = list.cards.first(where: { $0.id == id }) { return card.item } }
        return timeline.slots.first { $0.id == id }?.card.item
    }

    /// Which list or the calendar a card is drawn in.
    public func column(of id: String) -> String? {
        for (column, list) in lists where list.cards.contains(where: { $0.id == id }) { return column.rawValue }
        return timeline.slots.contains { $0.id == id } ? "timeline" : nil
    }
}

extension TaskBoard {
    /// The screen for `day` (`nil`: today) over the vault's files as they are now.
    public func snapshot(day wanted: String?, measures: TimelineMeasures, now: Date = Date()) throws -> BoardSnapshot {
        let files = try files(now: now)
        let today: String = try read("days.today", over: files)
        let day = wanted ?? today
        let screen: ScreenView = try read("tasks.screen", [.string(day)], over: files)
        let relation: String = try read("days.relation", [.string(day)], over: files)
        let dayTitle: String = try rule("rules.dayTitle", [.string(day), .string(relation), .string(today)])
        var painter = Painter(board: self)

        func list(_ column: BoardColumn, _ items: [TaskItem], title: String) throws -> BoardList {
            let sections: ColumnSections? = try read("tasks.columnSections", [.string(column.rawValue), .string(day)], over: files)
            let listSections = sections.flatMap { screen.sections[$0.list] } ?? []
            let view: ListView = try rule("rules.listView", [.array(items.map(\.json)), .bool(sections != nil), try .encoding(listSections)])
            let corner = column == .day ? JSONValue.string(day) : .null
            let ungrouped = screen.offer["ungrouped"].string ?? ""
            let groups = try view.groups.map { group in
                BoardGroup(
                    name: group.name,
                    header: view.showsHeaders ? (group.name ?? ungrouped) : nil,
                    cards: try cards(group.rows, corner: corner, painter: &painter),
                    empty: group.empty,
                    menu: group.menu)
            }
            return BoardList(column: column, title: title, groups: groups, showsHeaders: view.showsHeaders)
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
            for card in list.cards { menus[card.id] = try read("tasks.menu", [card.item.json, .string(column.rawValue), menuScreen], over: settingsOnly) }
        }
        for slot in timeline.slots { menus[slot.id] = try read("tasks.menu", [slot.card.item.json, "timeline", menuScreen], over: settingsOnly) }
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
            tasksText: files.tasks)
    }

    private func cards(_ rows: [ListRow], corner: JSONValue, painter: inout Painter) throws -> [BoardCard] {
        try rows.enumerated().map { index, row in
            let due: CardDue? = try rule("rules.cardDue", [row.item.json, corner])
            return BoardCard(
                item: row.item,
                level: row.level,
                branch: row.level == 0 ? nil : Self.branch(of: index, in: rows),
                due: try due?.date.map { try painter.due($0) },
                repeats: due?.repeats ?? false,
                shades: try row.item.colors.first.map { try painter.shades($0) })
        }
    }

    /// A subtask's line goes on past it when a sibling follows before the rows climb back over its level.
    private static func branch(of index: Int, in rows: [ListRow]) -> Branch {
        let level = rows[index].level
        for row in rows[(index + 1)...] {
            if row.level == level { return .mid }
            if row.level < level { return .last }
        }
        return .last
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
        let levels: [EventLevel] = try rule("rules.eventLevels", [.array(spans)])
        let placed = try zip(timed, levels).map { pair, level in
            let left: Double = try rule("rules.overlayLeft", [.number(Double(level.level)), measures.insets])
            return BoardEvent(event: pair.0, start: pair.1.start, end: pair.1.end ?? pair.1.start, level: level.level, layer: level.layer, left: left, paint: try painter.event(pair.0))
        }
        let allDay = try events.allDay.map { BoardEvent(event: $0, start: 0, end: 0, level: 0, layer: 0, left: 0, paint: try painter.event($0)) }
        let shown = try screen.day.slotted.map { item -> (TaskItem, DaySpan) in (item, try read("tasks.shownSpan", [item.json, .string(day)], over: files)) }
        let taskSpans = JSONValue.array(shown.map { ["start": .number(Double($0.1.start)), "end": $0.1.end.map { .number(Double($0)) } ?? .null] })
        let eventSpans = JSONValue.array(placed.map { ["start": .number(Double($0.start)), "end": .number(Double($0.end)), "level": .number(Double($0.level))] })
        let boxes: [StackBox] = try rule("rules.stackTasks", [taskSpans, eventSpans, .number(measures.hour), measures.card, measures.insets])
        let slots = try zip(shown, boxes).map { pair, box -> BoardSlot in
            let span: JSONValue = ["start": .number(Double(pair.1.start)), "end": pair.1.end.map { .number(Double($0)) } ?? .null]
            let flags: JSONValue = ["stacked": .bool(box.stacked), "hiddenDuration": .bool(box.hiddenDuration)]
            let corner: [String]? = try rule("rules.stackCorner", [flags, .number(Double(pair.0.slot?.start ?? pair.1.start)), span])
            let card = BoardCard(item: pair.0, level: 0, branch: nil, due: corner.map { DueLabel(day: $0[0], month: $0[1]) }, repeats: pair.0.repeats, shades: try pair.0.colors.first.map { try painter.shades($0) })
            return BoardSlot(card: card, start: pair.1.start, end: pair.1.end, box: box)
        }
        let now: Int? = day == today ? try read("boundary.offsetOf", [.string(day), .number((files.now.timeIntervalSince1970 * 1000).rounded())], over: files) : nil
        let opening: DayOpening = try read("days.openAt", [.string(day)], over: files)
        return BoardTimeline(hours: hours, events: placed, allDay: allDay, slots: slots, now: now, opening: opening.minute)
    }
}

/// The core's paints, each asked for once per drawing.
struct Painter {
    let board: TaskBoard
    private var shadesByColor: [String: Themed<Shades>] = [:]
    private var dueByDate: [String: DueLabel] = [:]

    init(board: TaskBoard) {
        self.board = board
    }

    mutating func shades(_ color: String) throws -> Themed<Shades> {
        if let known = shadesByColor[color] { return known }
        let shades = Themed<Shades>(
            dark: try board.rule("rules.shadesOf", [.string(color), "dark"]),
            light: try board.rule("rules.shadesOf", [.string(color), "light"]))
        shadesByColor[color] = shades
        return shades
    }

    mutating func due(_ date: String) throws -> DueLabel {
        if let known = dueByDate[date] { return known }
        let label: DueLabel = try board.rule("rules.dueLabel", [.string(date)])
        dueByDate[date] = label
        return label
    }

    func event(_ event: WireEvent) throws -> Themed<EventPaint> {
        let hex: String = try board.rule("rules.eventHex", [event.json])
        let alpha: Double = try board.rule("rules.bgAlphaFor", [.string(event.source)])
        return Themed(
            dark: try board.rule("rules.eventColors", [.string(hex), .number(alpha), "dark"]),
            light: try board.rule("rules.eventColors", [.string(hex), .number(alpha), "light"]))
    }
}

/// `ColumnSections`: whose sections a column shows.
public struct ColumnSections: Decodable, Sendable {
    public let list: String
    public let date: String?
}
