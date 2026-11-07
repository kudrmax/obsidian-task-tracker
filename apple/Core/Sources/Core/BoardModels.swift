import Foundation

/// The door's answers the screen draws, by the names in `core/application/contracts.ts`. Each keeps what it was read
/// from (`json`) where the screen hands it back to the door.

public struct TaskKey: Decodable, Hashable, Sendable {
    public let section: String
    public let index: Int
    public let path: [Int]
    public let raw: String
    public let json: JSONValue

    enum CodingKeys: String, CodingKey { case section, index, path, raw }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        section = try c.decode(String.self, forKey: .section)
        index = try c.decode(Int.self, forKey: .index)
        path = try c.decode([Int].self, forKey: .path)
        raw = try c.decode(String.self, forKey: .raw)
        json = try JSONValue(from: decoder)
    }
}

public struct Slot: Codable, Hashable, Sendable {
    public let date: String
    public let start: Int
    public let end: Int?
}

/// A priority level or a label, by its colour: a preset's name or `#RRGGBB`.
public struct Mark: Codable, Hashable, Sendable {
    public let prefix: String?
    public let name: String?
    public let color: String

    public var title: String { prefix ?? name ?? "" }
}

public struct SubtaskProgress: Codable, Hashable, Sendable {
    public let done: Int
    public let total: Int
}

public struct TaskAbilities: Codable, Hashable, Sendable {
    public let postpone: Bool
    public let removeDue: Bool
    public let remind: Bool
    public let setPriority: Bool
    public let setLabels: Bool
    public let stop: Bool
    public let addDescription: Bool
    public let fold: Bool
    public let resize: Bool
}

public struct TaskItem: Decodable, Hashable, Sendable, Identifiable {
    public let key: TaskKey
    public let text: String
    public let title: String
    public let status: String
    public let dueDate: String?
    public let slot: Slot?
    public let durationMin: Int?
    public let reminder: String
    public let repeatRule: JSONValue
    public let open: Bool
    public let repeatable: Bool
    public let priority: Mark?
    public let labels: [Mark]
    public let colors: [String]
    public let group: String?
    public let list: String
    public let isSubtask: Bool
    public let day: String?
    public let repeatDay: String
    public let can: TaskAbilities
    public let subtasks: [TaskItem]
    public let allSubtasks: [TaskItem]
    public let progress: SubtaskProgress?
    public let collapsed: Bool
    public let description: String?
    public let parentKey: TaskKey?
    public let json: JSONValue

    public var id: String { "\(key.section)/\(key.index)/\(key.path.map(String.init).joined(separator: "."))/\(key.raw)" }
    public var repeats: Bool { !repeatRule.isNull }
    public var inProgress: Bool { status == "inProgress" }
    public var closed: Bool { !open }

    enum CodingKeys: String, CodingKey {
        case key, text, title, status, dueDate, slot, durationMin, reminder, open, repeatable, priority, labels, colors, group, list
        case isSubtask, day, repeatDay, can, subtasks, allSubtasks, progress, collapsed, description, parentKey
        case repeatRule = "repeat"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(TaskKey.self, forKey: .key)
        text = try c.decode(String.self, forKey: .text)
        title = try c.decode(String.self, forKey: .title)
        status = try c.decode(String.self, forKey: .status)
        dueDate = try c.decodeIfPresent(String.self, forKey: .dueDate)
        slot = try c.decodeIfPresent(Slot.self, forKey: .slot)
        durationMin = try c.decodeIfPresent(Int.self, forKey: .durationMin)
        reminder = try c.decode(String.self, forKey: .reminder)
        repeatRule = try c.decodeIfPresent(JSONValue.self, forKey: .repeatRule) ?? .null
        open = try c.decode(Bool.self, forKey: .open)
        repeatable = try c.decode(Bool.self, forKey: .repeatable)
        priority = try c.decodeIfPresent(Mark.self, forKey: .priority)
        labels = try c.decode([Mark].self, forKey: .labels)
        colors = try c.decode([String].self, forKey: .colors)
        group = try c.decodeIfPresent(String.self, forKey: .group)
        list = try c.decode(String.self, forKey: .list)
        isSubtask = try c.decode(Bool.self, forKey: .isSubtask)
        day = try c.decodeIfPresent(String.self, forKey: .day)
        repeatDay = try c.decode(String.self, forKey: .repeatDay)
        can = try c.decode(TaskAbilities.self, forKey: .can)
        subtasks = try c.decode([TaskItem].self, forKey: .subtasks)
        allSubtasks = try c.decode([TaskItem].self, forKey: .allSubtasks)
        progress = try c.decodeIfPresent(SubtaskProgress.self, forKey: .progress)
        collapsed = try c.decode(Bool.self, forKey: .collapsed)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        parentKey = try c.decodeIfPresent(TaskKey.self, forKey: .parentKey)
        json = try JSONValue(from: decoder)
    }

