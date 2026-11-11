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
    /// The task menu's Project row can be pressed: off on a subtask, whose project is its parent's.
    public let setProject: Bool
    /// Made a result or a task again, and added to a result: an open task or subtask (`TaskMenuModel.result.rows`).
    public let result: Bool
}

/// `ProjectRef`: a task's project as the screens show it.
public struct ProjectRef: Codable, Hashable, Sendable {
    public let name: String
    /// What a place and `tasks.setProject` take.
    public let link: String
    /// The note's path from the vault's folder; nil when no note with the project tag has that name.
    public let note: String?
    public let canOpenNote: Bool
    /// The card shows the folder mark.
    public let mark: Bool
}

public struct TaskItem: Decodable, Hashable, Sendable, Identifiable {
    /// Who the task is, as the core names it (`TaskItem.id`, `docs/door.md` «Ids»): the same through every write, move,
    /// re-read and undo while the board hands the door's `ids` back. What a view keys its card by; `key` is the task as
    /// read, what an action names.
    public let id: String
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
    /// The task's project; a subtask's is its parent's. `nil` for none.
    public let project: ProjectRef?
    /// The title of the task a subtask belongs to; `nil` for a task.
    public let parentText: String?
    /// Its line starts with the result mark: a result, whose subtasks are the steps of one outcome.
    public let isResult: Bool
    /// The nearest result it is a step of; `nil` for none.
    public let resultOf: ResultRef?
    /// How a list's card draws it and whose menu its taps open: a folded result shows its next step.
    public let card: TaskCard
    /// How the timeline's block draws it and whose menu a tap opens: a result's next step, folded or not.
    public let block: TaskBlock
    public let json: JSONValue

    public var repeats: Bool { !repeatRule.isNull }
    public var inProgress: Bool { status == "inProgress" }
    public var closed: Bool { !open }

    enum CodingKeys: String, CodingKey {
        case id, key, text, title, status, dueDate, slot, durationMin, reminder, open, repeatable, priority, labels, colors, group, list
        case isSubtask, day, repeatDay, can, subtasks, allSubtasks, progress, collapsed, description, parentKey, project, parentText
        case isResult, resultOf, card, block
        case repeatRule = "repeat"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
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
        project = try c.decodeIfPresent(ProjectRef.self, forKey: .project)
        parentText = try c.decodeIfPresent(String.self, forKey: .parentText)
        isResult = try c.decode(Bool.self, forKey: .isResult)
        resultOf = try c.decodeIfPresent(ResultRef.self, forKey: .resultOf)
        card = try c.decode(TaskCard.self, forKey: .card)
        block = try c.decode(TaskBlock.self, forKey: .block)
        json = try JSONValue(from: decoder)
    }

    public static func == (a: TaskItem, b: TaskItem) -> Bool { a.json == b.json }
    public func hash(into hasher: inout Hasher) { hasher.combine(json) }
}

/// `ResultRef`: a result as a step's row and the Add to result page name it.
public struct ResultRef: Decodable, Hashable, Sendable {
    public let id: String
    /// What `tasks.addToResult` takes.
    public let key: TaskKey
    /// Its title, without the result mark.
    public let title: String
}

/// `TaskCard`: what a list's card draws and whose menu its taps open. A folded result with an open step is a card of two
/// lines: `over`, the result's own title (a tap there opens the task's own menu), over the step's title (a tap anywhere
/// else opens `step`'s menu).
public struct TaskCard: Decodable, Hashable, Sendable {
    /// The title drawn, with its links: the step's on a card of two lines, else the task's own `text`.
    public let text: String
    public let title: String
    /// The small line over the title; `nil` for a card of one line.
    public let over: String?
    /// The title in semibold: a result drawn with its own title.
    public let semibold: Bool
    /// The step a tap on the card opens the menu of; `nil`: the task's own. Held in a list, as a value can't hold itself.
    private let steps: [TaskItem]
    public var step: TaskItem? { steps.first }

    enum CodingKeys: String, CodingKey { case text, title, over, semibold, step }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decode(String.self, forKey: .text)
        title = try c.decode(String.self, forKey: .title)
        over = try c.decodeIfPresent(String.self, forKey: .over)
        semibold = try c.decode(Bool.self, forKey: .semibold)
        steps = try c.decodeIfPresent(TaskItem.self, forKey: .step).map { [$0] } ?? []
    }
}

