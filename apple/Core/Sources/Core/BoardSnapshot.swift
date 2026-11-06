import Foundation

/// A colour in both themes: the frontend picks by the one it draws in.
public struct Themed<Value: Sendable & Hashable>: Sendable, Hashable {
    public let dark: Value
    public let light: Value
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
    public let paint: Themed<EventPaint>
    public var id: String { event.id }
}

public struct BoardSlot: Sendable, Hashable, Identifiable {
    public let card: BoardCard
    public let start: Int
    public let end: Int?
    public var id: String { card.id }
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
    public func snapshot(day wanted: String?, now: Date = Date()) throws -> BoardSnapshot {
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
        return BoardSnapshot(
            today: today,
            day: day,
            dayTitle: dayTitle,
            screen: screen,
            lists: lists,
            timeline: try timeline(day: day, today: today, screen: screen, events: events, files: files, painter: &painter),
            statuses: events.statuses,
            calendarsStale: events.stale,
            canUndo: canUndo,
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

    private func timeline(day: String, today: String, screen: ScreenView, events: DayEvents, files: BoardFiles, painter: inout Painter) throws -> BoardTimeline {
        let boundary: [String: Int] = try read("days.boundary", over: files)
        let startHour = boundary["startHour"] ?? 0
        let hours = (0...24).map { BoardHour(minute: $0 * 60, label: String(format: "%02d", (startHour + $0) % 24)) }
        let timed = try events.timed.map { event -> (WireEvent, DaySpan) in
            (event, try read("boundary.clipToDay", [.string(day), .number(event.startMs), .number(event.endMs)], over: files))
        }
        let spans = timed.map { ["start": JSONValue.number(Double($0.1.start)), "end": .number(Double($0.1.end ?? $0.1.start))] as JSONValue }
        let levels: [EventLevel] = try rule("rules.eventLevels", [.array(spans)])
        let placed = try zip(timed, levels).map { pair, level in
            BoardEvent(event: pair.0, start: pair.1.start, end: pair.1.end ?? pair.1.start, level: level.level, layer: level.layer, paint: try painter.event(pair.0))
        }
        let allDay = try events.allDay.map { BoardEvent(event: $0, start: 0, end: 0, level: 0, layer: 0, paint: try painter.event($0)) }
        let slots = try screen.day.slotted.map { item -> BoardSlot in
            let span: DaySpan = try read("tasks.shownSpan", [item.json, .string(day)], over: files)
            let card = BoardCard(item: item, level: 0, branch: nil, due: nil, repeats: false, shades: try item.colors.first.map { try painter.shades($0) })
            return BoardSlot(card: card, start: span.start, end: span.end)
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