    public static func == (a: TaskItem, b: TaskItem) -> Bool { a.json == b.json }
    public func hash(into hasher: inout Hasher) { hasher.combine(json) }
}

public struct ListSection: Codable, Hashable, Sendable {
    public let name: String?
    public let empty: Bool
}

public struct DayView: Decodable, Sendable {
    public let date: String
    public let list: [TaskItem]
    public let slotted: [TaskItem]
}

/// `ScreenView`: everything the screen shows for a day.
public struct ScreenView: Decodable, Sendable {
    public let day: DayView
    public let soon: [TaskItem]
    public let inbox: [TaskItem]
    public let backlog: [TaskItem]
    public let done: [TaskItem]
    public let sections: [String: [ListSection]]
    public let offer: JSONValue
    public let missing: Bool
    public let calendars: Bool
}

public struct ListRow: Decodable, Sendable {
    public let item: TaskItem
    public let level: Int
}

public struct GroupMenu: Decodable, Hashable, Sendable {
    public let section: String
    public let rename: Bool
    public let remove: Bool
}

public struct ListGroup: Decodable, Sendable {
    public let name: String?
    public let rows: [ListRow]
    public let empty: Bool
    public let menu: GroupMenu?
    public let reorder: Bool?
}

/// `ListView`: a list in its sections, and whether it shows their headers.
public struct ListView: Decodable, Sendable {
    public let showsHeaders: Bool
    public let groups: [ListGroup]

    public static let empty = ListView(showsHeaders: false, groups: [])

    public init(showsHeaders: Bool, groups: [ListGroup]) {
        self.showsHeaders = showsHeaders
        self.groups = groups
    }
}

/// `CardDue`: what a card's corner shows on a column's day.
public struct CardDue: Decodable, Hashable, Sendable {
    public let date: String?
    public let repeats: Bool
}

public struct DueLabel: Decodable, Hashable, Sendable {
    public let day: String
    public let month: String

    public init(day: String, month: String) {
        self.day = day
        self.month = month
    }
}

/// A level's or a label's colour as a card paints it.
public struct Shades: Decodable, Hashable, Sendable {
    public let ink: String
    public let fill: String
    public let meta: String
}

public struct EventPaint: Decodable, Hashable, Sendable {
    public let bg: String
    public let bar: String
    public let text: String
}

public struct WireEvent: Decodable, Hashable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let startMs: Double
    public let endMs: Double
    public let allDay: Bool
    public let calendar: String
    public let color: String?
    public let source: String
    public let past: Bool?
    public let json: JSONValue

    enum CodingKeys: String, CodingKey { case id, title, startMs, endMs, allDay, calendar, color, source, past }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        startMs = try c.decode(Double.self, forKey: .startMs)
        endMs = try c.decode(Double.self, forKey: .endMs)
        allDay = try c.decode(Bool.self, forKey: .allDay)
        calendar = try c.decode(String.self, forKey: .calendar)
        color = try c.decodeIfPresent(String.self, forKey: .color)
        source = try c.decode(String.self, forKey: .source)
        past = try c.decodeIfPresent(Bool.self, forKey: .past)
        json = try JSONValue(from: decoder)
    }
}

public struct SourceStatus: Decodable, Hashable, Sendable {
    public let source: String
    public let kind: String
    public let problem: JSONValue
    public let events: Int
    public let updatedDay: String?
    public let updatedDate: String?
    public let detail: String?
    public let stale: Bool
    public let updatedAtMs: Double?
}

/// `WireDayEvents`: the day's events and how fresh each calendar's file is.
public struct DayEvents: Decodable, Sendable {
    public let allDay: [WireEvent]
    public let timed: [WireEvent]
    public let statuses: [SourceStatus]
    public let stale: Bool

    public static let none = DayEvents(allDay: [], timed: [], statuses: [], stale: false)

    public init(allDay: [WireEvent], timed: [WireEvent], statuses: [SourceStatus], stale: Bool) {
        self.allDay = allDay
        self.timed = timed
        self.statuses = statuses
        self.stale = stale
    }
}

public struct ShownCalendar: Decodable, Hashable, Sendable, Identifiable {
    public let title: String
    public let account: String
    /// How the screens name the calendar and its account.
    public let name: String
    public let accountName: String
    public let color: String?
    public let shown: Bool

    public var id: String { "\(account)/\(title)" }
}

public struct DaySpan: Decodable, Hashable, Sendable {
    public let start: Int
    public let end: Int?
}

public struct EventLevel: Decodable, Hashable, Sendable {
    public let level: Int
    public let layer: Int
}

public struct DayOpening: Decodable, Sendable {
    public let kind: String
    public let minute: Int
}

// MARK: The task menu

public struct MenuStatus: Decodable, Hashable, Sendable {
    public let id: String
    public let confirm: Bool
}

