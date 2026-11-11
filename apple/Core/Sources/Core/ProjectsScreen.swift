import Foundation

/// The Projects screen through the door (`docs/door.md`, «Projects»): the tree of `## Projects` on the left, the chosen
/// node's tasks on the right. The core decides everything (what is chosen, folded, waiting, where a drop or the plus
/// writes); these types are its answers and these calls only name its methods.

/// `ProjectsRow`: a row of the tree, top to bottom.
public struct ProjectsRow: Decodable, Hashable, Sendable, Identifiable {
    /// `"all"`, `"none"`, `"done"` or `"project:<name>"`: what a tap, a drop and the device's state name.
    public let node: String
    /// `all`, `project`, `none`, `done`.
    public let kind: String
    public let title: String
    public let depth: Int
    /// Drawn as a tile (depth 0), else as a line of text indented by its depth.
    public let tile: Bool
    /// The project waits: its open tasks only in Inbox and Backlog, or none yet.
    public let waiting: Bool
    /// The name drawn grey: a waiting or done project, No project, Done.
    public let muted: Bool
    public let selected: Bool
    public let hasBranch: Bool
    /// Its branch is folded: a tile shows a layer peeking out, a line an ellipsis.
    public let folded: Bool
    public let project: ProjectRef?
    /// A dragged card may be let go on it.
    public let acceptsTask: Bool
    /// A long press lifts it to reorder or nest.
    public let canLift: Bool
    /// A held card over it unfolds its branch after a pause.
    public let unfoldsOnHover: Bool
    public let json: JSONValue

    public var id: String { node }

    enum CodingKeys: String, CodingKey { case node, kind, title, depth, tile, waiting, muted, selected, hasBranch, folded, project, acceptsTask, canLift, unfoldsOnHover }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        node = try c.decode(String.self, forKey: .node)
        kind = try c.decode(String.self, forKey: .kind)
        title = try c.decode(String.self, forKey: .title)
        depth = try c.decode(Int.self, forKey: .depth)
        tile = try c.decode(Bool.self, forKey: .tile)
        waiting = try c.decode(Bool.self, forKey: .waiting)
        muted = try c.decode(Bool.self, forKey: .muted)
        selected = try c.decode(Bool.self, forKey: .selected)
        hasBranch = try c.decode(Bool.self, forKey: .hasBranch)
        folded = try c.decode(Bool.self, forKey: .folded)
        project = try c.decodeIfPresent(ProjectRef.self, forKey: .project)
        acceptsTask = try c.decode(Bool.self, forKey: .acceptsTask)
        canLift = try c.decode(Bool.self, forKey: .canLift)
        unfoldsOnHover = try c.decode(Bool.self, forKey: .unfoldsOnHover)
        json = try JSONValue(from: decoder)
    }
}

/// `ProjectsStage`: what a card's right side shows in By project: the stage's symbol, or the task's date.
public struct ProjectsStage: Decodable, Hashable, Sendable {
    /// `today`, `soon`, `inbox`, `backlog`, `done`, or `date`.
    public let kind: String
    public let date: String?
    public let label: DueLabel?
}

/// `ProjectsCard`: a card of the chosen node's tasks.
public struct ProjectsCard: Decodable, Hashable, Sendable, Identifiable {
    /// Who the card is: one per drawn card, so a task shown in two parts is two cards.
    public let id: String
    public let item: TaskItem
    /// By project: the stage's mark on the right; nil in By stage.
    public let stage: ProjectsStage?
    /// By stage: the subproject the task stands in, small over its title; nil for the node's own and in By project.
    public let over: String?
    /// The project it is shown under: what a drop on the tree replaces.
    public let from: String?
    /// What `tasks.dropOnProject` takes for this very card (`ProjectsDrop` `{ key, from }`).
    public let drop: JSONValue
    /// What its menu is opened from (`tasks.menu`'s `from`).
    public let menuFrom: String
    /// It may be dropped on the tree: an open task, not a subtask.
    public let canDrop: Bool
}

/// `ProjectsNewTask`: what the plus let go on the tasks writes: `tasks.createInPlace`'s place and its project.
public struct ProjectsNewTask: Decodable, Hashable, Sendable {
    public let place: JSONValue
    public let project: String?
}

/// `ProjectsSection`: a part of the chosen node's tasks.
public struct ProjectsSection: Decodable, Hashable, Sendable, Identifiable {
    public let key: String
    /// The header; nil for the node's own tasks.
    public let title: String?
    public let path: [String]
    public let depth: Int
    public let cards: [ProjectsCard]
    public let newTask: ProjectsNewTask?

    public var id: String { key }
}

/// `ProjectMenu`: the chosen project's menu, a tap on its name over its tasks: Rename and Note.
public struct ProjectMenu: Decodable, Hashable, Sendable {
    public let project: ProjectRef
    public let renameLabel: String
    public let noteLabel: String
    public let note: AttachedNote?
    public let attachLabel: String
    public let detachLabel: String

    public struct AttachedNote: Decodable, Hashable, Sendable {
        public let link: String
        public let name: String
    }
}

/// `ProjectsView`: the whole screen.
public struct ProjectsView: Decodable, Hashable, Sendable {
    public let rows: [ProjectsRow]
    public let selected: String
    /// `byProject` or `byStage`.
    public let mode: String
    public let modes: [Mode]
    /// The header over the tasks: the chosen node's name.
    public let title: String
    public let menu: ProjectMenu?
    public let sections: [ProjectsSection]
    public let newTask: ProjectsNewTask?
    public let emptyLabel: String
    public let missing: Bool

