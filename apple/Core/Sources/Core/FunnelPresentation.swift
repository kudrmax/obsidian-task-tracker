import Foundation

// MARK: The core's layout of a view mode (`ViewChoice.layout`, docs/door.md «The view rework»)

/// `ViewLayout`: how a view mode stands on the screen, the one answer the app draws from.
public struct ViewLayout: Decodable, Hashable, Sendable {
    public enum Swipe: String, Decodable, Sendable {
        /// The ribbon a swipe and the tab bar turn.
        case pages
        /// The screen stands still: no swipe, no rubber band.
        case none
    }

    public enum Width: String, Decodable, Sendable {
        case half, list, rest
    }

    public enum ColumnID: String, Decodable, Sendable {
        case inbox, soon, day, timeline, rows, projects
    }

    public struct List: Decodable, Hashable, Sendable {
        /// An `EntryList`: a funnel list's name or `projects`.
        public let list: String
        public let title: String?
    }

    public struct Column: Decodable, Hashable, Sendable {
        public let id: ColumnID
        public let lists: [List]
        public let width: Width
    }

    public struct Stack: Decodable, Hashable, Sendable {
        public let lists: [String]
        /// Each list scrolls inside its share; false where the lists grow with their cards.
        public let scrolls: Bool
    }

    public let mode: ViewMode
    public let columns: [Column]
    public let swipe: Swipe
    public let divider: Bool
    public let stack: Stack?
}

// MARK: The view as the app draws it

/// The core's `FunnelView` decoded into what the app decides by, each decision one exhaustive switch over the core's
/// answer, never a compare of the core's strings in a view. Built for every read; equal reads give equal presentations.
public struct FunnelPresentation: Equatable, Sendable {
    /// What stands left of the timeline.
    public enum Body: Equatable, Sendable {
        /// The ribbon of two columns the tab bar walks.
        case ribbon
        /// Inbox over Backlog, Soon and the day side by side (a wide screen's).
        case allColumns(lists: [[BoardColumn]])
        /// The funnel's lists stacked one under another.
        case rows(lists: [BoardColumn], scrolls: Bool)
        /// The node's tasks by project.
        case byProject
    }

    /// Where the view's lists come from.
    public enum Source: Equatable, Sendable {
        /// `screen` alone.
        case screen
        /// `screen` and the node's by project list (`projectsScreen(node)`; nil: no filter, every task).
        case projects(node: String?)
    }

    /// What a tap on the plus does.
    public enum PlusTap: Equatable, Sendable {
        /// The field opens in place, at the part the core marks.
        case inPlace
        /// The New Task screen.
        case newTask
    }

    /// Where the plus held and let go types.
    public enum PlusList: Equatable, Sendable {
        case funnel, projects
    }

    /// Why the panel shows.
    public enum PanelReason: Equatable, Sendable {
        case button, carry, naming
    }

    /// How a drawing follows the one on the screen.
    public enum Drawing: Equatable, Sendable {
        /// The same filter and mode: what moved, moves.
        case same
        /// Another filter or mode: drawn still, in place.
        case another
    }

    public let mode: ViewMode
    public let chosen: ViewMode
    public let body: Body
    /// A swipe turns the screen; elsewhere nothing moves sideways.
    public let swipes: Bool
    /// The tab bar walks the places (the ribbon's).
    public let wheel: Bool
    /// The divider stands before the timeline.
    public let divider: Bool
    public let source: Source
    public let plusTap: PlusTap
    public let plusList: PlusList?
    public let panelShown: Bool
    public let panelReason: PanelReason?
    /// The filter and the mode the view is read in.
    public let context: String

    public init(_ view: FunnelView) {
        let choice = view.view
        let layout = choice.layout
        mode = choice.mode
        chosen = choice.chosen
        context = choice.context
        divider = layout.divider
        switch layout.swipe {
        case .pages: swipes = true
        case .none: swipes = false
        }
        wheel = choice.wheel
        switch layout.mode {
        case .twoColumns:
            body = .ribbon
        case .allColumns:
            body = .allColumns(lists: layout.columns.filter { $0.id != .timeline }.map { $0.lists.compactMap { BoardColumn(rawValue: $0.list) } })
        case .rows:
            body = .rows(lists: (layout.stack?.lists ?? choice.rows).compactMap(BoardColumn.init(rawValue:)), scrolls: layout.stack?.scrolls ?? true)
        case .byProject:
            body = .byProject
        }
        switch choice.mode {
        case .byProject: source = .projects(node: view.filter?.node)
        case .twoColumns, .allColumns, .rows: source = .screen
        }
        plusTap = view.plus.tap == "inPlace" ? .inPlace : .newTask
        switch view.plus.list {
        case "funnel": plusList = .funnel
        case "projects": plusList = .projects
        default: plusList = nil
        }
        panelShown = view.panel?.open == true
        switch view.panel?.reason {
        case "button": panelReason = .button
        case "carry": panelReason = .carry
        case "naming": panelReason = .naming
        default: panelReason = nil
        }
    }

    /// How this presentation is drawn over `old`, the one on the screen: in another context still, else moving.
    public func drawing(after old: FunnelPresentation?) -> Drawing {
        guard let old else { return .another }
        return old.context == context ? .same : .another
    }

    /// The ribbon is the screen: it swipes, the quick entry turns it to a list's place, Done stands left of Inbox.
    public var isRibbon: Bool {
        switch body {
        case .ribbon: true
        case .allColumns, .rows, .byProject: false
        }
    }

    /// The node the by project list reads, when the view reads it.
    public var projectsNode: String?? {
        switch source {
        case .screen: nil
        case .projects(let node): .some(node)
        }
    }
}

// MARK: The rows' stack

/// One list of the Rows view measured as the core takes it (`StackedList`): its whole height, the title in, and where each
/// card ends from its top.
public struct StackedList: Codable, Hashable, Sendable {
    public let wanted: Double
    public let stops: [Double]

    public init(wanted: Double, stops: [Double]) {
        self.wanted = wanted
        self.stops = stops
    }

    /// A row of a list as it stands: its own height, the room above it, and whether a list may end under it (a card's).
    public struct Row: Equatable, Sendable {
        public let height: Double
        public let top: Double
        public let card: Bool

        public init(height: Double, top: Double, card: Bool) {
            self.height = height
            self.top = top
            self.card = card
        }
    }

    /// A list of `rows` under a title `head` tall: the rows laid one under another, each a card's bottom a place it may end.
    public static func measuring(head: Double, rows: [Row]) -> StackedList {
        var y = head
        var stops: [Double] = []
        for row in rows {
            y += row.top + row.height
            if row.card { stops.append(y) }
        }
        return StackedList(wanted: y, stops: stops)
    }
}

extension TaskBoard {
    /// The Rows view's lists' heights sharing `room` (`rules.stackedLists`): a list that scrolls ends under a whole card and
    /// the fade.
    public func stackedLists(_ lists: [StackedList], room: Double, fade: Double) throws -> [Double] {
        try rule("rules.stackedLists", [try .encoding(lists), .number(room), .number(fade)])
    }
}