public struct MenuTile: Decodable, Hashable, Sendable {
    public let level: Mark?
    public let label: Mark?
    public let on: Bool

    public var mark: Mark { level ?? label! }
}

public struct MenuTiles: Decodable, Hashable, Sendable {
    public let tiles: [MenuTile]
    public let disabled: Bool
}

public struct QuickMove: Decodable, Hashable, Sendable {
    public let id: String
    public let date: String?
}

public struct MenuSectionOption: Decodable, Hashable, Sendable {
    public let name: String?
    public let checked: Bool
}

public struct SectionChoice: Decodable, Hashable, Sendable {
    public let names: [String]
    public let current: String?
    public let ungrouped: String
}

public struct MenuSections: Decodable, Hashable, Sendable {
    public let choice: SectionChoice
    public let options: [MenuSectionOption]
    public let create: Bool
}

public struct MenuReminder: Decodable, Hashable, Sendable {
    public let kind: String
    public let checked: Bool
}

public struct Removal: Decodable, Hashable, Sendable {
    public let confirm: Bool
}

/// `TaskMenuModel`: what a task's menu, or the bulk menu, offers.
public struct TaskMenuModel: Decodable, Hashable, Sendable {
    /// The order the groups are drawn in, top to bottom: the core's, the same as the plugin's.
    public let groups: [String]
    public let statuses: [MenuStatus]
    public let levels: MenuTiles
    public let labels: MenuTiles
    public let moves: [QuickMove]
    public let removeDue: Bool
    public let dueDate: String?
    public let sections: MenuSections?
    public let edits: [String]
    public let reminders: [MenuReminder]
    public let remove: Removal?
}

// MARK: Repeat

/// `RepeatDraft`: what the repeat page offers and shows for a rule.
public struct RepeatDraft: Decodable, Hashable, Sendable {
    public let kind: String
    public let every: Int
    public let unit: String
    public let days: [Int]
    public let dayOfMonth: Int?
    public let day: String
    public let removable: Bool
    public let kinds: [String]
    public let units: [String]
    public let detail: String
    public let can: Fewer
    public let rule: JSONValue
    public let json: JSONValue

    public struct Fewer: Decodable, Hashable, Sendable {
        public let fewer: Bool
    }

    enum CodingKeys: String, CodingKey { case kind, every, unit, days, dayOfMonth, day, removable, kinds, units, detail, can, rule }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decode(String.self, forKey: .kind)
        every = try c.decode(Int.self, forKey: .every)
        unit = try c.decode(String.self, forKey: .unit)
        days = try c.decode([Int].self, forKey: .days)
        dayOfMonth = try c.decodeIfPresent(Int.self, forKey: .dayOfMonth)
        day = try c.decode(String.self, forKey: .day)
        removable = try c.decode(Bool.self, forKey: .removable)
        kinds = try c.decode([String].self, forKey: .kinds)
        units = try c.decode([String].self, forKey: .units)
        detail = try c.decode(String.self, forKey: .detail)
        can = try c.decode(Fewer.self, forKey: .can)
        rule = try c.decode(JSONValue.self, forKey: .rule)
        json = try JSONValue(from: decoder)
    }
}

/// `RepeatParts`: the words a rule is told with.
public struct RepeatParts: Decodable, Hashable, Sendable {
    public let every: String
    public let on: String?
    public let days: String?
    public let afterDone: Bool
}

// MARK: Search, the full screen

public struct FoundPart: Decodable, Hashable, Sendable {
    public let text: String
    public let match: Bool
}

public struct SearchHit: Decodable, Hashable, Sendable {
    public let item: TaskItem
    public let title: [FoundPart]
    public let description: [FoundPart]?
}

public struct SearchGroup: Decodable, Hashable, Sendable {
    public let list: String
    public let hits: [SearchHit]
}

public struct FullRow: Decodable, Sendable {
    public let item: TaskItem
    public let level: Int
}

public struct FullTree: Decodable, Sendable {
    public let task: TaskItem
    public let rows: [FullRow]
}

/// `TaskScreen`: where a task shows, a list or a day.
public struct TaskScreenPlace: Decodable, Hashable, Sendable {
    public let kind: String
    public let list: String?
    public let date: String?
}

// MARK: Settings

/// `SettingsForm`: the fields of the settings as the screen shows them.
public struct SettingsForm: Decodable, Sendable {
    public let tasksFile: String
    public let sections: [String: String]
    public let sectionOrder: [String]
    public let priorities: [Mark]
    public let labelTag: String
    public let labels: [Mark]
    public let presets: [String]
    public let ungrouped: String
    public let longPressMs: Int
    public let dayStartHour: Int
    public let scrollToHour: Int
    public let staleAfterMinutes: Int
    public let workCalendarFile: String
    public let dayStartHours: [Int]
}
