import Foundation

/// Projects as one view with the funnel, through the door (`docs/door.md`, «Projects as one view with the funnel»): the
/// tree is a panel over the funnel, its chosen node filters every list, and the view button picks how the lists are laid
/// out. The core decides all of it; these are its answers and these calls only name its methods.

/// `ViewMode`: how the funnel's lists are laid out.
public enum ViewMode: String, Codable, Sendable, CaseIterable {
    /// The ribbon the tab bar walks: Inbox, Soon, Today and the calendar.
    case twoColumns
    /// Inbox over Backlog, Soon, the day and the timeline side by side: a wide screen's only.
    case allColumns
    /// Inbox, Backlog, Soon and the day's list stacked, the timeline beside them.
    case rows
    /// The chosen node's tasks in its subprojects' parts (`projectsScreen(node)`).
    case byProject
}

/// `ViewModeOption`: a row of the view button's menu.
public struct ViewModeOption: Decodable, Hashable, Sendable {
    public let mode: ViewMode
    public let label: String
    /// A Lucide name: the app draws its own symbol for it.
    public let icon: String
    public let checked: Bool
}

/// `ViewChoice`: the view a screen draws and the button that changes it.
public struct ViewChoice: Decodable, Hashable, Sendable {
    public let mode: ViewMode
    public let modes: [ViewModeOption]
    public let icon: String
    /// The wheel (the app's tab bar) shows: two columns alone.
    public let wheel: Bool
    /// The screen is the ribbon: it swipes, a field moved to a list turns it to that list's place, Done stands left of
    /// Inbox; elsewhere a done find opens on its own page.
    public let ribbon: Bool
    /// What the view reads: `screen`, or `projectsScreen` (By project reads `projectsScreen(filter.node)` too).
    public let source: String
    /// The rows mode's lists, top to bottom; none in another mode.
    public let rows: [String]
    /// The words in an empty list: «No tasks».
    public let emptyLabel: String
    /// Each funnel list's No tasks plate while it draws no card: its words, or nil for no plate.
    public let plates: [String: String?]

    /// The plate list `column` draws while it shows no card; nil for none.
    public func plate(_ column: String) -> String? { plates[column] ?? nil }
}

/// `ProjectFilter`: the node the funnel is filtered by, and what is drawn over its tasks.
public struct ProjectFilter: Decodable, Hashable, Sendable {
    /// What `screen`, `drop`, `dropPreview`, `landing` and the quick entry take as their filter.
    public let node: String
    /// The node's name, big over the tasks.
    public let title: String
    /// The project's menu, the title tapped; nil for All, No project and Done.
    public let menu: ProjectMenu?
    /// The cross beside the title clears the filter.
    public let clearable: Bool
    /// The project a task typed under the filter is given; nil where none is.
    public let project: String?
    public let emptyLabel: String
}

/// `ProjectsPanel`: the tree as a panel over the funnel.
public struct ProjectsPanel: Decodable, Hashable, Sendable {
    public let rows: [ProjectsRow]
    /// It shows, for any reason (`reason`).
    public let open: Bool
    /// Why it shows: `button`, `carry` (a carry brought it out at the edge), `naming` (a new project's name is typed in
    /// it); nil while it is closed.
    public let reason: String?
    /// A tap on the dim around it closes it.
    public let dimCloses: Bool
    /// A wide screen docks it; the phone lays it over the lists and a pick closes it.
    public let docked: Bool
    public let missing: Bool

    /// The rows as the gap rules take them.
    public var rowsJSON: JSONValue { .array(rows.map(\.json)) }
}

/// `PlusChoice`: the plus in this view.
public struct PlusChoice: Decodable, Hashable, Sendable {
    /// `inPlace` (By project: the field at its plus part) or `newTask` (the New Task screen).
    public let tap: String
    /// Held and let go: `funnel` (the funnel's lists), `projects` (the By project list), or nil.
    public let list: String?
    /// Let go in the tree while the panel shows: a new project there.
    public let tree: Bool
}

/// `FunnelView`: the funnel's view as this device shows it.
public struct FunnelView: Decodable, Hashable, Sendable {
    public let filter: ProjectFilter?
    public let view: ViewChoice
    public let panel: ProjectsPanel?
    /// A search opened over the view shows each find's project path.
    public let searchPaths: Bool
    /// What the plus does here: a tap types in place or opens New Task; held, which list and whether the tree takes it.
    public let plus: PlusChoice
    /// The place of the funnel the screen stands at, as the device keeps it.
    public let place: String

    /// What the quick entry's look takes as its `filter` (`EntryLook.filter`): the node and the project, or null.
    public var entryFilter: JSONValue {
        guard let filter else { return .null }
        return ["node": .string(filter.node), "project": filter.project.map(JSONValue.string) ?? .null]
    }
}

extension TaskBoard {
    /// The view as this device keeps it before the first read answers (`tasks.firstView`): reads no file.
    public func firstView() throws -> ViewChoice {
        try read("tasks.firstView", [.bool(false), .bool(false)], over: settingsOnly())
    }

