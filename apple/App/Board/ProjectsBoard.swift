import Core
import SwiftUI
import UIKit

/// The Projects page's state: the core's `ProjectsView` and its cards as the page draws them, each a call through the
/// door (`docs/door.md`, «Projects»). The page decides nothing: what is chosen, folded, waiting, where a card or the plus
/// goes, is the core's answer; this only turns taps and drops into its calls and reads the screen again.
@MainActor
@Observable
final class ProjectsBoard {
    @ObservationIgnored private let board = AppServices.shared.board
    @ObservationIgnored weak var model: BoardModel?

    private(set) var view: ProjectsView?
    /// The chosen node's parts as drawn: each part's cards painted as a list paints them, with the stage or the subproject.
    private(set) var parts: [Part] = []
    /// The menus of the cards drawn, by task id: the card's menu finds its task's here.
    @ObservationIgnored private(set) var menus: [String: TaskMenuModel] = [:]
    /// The cards drawn, by task id: what a drop on the tree reads (the project it was shown under).
    @ObservationIgnored private(set) var cards: [String: ProjectsCard] = [:]

    /// Where the page's rows, headers and cards stand on the screen: what a carry over the page reads.
    @ObservationIgnored let geometry = ProjectsGeometry()

    /// The tree's row a carried card would be let go on: lit in the drop's colour.
    var dropOn: String?
    /// The name asked: a task typed for the plus let go on the tasks, a project for the plus in the tree, a rename.
    var asking: Ask?
    /// The project Delete project was chosen for, its question shown before anything is written.
    var deleting: ProjectMenu?

    struct Part: Identifiable {
        let section: ProjectsSection
        let cards: [BoardCard]
        var id: String { section.key }
    }

    enum Ask: Identifiable {
        case task(ProjectsNewTask)
        case project(JSONValue)
        case rename(String)

        var id: String {
            switch self {
            case .task: "task"
            case .project: "project"
            case .rename(let name): "rename/" + name
            }
        }

        var title: String {
            switch self {
            case .task: String(localized: "New Task")
            case .project: String(localized: "New Project")
            case .rename: String(localized: "Rename Project")
            }
        }

        var action: String {
            switch self {
            case .task, .project: String(localized: "Add")
            case .rename: String(localized: "Rename")
            }
        }
    }

    // MARK: Reading

    /// The page read again over the files as they are now, its cards painted and their menus asked.
    func read() async {
        guard let model else { return }
        let board = board, screen = model.menuScreen
        guard let read = try? await Task.detached(operation: { () throws -> (ProjectsView, [[BoardCard]], [String: TaskMenuModel]) in
            let view = try board.projectsScreen()
            var drawn: [[BoardCard]] = []
            var menus: [String: TaskMenuModel] = [:]
            for section in view.sections {
                let painted = try board.cards(section.cards.map { ListRow(item: $0.item, level: 0) })
                drawn.append(zip(section.cards, painted).map { Self.card($0.1, as: $0.0) })
                for card in section.cards {
                    for item in [card.item] + (card.item.card.step.map { [$0] } ?? []) where menus[item.id] == nil {
                        menus[item.id] = try board.read("tasks.menu", [item.json, .string(card.menuFrom), screen], over: board.settingsOnly())
                    }
                }
            }
            return (view, drawn, menus)
        }).value else { return }
        menus = read.2
        cards = Dictionary(uniqueKeysWithValues: read.0.sections.flatMap(\.cards).map { ($0.id, $0) })
        withAnimation(.snappy) {
            view = read.0
            parts = zip(read.0.sections, read.1).map { Part(section: $0.0, cards: $0.1) }
        }
    }

    /// A card of the page: By project the stage's symbol, or the date, in the date's place; By stage the subproject the
    /// task stands in, small over its title after a folder.
    nonisolated private static func card(_ painted: BoardCard, as card: ProjectsCard) -> BoardCard {
        var due = painted.due
        var stage: String?
        if let mark = card.stage {
            if let label = mark.label { due = label } else { due = nil; stage = symbol(mark.kind) }
        }
        let face = card.over.map { CardFace(text: painted.face.text, over: $0, overSymbol: "folder", step: painted.face.step) } ?? painted.face
        return BoardCard(item: painted.item, level: 0, branch: nil, due: due, repeats: painted.repeats, paint: painted.paint, parts: painted.parts, face: face, stage: stage, id: card.id)
    }

    /// A stage's symbol: the tab bar's for the funnel's lists, the archive box for Backlog.
    nonisolated static func symbol(_ stage: String) -> String {
        switch stage {
        case "today": "sun.max"
        case "soon": "hourglass"
        case "inbox": "tray"
        case "backlog": "archivebox"
        default: "checkmark.circle"
        }
    }

