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
    /// The rows mode's lists, top to bottom; none in another mode.
    public let rows: [String]
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
    /// The projects button opened it.
    public let open: Bool
    /// A wide screen docks it; the phone lays it over the lists and a pick closes it.
    public let docked: Bool
    public let missing: Bool

    /// The rows as the gap rules take them.
    public var rowsJSON: JSONValue { .array(rows.map(\.json)) }
}

/// `FunnelView`: the funnel's view as this device shows it.
public struct FunnelView: Decodable, Hashable, Sendable {
    public let filter: ProjectFilter?
    public let view: ViewChoice
    public let panel: ProjectsPanel?

    /// What the quick entry's look takes as its `filter` (`EntryLook.filter`): the node and the project, or null.
    public var entryFilter: JSONValue {
        guard let filter else { return .null }
        return ["node": .string(filter.node), "project": filter.project.map(JSONValue.string) ?? .null]
    }
}

extension TaskBoard {
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