/// `TaskBlock`: what the timeline's block draws and whose menu a tap opens: a result's next step, else the task's own.
public struct TaskBlock: Decodable, Hashable, Sendable {
    public let text: String
    public let title: String
    private let steps: [TaskItem]
    public var step: TaskItem? { steps.first }

    enum CodingKeys: String, CodingKey { case text, title, step }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decode(String.self, forKey: .text)
        title = try c.decode(String.self, forKey: .title)
        steps = try c.decodeIfPresent(TaskItem.self, forKey: .step).map { [$0] } ?? []
    }
}

public struct ListSection: Codable, Hashable, Sendable {
    /// Who the section is (`ListSection.id`): the same through a rename and a move; `"none"` for No section.
    public let id: String
    public let name: String?
    public let empty: Bool

    private enum CodingKeys: String, CodingKey { case id, name, empty }

    /// Handed back to the core with No section's name as `null`, never left out: the core tells No section by its null
    /// name, and a missing one put an empty section before it (`rules.listView`).
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(empty, forKey: .empty)
    }
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
    /// Each list's grouping by project, by the list's key.
    public let projects: [String: ListGrouping]
    /// The project whose view this is; `nil` for the main screen.
    public let project: ProjectRef?
    /// What a drop on each column's title means (`DropTo`), handed back to `tasks.drop` as it is.
    public let titleDrops: [String: JSONValue]
}

/// `ListGrouping`: whether a list groups its tasks by project, and its groups while it does.
public struct ListGrouping: Decodable, Sendable {
    public let canGroup: Bool
    public let on: Bool
    public let groups: [ProjectGroup]
}

/// `ProjectGroup`: a project's group of a list grouped by project, or No project, last.
public struct ProjectGroup: Decodable, Sendable {
    /// What `tasks.toggleFold` takes.
    public let key: String
    public let project: ProjectRef?
    public let title: String
    public let folded: Bool
    public let count: Int
    public let canOpenNote: Bool
    /// What its cards, headers, plates and places carry: the project's link, null for No project.
    public let zone: JSONValue
    public let titled: Bool
    public let sections: [ListGroup]
    /// What a drop on its header means, as a header passed (`{ group, project }`).
    public let head: JSONValue

    enum CodingKeys: String, CodingKey { case key, project, title, folded, count, canOpenNote, zone, titled, sections, head }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        project = try c.decodeIfPresent(ProjectRef.self, forKey: .project)
        title = try c.decode(String.self, forKey: .title)
        folded = try c.decode(Bool.self, forKey: .folded)
        count = try c.decode(Int.self, forKey: .count)
        canOpenNote = try c.decode(Bool.self, forKey: .canOpenNote)
        zone = try c.decode(JSONValue.self, forKey: .zone)
        titled = try c.decode(Bool.self, forKey: .titled)
        sections = try c.decode([ListGroup].self, forKey: .sections)
        head = try c.decode(JSONValue.self, forKey: .head)
    }
}

public struct ListRow: Decodable, Sendable {
    public let item: TaskItem
    public let level: Int

    public init(item: TaskItem, level: Int) {
        self.item = item
        self.level = level
    }
}

public struct GroupMenu: Decodable, Hashable, Sendable {
    public let section: String
    public let rename: Bool
    public let remove: Bool
    /// Inside a project's group, that group's zone (null for No project): `renameGroup` and `removeGroup` take it last.
    public let project: JSONValue?

    enum CodingKeys: String, CodingKey { case section, rename, remove, project }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        section = try c.decode(String.self, forKey: .section)
        rename = try c.decode(Bool.self, forKey: .rename)
        remove = try c.decode(Bool.self, forKey: .remove)
        project = c.contains(.project) ? try c.decode(JSONValue.self, forKey: .project) : nil
    }
}