    /// Something stands on the page above part `index`: a header, a card or a plate (an empty own part draws nothing).
    func drawsAnything(before index: Int) -> Bool {
        parts.prefix(index).contains { $0.section.header || !$0.cards.isEmpty || $0.section.plate }
    }

    // MARK: The tree

    /// A tap on a row: chosen, or, chosen already, its branch folds or unfolds.
    func tap(_ row: ProjectsRow) async {
        UISelectionFeedbackGenerator().selectionChanged()
        await act { try $0.tapProjectNode(row.node) }
    }

    /// A project chosen from elsewhere (a card's folder, the full screen's project line), the branches above it opened.
    func select(_ name: String) async {
        guard let node: String = model?.ruleNow("rules.projectNodeOf", [.string(name)]) else { return }
        await act { try $0.selectProjectNode(node) }
    }

    /// A card held over a folded row: its branch opens, nothing chosen.
    func unfold(_ node: String) async {
        await act { try $0.unfoldProjectNode(node) }
    }

    /// The segment: By project or By stage.
    func setMode(_ mode: String) async {
        guard mode != view?.mode else { return }
        await act { try $0.setProjectsMode(mode) }
    }

    /// A card let go on a row (by the card's own id): the project it was shown under gives way to the row's; its place in
    /// the funnel stays.
    func drop(_ id: String, on node: String) async {
        guard let card = cards[id] else { return }
        await write { try $0.dropOnProject([card], to: node) }
    }

    /// A project lifted and let go in a gap.
    func move(_ name: String, to place: JSONValue) async {
        await write { try $0.moveProject(name, to: place) }
    }

    /// The name typed for what was asked: a task of the part, a project of the gap, a rename; Cancel (nil) writes nothing.
    func answer(_ name: String?, to ask: Ask) async {
        guard let name, !isBlank(name, for: ask) else { return }
        switch ask {
        case .task(let new):
            await model?.write("tasks.createInPlace", [.string(name), .null, new.place, .null, .array([]), new.project.json])
            await read()
        case .project(let place):
            await write { _ = try $0.createProject(name, at: place) }
        case .rename(let from):
            await write { _ = try $0.renameProject(from, to: name) }
        }
    }

    /// A name that writes nothing, as the core says: the alert's Add is off for it.
    func isBlank(_ name: String, for ask: Ask) -> Bool {
        if case .task = ask { return board.isBlankTask(name) }
        return board.isBlankProjectName(name)
    }

    /// The tree's sideways step and the pause over a folded row before it opens, the core's.
    @ObservationIgnored lazy var measures: (indent: Double, hoverMs: Double) = {
        do {
            return try board.projectsMeasures()
        } catch {
            fatalError("The core gives no Projects tree measures: \(error)")
        }
    }()

    /// Delete project, confirmed: the project goes from the tree and from its tasks; every task stays.
    func delete(_ name: String) async {
        await write { try $0.deleteProject(name) }
    }

    /// Folder switched: the project made a folder, which takes no task, or a project again; the core refuses turning it
    /// on while the project has tasks of its own.
    func setFolder(_ name: String, _ folder: Bool) async {
        await write { _ = try $0.setProjectFolder(name, folder) }
    }

    /// Detach: the note's link taken off the project; the note stays in the vault.
    func detach(_ name: String) async {
        await write { try $0.detachProjectNote(name) }
    }

    /// The attached note in Obsidian, at the vault the app was given.
    func openNote(_ link: String) {
        guard let vault = UserDefaults.standard.string(forKey: "vaultFolderName"), let url = try? board.noteURL(link, vault: vault) else { return }
        UIApplication.shared.open(url)
    }

    /// Where a project lifted, or the plus, let go before row `gap` with the finger `shift` points sideways (since the
    /// lift; the plus: from the row above's depth) lands, and the depth its line is drawn at (`rules.projectsDrop`).
    func landing(gap: Int, shift: Double, lifted: String?) -> ProjectsLanding? {
        guard let rows = view?.rowsJSON else { return nil }
        return try? board.projectsDrop(rows, gap: gap, shift: shift, lifted: lifted)
    }

    // MARK: Calls

    /// A call that changes only this device's page (the node chosen, a fold, the segment), then the page read again.
    private func act(_ call: @escaping @Sendable (TaskBoard) throws -> Void) async {
        let board = board
        do {
            try await Task.detached { try call(board) }.value
        } catch {
            model?.problem(error)
        }
        await read()
    }

    /// A call that writes the tasks file: the board and the page read again.
    private func write(_ call: @escaping @Sendable (TaskBoard) throws -> Void) async {
        let board = board
        do {
            try await Task.detached { try call(board) }.value
        } catch {
            model?.problem(error)
        }
        await model?.reload()
        await read()
    }
}