    /// Whether `filter` hides `item` from the screen (a search's find): the filter is cleared before the find is shown.
    public func filterHides(_ item: TaskItem, filter: String?) throws -> Bool {
        try read("tasks.filterHides", [item.json, filter.json], over: try files())
    }

    // MARK: The carry to a project (the core's session, `docs/door.md`)

    /// A carry lifted: the funnel's tasks by their keys, the By project list's cards by their drops, or the plus. The core
    /// keeps the filter it is lifted under.
    public func startCarry(keys: [TaskKey], cards: [JSONValue] = [], plus: Bool = false, wide: Bool = false) throws {
        var start: [String: JSONValue] = ["keys": .array(keys.map(\.json))]
        if !cards.isEmpty { start["cards"] = .array(cards) }
        if plus { start["plus"] = .bool(true) }
        _ = try screenCall("tasks.startCarry", [.object(start), .bool(wide)], over: try files())
    }

    /// The carrying finger: within the left edge, over a panel row's node. The core brings the panel out, unfolds or
    /// opens a row once the finger has waited there; the answer is how long until it should be told again (nil: never).
    public func carryAt(edge: Bool, node: String?, now: Date = Date()) throws -> Double? {
        let at: JSONValue = ["edge": .bool(edge), "node": node.json]
        let answer = try screenCall("tasks.carryAt", [at, .number((now.timeIntervalSince1970 * 1000).rounded())], over: try files())
        return answer["wait"].number
    }

    /// The carry let go on a panel row: every carried task goes to that project, under the filter it was lifted under.
    public func carryOnNode(_ node: String) throws {
        try write("tasks.carryOnNode", [.string(node)])
    }

    /// The carry ended: `nowhere` (or cancelled) puts the lift's filter back, `dropped` keeps the screen, `naming` keeps
    /// the panel out while a new project's name is typed.
    public func endCarry(_ how: String) throws {
        _ = try screenCall("tasks.endCarry", [.string(how)], over: try files())
    }

    /// Whether a carry that ended `how` (`dropped`, `nowhere`, `naming`) ends Select Tasks.
    public func endsSelection(_ how: String) -> Bool {
        (try? rule("rules.endsSelection", [.string(how)], as: Bool.self)) ?? false
    }

    /// The new project's name answered or cancelled: the panel the naming kept out goes.
    public func endProjectName() throws {
        _ = try screenCall("tasks.endProjectName", [], over: try files())
    }

    // MARK: The place

    /// The place the screen stands at, as the device keeps it (`inbox`, `soon`, `calendar`); read at once.
    public func firstPlace() throws -> String {
        try read("tasks.firstPlace", [], over: settingsOnly())
    }

    /// Where the screen stands now kept on the device: a place's name, or anything kept before (the core reads it).
    public func setFunnelPlace(_ place: JSONValue) throws {
        _ = try screenCall("tasks.setFunnelPlace", [place], over: settingsOnly())
    }

    /// The funnel's view over the vault's files as they are now, as this device keeps it. The phone's screen is narrow.
    public func funnelView(wide: Bool = false, now: Date? = nil) throws -> FunnelView {
        try read("tasks.funnelView", [.bool(wide)], over: try files(now: now))
    }

    /// A tap on a row of the panel: chosen (on a narrow screen the panel then closes), or, chosen already, folded.
    public func pickProjectNode(_ node: String, wide: Bool = false) throws {
        _ = try screenCall("tasks.pickProjectNode", [.string(node), .bool(wide)], over: try files())
    }

    /// The cross beside the filter's title: no node chosen.
    public func clearProjectFilter() throws {
        _ = try screenCall("tasks.clearProjectFilter", [], over: try files())
    }

    /// The projects button: the panel opened or closed.
    public func setProjectsPanel(_ open: Bool) throws {
        _ = try screenCall("tasks.setProjectsPanel", [.bool(open)], over: try files())
    }

    /// A mode of the view button's menu, kept apart for the screen with a filter and without.
    public func setViewMode(_ mode: ViewMode) throws {
        _ = try screenCall("tasks.setViewMode", [.string(mode.rawValue)], over: try files())
    }

    /// The funnel's tasks `keys` let go on a row of the panel, the screen under `filter`: the project each is shown by
    /// gives way to the row's; the place in the funnel stays.
    public func dropTasksOnProject(_ keys: [TaskKey], to node: String, filter: String?) throws {
        try write("tasks.dropTasksOnProject", [.array(keys.map(\.json)), .string(node), filter.json])
    }

    /// The node's tasks by project whatever the device chose: the by project mode's list.
    public func projectsScreen(node: String, now: Date? = nil) throws -> ProjectsView {
        try read("tasks.projectsScreen", [.string(node)], over: try files(now: now))
    }

    /// Where a swipe on the funnel leads from `mode` on `date`, a step back (-1) or on (1); nil at the row's end.
    public func stepFunnel(mode: String, date: String, shift: Int) throws -> (mode: String, date: String)? {
        let at: JSONValue = try read("days.stepFunnel", [["mode": .string(mode), "date": .string(date)], .number(Double(shift))], over: settingsOnly())
        guard let mode = at["mode"].string, let date = at["date"].string else { return nil }
        return (mode, date)
    }
}