public struct ListGroup: Decodable, Sendable {
    /// Its section's id: who the header is through a rename.
    public let id: String
    public let name: String?
    public let rows: [ListRow]
    public let empty: Bool
    public let menu: GroupMenu?
    public let reorder: Bool?
    /// It draws a header: false for the tasks without a section inside a project's group.
    public let header: Bool?
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
    /// A calendar shown on the day is taken from its file.
    public let used: Bool
    /// The row's code, drawn as it comes.
    public let tone: SourceTone
    /// Its row in the sources window, worded.
    public let words: SourceWords
}

/// `SourceTone`: how a source's row is drawn. Only a source in use is coloured: `old` its time orange, `broken` its
/// problem line red too; `spare` stands under «Not in use», grey whatever its age or error.
public enum SourceTone: String, Decodable, Hashable, Sendable {
    case plain, old, broken, spare
}

/// `CalendarAlert`: the badge on «⋯» → Calendars, the worst tone of the sources in use.
public enum CalendarAlert: String, Decodable, Hashable, Sendable {
    case none, old, broken
}

/// `SourceWords`: a calendar source's row in the sources window, worded by the core.
public struct SourceWords: Decodable, Hashable, Sendable {
    /// `Google Calendar`, `iPhone calendars`, `Work calendar`.
    public let name: String
    public let short: String
    /// `Updated today`, `Exported from iPhone`, `Not updated yet`, or the problem: `file missing`, `no answer in 15 s`, …
    public let sub: String
    /// `14:19`, `Yesterday 08:02`, `3 Oct 08:02`; empty with no update.
    public let time: String
    /// What its mark says: `Out of date`, `Refresh failed`; empty with no mark.
    public let alert: String
}

/// `DayWords`: the calendars' words for the day: the badge's, and the heading and note of the files not in use.
public struct DayWords: Decodable, Hashable, Sendable {
    /// What the badge says: `Out of date`, `Refresh failed`; empty with no badge.
    public let alert: String
    public let notInUse: String
    public let notInUseNote: String
}

/// `WireDayEvents`: the day's events and how fresh each calendar's file is.
public struct DayEvents: Decodable, Sendable {
    public let allDay: [WireEvent]
    public let timed: [WireEvent]
    /// In the window's order: in use first, then spare.
    public let statuses: [SourceStatus]
    public let stale: Bool
    public let alert: CalendarAlert
    public let words: DayWords
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

public struct MenuProjectOption: Decodable, Hashable, Sendable {
    public let project: ProjectRef
    public let checked: Bool
}

/// `MenuProject`: the Project row and its page; a pick writes `tasks.setProject` with its `link`, No project with null.
public struct MenuProject: Decodable, Hashable, Sendable {
    public let current: ProjectRef?
    public let options: [MenuProjectOption]
    /// No project, last: checked.
    public let none: Bool
    /// The No project row's words.
    public let noneLabel: String
    /// The row's value: the shared project's name, «No project», or empty when they differ.
    public let value: String
    /// Only subtasks: the row can't be pressed.
    public let disabled: Bool
    /// The page's last row, «New project…»: it asks the name (`TaskBoard.newProject`).
    public let newLabel: String
}

/// `EntryProject`: the quick entry's Project button and the New Task sheet's Project row: the page, and whether a project
/// is chosen (the button in the accent).
public struct EntryProject: Decodable, Hashable, Sendable {
    public let page: MenuProject
    public let lit: Bool
}

/// `RepeatRow`: the Repeat row's value on the right, or the weekdays (0 Monday) lit among the week's letters.
public struct RepeatRow: Decodable, Hashable, Sendable {
    public let value: String
    public let days: [Int]?
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
    /// The Project row, drawn right after Section (where `edits` puts `"project"`).
    public let project: MenuProject
    /// The Repeat row's value.
    public let `repeat`: RepeatRow
    /// The result rows, drawn right after Project in `result.rows`' order.
    public let result: MenuResult
}

/// `MenuResult`: the menu's result rows: «Add to result» (`addToResult`), which opens the page `tasks.resultPage` reads,
/// and «Make result» or «Make task» (`toggle`), which writes `tasks.setResult(key, toggle.result)`.
public struct MenuResult: Decodable, Hashable, Sendable {
    public let rows: [String]
    /// «Add to result».
    public let label: String
    /// What the row shows on the right: the result the tasks are steps of, else empty.
    public let value: String
    public let current: ResultRef?
    public let toggle: Toggle