    public struct Mode: Decodable, Hashable, Sendable {
        public let mode: String
        public let label: String
    }

    /// The rows as the gap rules take them.
    public var rowsJSON: JSONValue { .array(rows.map(\.json)) }
}

/// `ProjectsLanding`: where a project lifted in the tree, or the plus, lands at a gap: the place `createProject` and
/// `moveProject` take, and the depth the gap is drawn at.
public struct ProjectsLanding: Decodable, Hashable, Sendable {
    public let place: JSONValue
    public let depth: Int
}

/// The depths a gap of the tree may take.
public struct ProjectsLevels: Decodable, Hashable, Sendable {
    public let min: Int
    public let max: Int
}

extension TaskBoard {
    /// The Projects screen over the vault's files as they are now, as this device keeps it.
    public func projectsScreen(now: Date? = nil) throws -> ProjectsView {
        try read("tasks.projectsScreen", over: try files(now: now))
    }

    /// A tap on a row: a node not chosen is chosen; the chosen one folds or unfolds its branch (Done opens its projects).
    public func tapProjectNode(_ node: String) throws {
        _ = try screenCall("tasks.tapProjectNode", [.string(node)], over: try files())
    }

    /// A node chosen with the branches above it opened: a search hit's path, a card's folder.
    public func selectProjectNode(_ node: String) throws {
        _ = try screenCall("tasks.selectProjectNode", [.string(node)], over: try files())
    }

    /// A card held over a folded row: its branch opened, without choosing it (`unfoldsOnHover`).
    public func unfoldProjectNode(_ node: String) throws {
        _ = try screenCall("tasks.unfoldProjectNode", [.string(node)], over: try files())
    }

    /// The segment: `byProject` or `byStage`.
    public func setProjectsMode(_ mode: String) throws {
        _ = try screenCall("tasks.setProjectsMode", [.string(mode)], over: try files())
    }

    /// The plus let go in the tree, the name typed: the project made at `place` and chosen; nil for a blank or taken name.
    @discardableResult
    public func createProject(_ name: String, at place: JSONValue) throws -> ProjectRef? {
        try write("tasks.createProject", [.string(name), place]).decode(ProjectRef?.self)
    }

    /// A project lifted and let go at `place`.
    public func moveProject(_ name: String, to place: JSONValue) throws {
        try write("tasks.moveProject", [.string(name), place])
    }

    /// Rename: the tree's line and every task's field; false for a blank name or another project's.
    @discardableResult
    public func renameProject(_ from: String, to: String) throws -> Bool {
        try write("tasks.renameProject", [.string(from), .string(to)]).bool ?? false
    }

    /// Detach: the note's link taken off the project's line; the note stays.
    public func detachProjectNote(_ name: String) throws {
        try write("tasks.setProjectNote", [.string(name), .null])
    }

    /// Cards let go on a row, each by its own `drop`: the project it was shown under gives way to the row's (No project:
    /// taken off); the place in the funnel stays.
    public func dropOnProject(_ cards: [ProjectsCard], to node: String) throws {
        try write("tasks.dropOnProject", [.array(cards.map(\.drop)), .string(node)])
    }

    /// Where a project lifted (or the plus) let go at `gap`, at `depth`, lands; nil where nothing lands.
    public func projectsGap(_ rows: JSONValue, gap: Int, depth: Int, lifted: String? = nil) throws -> ProjectsLanding? {
        try rule("rules.projectsGap", [rows, .number(Double(gap)), .number(Double(depth)), lifted.json])
    }

    /// Where a project lifted (`lifted`), or the plus, let go at `gap` lands: its own depth (the plus: the row above the
    /// gap's) shifted a step per `PROJECTS_INDENT` of the finger's sideways way `shift` since the lift; nil where nothing
    /// lands.
    public func projectsDrop(_ rows: JSONValue, gap: Int, shift: Double, lifted: String? = nil) throws -> ProjectsLanding? {
        try rule("rules.projectsDrop", [rows, .number(Double(gap)), .number(shift), lifted.json])
    }

    /// The tree's sideways step and how long a held card waits over a folded row (`PROJECTS_INDENT`, `PROJECTS_HOVER_MS`).
    public func projectsMeasures() throws -> (indent: Double, hoverMs: Double) {
        let constants: JSONValue = try rule("rules.constants")
        guard let indent = constants["PROJECTS_INDENT"].number, let hover = constants["PROJECTS_HOVER_MS"].number else {
            throw BoardError.failed("rules.constants gives no PROJECTS_INDENT or PROJECTS_HOVER_MS")
        }
        return (indent, hover)
    }

    /// A name «New project…», the plus in the tree or Rename would write nothing for: the Create button is off for it.
    public func isBlankProjectName(_ name: String) -> Bool {
        (try? read("tasks.isBlankProjectName", [.string(name)], over: settingsOnly(), as: Bool.self)) ?? true
    }

    /// A task's title that writes nothing (`tasks.isBlank`).
    public func isBlankTask(_ text: String) -> Bool {
        (try? read("tasks.isBlank", [.string(text)], over: settingsOnly(), as: Bool.self)) ?? true
    }

    /// The depths a gap of the tree may take.
    public func projectsLevels(_ rows: JSONValue, gap: Int, lifted: String? = nil) throws -> ProjectsLevels {
        try rule("rules.projectsLevels", [rows, .number(Double(gap)), lifted.json])
    }

    /// What a tap on an attached note opens: Obsidian at the note, in the vault named `vault`.
    public func noteURL(_ link: String, vault: String) throws -> URL? {
        URL(string: try rule("projects.noteUrl", [.string(link), .string(vault)], as: String.self))
    }
}
