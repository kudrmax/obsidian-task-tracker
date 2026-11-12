import Core
import SwiftUI
import UIKit

/// The projects' panel and the By project view: the tree's rows (`FunnelView.panel`) and the chosen node's list
/// (`projectsScreen(node)`) with its cards as the view draws them, each a call through the door (`docs/door.md`,
/// «Projects», «Projects as one view with the funnel»). Nothing is decided here: what is chosen, folded, waiting, where a
/// card or the plus goes, is the core's answer; this only turns taps and drops into its calls and reads the screen again.
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
    /// The name asked: a project for the plus in the tree, a rename. A new project's answered or cancelled, the panel the
    /// naming kept out goes (`endProjectName`).
    var asking: Ask? {
        didSet {
            if asking == nil, case .project = oldValue { model?.session.endProjectName() }
        }
    }
    /// The project Delete project was chosen for, its question shown before anything is written.
    var deleting: ProjectMenu?

    struct Part: Identifiable {
        let section: ProjectsSection
        let cards: [BoardCard]
        var id: String { section.key }
    }

    enum Ask: Identifiable {
        case project(JSONValue)
        case rename(String)

        var id: String {
            switch self {
            case .project: "project"
            case .rename(let name): "rename/" + name
            }
        }

        var title: String {
            switch self {
            case .project: String(localized: "New Project")
            case .rename: String(localized: "Rename Project")
            }
        }

        var action: String {
            switch self {
            case .project: String(localized: "Add")
            case .rename: String(localized: "Rename")
            }
        }
    }

    // MARK: Reading

    /// The tree's rows as the screen was read with them: what a tap, a drop and a gap read.
    var rows: [ProjectsRow] { model?.funnel?.panel?.rows ?? [] }

    /// What the list drawn was read for: the node, the file, and the view's context it was drawn in.
    private struct ReadKey: Equatable {
        let node: String?
        let file: String?
        let context: String
    }

    @ObservationIgnored private var drawnKey: ReadKey?
    @ObservationIgnored private var askedKey: ReadKey?
    /// The reads, one after another: the last asked is the one drawn, an earlier one that ends after it never is.
    @ObservationIgnored private var reads: Task<Void, Never>?
    @ObservationIgnored private var asks = 0

    /// The screen drawn now asks for the By project list (`FunnelPresentation.source`): read when the node, the file or
    /// the context differs from the one drawn. The one way the list is read.
    func follow() {
        guard let model, let snapshot = model.snapshot, case .projects(let node) = snapshot.presentation.source else { return }
        let key = ReadKey(node: node, file: snapshot.tasksText, context: snapshot.funnel.view.context)
        guard key != drawnKey, key != askedKey else { return }
        askedKey = key
        Task { await read(key) }
    }

    /// The By project list read again over the files as they are now, whatever the file was when it was asked.
    func read() async {
        guard let model, let snapshot = model.snapshot, case .projects(let node) = snapshot.presentation.source else { return }
        await read(ReadKey(node: node, file: snapshot.tasksText, context: snapshot.funnel.view.context))
    }

    private func read(_ key: ReadKey) async {
        asks += 1
        let ask = asks
        let before = reads
        let mine = Task { [weak self] in
            await before?.value
            guard let self, ask == self.asks, let model = self.model,
                  let read = await Self.fetch(self.board, screen: model.menuScreen, node: key.node), ask == self.asks else { return }
            // Another node or mode drawn still, in place; the same one moving as its cards did.
            let moves = self.drawnKey?.node == key.node && self.drawnKey?.context == key.context
            var transaction = moves ? Transaction(animation: .snappy) : Transaction()
            transaction.disablesAnimations = !moves
            withTransaction(transaction) {
                self.draw(read)
                model.entry.screenChanged()
            }
            self.drawnKey = key
            if self.askedKey == key { self.askedKey = nil }
        }
        reads = mine
        await mine.value
    }

    /// The page as read once: the view, its parts' rows painted, their menus, and the list as the quick entry reads it.
    struct Read: Sendable {
        let view: ProjectsView
        let rows: [[BoardCard]]
        let menus: [String: TaskMenuModel]
        let entryLook: ProjectsEntryLook
    }

    /// The page read off the main thread; nil when the files cannot be read.
    static func fetch(_ board: TaskBoard, screen: JSONValue, node: String?) async -> Read? {
        try? await Task.detached(operation: { () throws -> Read in
            let view = try board.projectsScreen(node: node)
            var drawn: [[BoardCard]] = []
            var menus: [String: TaskMenuModel] = [:]
            for section in view.sections {
                let painted = try board.cards(section.rows.map { ListRow(item: $0.item, level: $0.level) })
                drawn.append(zip(section.rows, painted).map { Self.card($0.1, as: $0.0) })
                for row in section.rows {
                    let from = row.card?.menuFrom ?? "list"
                    if menus[row.item.id] == nil {
                        menus[row.item.id] = try board.read("tasks.menu", [row.item.json, .string(from), screen], over: board.settingsOnly())
                    }
                }
            }
            return Read(view: view, rows: drawn, menus: menus, entryLook: try board.projectsEntryLook(view))
        }).value
    }

    /// A read drawn, in the transaction the caller draws it in (the quick entry's line ending with its card).
    func draw(_ read: Read) {
        menus = read.menus
        cards = Dictionary(read.view.sections.flatMap(\.cards).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        entryLook = read.entryLook
        view = read.view
        parts = zip(read.view.sections, read.rows).map { Part(section: $0.0, cards: $0.1) }
    }

    /// The list as the quick entry reads it (`rules.projectsEntryLook`): handed in as its `projects` list.
    @ObservationIgnored private(set) var entryLook = ProjectsEntryLook.empty

    /// A card of the By project list: the stage's symbol, or the date, in the date's place.
    nonisolated private static func card(_ painted: BoardCard, as row: ProjectsListRow) -> BoardCard {
        guard let card = row.card else {
            return BoardCard(item: painted.item, level: painted.level, branch: painted.branch, due: painted.due, repeats: painted.repeats, paint: painted.paint, parts: painted.parts, face: painted.face, id: row.id)
        }
        var due = painted.due
        var stage: String?
        if let mark = card.stage {
            if let label = mark.label { due = label } else { due = nil; stage = symbol(mark.kind) }
        }
        return BoardCard(item: painted.item, level: 0, branch: nil, due: due, repeats: painted.repeats, paint: painted.paint, parts: painted.parts, face: painted.face, stage: stage, id: card.id)
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

    /// A tap on a row: chosen (the panel then closes), or, chosen already, its branch folds or unfolds.
    func tap(_ row: ProjectsRow) async {
        await model?.funnelState.pick(row.node)
    }

    /// The panel row under `point` (window), as last laid out: what the carry reports to the core.
    func node(at point: CGPoint) -> String? {
        rows.first { geometry.rows[$0.node]?.contains(point) == true }?.node
    }

    /// A project lifted and let go in a gap.
    func move(_ name: String, to place: JSONValue) async {
        await write { try $0.moveProject(name, to: place) }
    }

    /// The name typed for what was asked: a project of the gap, a rename; Cancel (nil) writes nothing.
    func answer(_ name: String?, to ask: Ask) async {
        guard let name, !isBlank(name, for: ask) else { return }
        switch ask {
        case .project(let place):
            await write { _ = try $0.createProject(name, at: place) }
        case .rename(let from):
            await write { _ = try $0.renameProject(from, to: name) }
        }
    }

    /// A name that writes nothing, as the core says: the alert's Add is off for it.
    func isBlank(_ name: String, for ask: Ask) -> Bool {
        board.isBlankProjectName(name)
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
        guard let panel = model?.funnel?.panel else { return nil }
        return try? board.projectsDrop(panel.rowsJSON, gap: gap, shift: shift, lifted: lifted)
    }

    // MARK: Calls

    /// A call that writes the tasks file: the board and the page read again.
    private func write(_ call: @escaping @Sendable (TaskBoard) throws -> Void) async {
        let board = board
        do {
            try await Task.detached { try call(board) }.value
        } catch {
            model?.problem(error)
        }
        await model?.reload()
    }
}