    public struct Toggle: Decodable, Hashable, Sendable {
        public let label: String
        public let result: Bool
    }
}

/// `ResultOption`: an open result the Add to result page offers.
public struct ResultOption: Decodable, Hashable, Sendable, Identifiable {
    public let result: ResultRef
    /// The list it stands in, drawn as that column's icon.
    public let list: String
    /// Its project's name, a small line under the title.
    public let project: String?
    /// The result the tasks are steps of: choosing it writes nothing.
    public let checked: Bool

    public var id: String { result.id }
}

/// `ResultPage`: the Add to result page: the open results the query finds, and the words of its field and its last row.
public struct ResultPage: Decodable, Hashable, Sendable {
    public let options: [ResultOption]
    /// «Search results».
    public let placeholder: String
    /// «New result…».
    public let newLabel: String
    /// «Result name».
    public let namePlaceholder: String
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
    /// `weekdays`, `monthDay`, or `nil` for a rule with nothing under its unit (days, after done).
    public let detail: String?
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
        detail = try c.decodeIfPresent(String.self, forKey: .detail)
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
    /// The task's project's name in pieces, when the search found the query there.
    public let project: [FoundPart]?
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
    /// The line under the title: the task's project, a subtask's its parent's; nil for none.
    public let project: ProjectRef?
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
    public let projectTag: String
    /// The word a result's line starts with (`settings.setResultMark`).
    public let resultMark: String
    /// The mark before any is set: the Result Mark field's placeholder.
    public let defaultResultMark: String
    public let labels: [Mark]
    public let presets: [String]
    public let ungrouped: String
    public let longPressMs: Int
    public let dayStartHour: Int
    public let scrollToHour: Int
    public let staleAfterMinutes: Int
    public let workCalendarFile: String
    public let dayStartHours: [Int]
    /// Several labels: the paint saved, and the paints offered in order.
    public let labelPaint: String
    public let labelPaints: [String]
    /// Cards: the sizes saved (points) and the bounds the sliders move within; `settings.setCardHeight`, `setCardGap`.
    public let cardHeight: Int
    public let cardGap: Int
    public let cardHeights: SizeBounds
    public let cardGaps: SizeBounds
    /// Zoom Levels as typed, the hour's heights (`28, 56, 112, 224`); `settings.setZoomLevels(text)` writes text that reads.
    public let zoomLevels: String
    /// The line markers by name (`dueDateMarker`, `slotMarker`, …) and the order the screen edits them in; their words are
    /// the host's. `settings.setMarker(marker, text)`.
    public let markers: [String: String]
    public let markerOrder: [String]
    /// Google Calendar, as far as a host without the plugin's sign-in edits it: the OAuth client's id
    /// (`settings.setGoogleClientId`), the seconds between fetches (`settings.setCount("refreshSeconds", …)`), and whether
    /// a client id is there for Log in to go with.
    public let googleClientId: String
    public let refreshSeconds: Int
    public let googleClientReady: Bool
    /// Google is logged in (in Obsidian: the shared settings keep its token).
    public let googleLoggedIn: Bool
}

public struct SizeBounds: Decodable, Hashable, Sendable {
    public let min: Int
    public let max: Int
}

/// `ScreenSettings`: what every frontend's screen reads of the shared settings (`screenSettings.get`).
public struct ScreenSettings: Decodable, Hashable, Sendable {
    public let tasksFile: String
    public let sections: [String: String]
    public let ungrouped: String
    public let priorities: [Mark]
    public let labels: [Mark]
    public let labelPaint: String
    /// A card's height and the gap between two cards, points.
    public let cardHeight: Double
    public let cardGap: Double
    /// When a touch becomes a drag, on a card and on the empty timeline alike.
    public let longPressMs: Int
    public let scrollToHour: Int
}

/// `StretchSpan`: a calendar card while one of its dots is held, minutes from the day's start (`tasks.stretch`).
public struct StretchSpan: Decodable, Hashable, Sendable {
    public let start: Int
    public let end: Int

    enum CodingKeys: String, CodingKey { case start, end }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        start = Int(try c.decode(Double.self, forKey: .start).rounded())
        end = Int(try c.decode(Double.self, forKey: .end).rounded())
    }
}
