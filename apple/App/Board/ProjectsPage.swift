import Core
import SwiftUI
import UIKit

/// The name field of what the Projects page asks: a task typed for the plus, a new project, a rename.
struct NameField: View {
    let ask: ProjectsBoard.Ask
    let board: ProjectsBoard
    @State private var name = ""

    var body: some View {
        TextField("Name", text: $name)
            .onAppear { if case .rename(let from) = ask { name = from } }
        Button("Cancel", role: .cancel) {}
        Button(ask.action) {
            let typed = name
            Task { await board.answer(typed, to: ask) }
        }
        .disabled(board.isBlank(name, for: ask))
    }
}

// MARK: The tree

/// The tree, variant В: a project at the top a tile the column's width, a subproject a line of text a step further in per
/// level with a thin line on its left; All over them, No project and Done under them. The chosen row is filled light.
struct ProjectTree: View {
    @Bindable var model: BoardModel
    @Environment(\.colorScheme) private var scheme

    private var projects: ProjectsBoard { model.projects }

    var body: some View {
        let rows = projects.rows
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    TreeRow(row: row, lit: projects.dropOn == row.node)
                        // Lifted, the project's own row stays as its faded place while its copy is carried.
                        .opacity(model.carried == row.node ? 0.4 : 1)
                        .padding(.top, TreeMetrics.gap(before: row, after: index > 0 ? rows[index - 1] : nil))
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.projects.geometry.rows[row.node] = $0 }
                        .onTapGesture { Task { await model.projects.tap(row) } }
                }
            }
            .padding(.horizontal, TreeMetrics.inset)
            .padding(.bottom, TreeMetrics.inset)
            .background { TreeProbe(model: model) }
        }
        .scrollIndicators(.hidden)
    }
}

/// The tree's measures, the boards': a tile 38 tall, a line 30, each level 12 further in, the branch's line in the middle
/// of that step.
enum TreeMetrics {
    static let inset: CGFloat = 10
    static let tile: CGFloat = 38
    static let line: CGFloat = 30
    static let indent: CGFloat = 12
    static let tileRadius: CGFloat = 10
    static let lineRadius: CGFloat = 8

    /// The room over a row: tiles 8 apart, a branch's lines touching, 2 under its tile and 6 over the next tile, No
    /// project set apart from the projects.
    static func gap(before row: ProjectsRow, after previous: ProjectsRow?) -> CGFloat {
        guard let previous else { return 0 }
        let apart: CGFloat = row.kind == "none" ? 8 : 0
        switch (previous.tile, row.tile) {
        case (true, true): return 8 + apart
        case (true, false): return 2
        case (false, false): return 0
        case (false, true): return 6 + apart
        }
    }
}

/// A row of the tree.
private struct TreeRow: View {
    let row: ProjectsRow
    /// A carried card would be let go on it: filled in the drop's colour.
    let lit: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 4) {
            // The name never widens the row: it runs on past the room and fades out, as a card's title.
            Color.clear
                .frame(maxWidth: .infinity, minHeight: 20, maxHeight: 20)
                .overlay(alignment: .leading) {
                    Text(verbatim: row.title)
                        .font(.system(size: row.tile ? 15 : 14, weight: row.tile ? .semibold : .regular))
                        .lineLimit(1)
                        .fixedSize()
                }
                .mask(Fade())
            if row.folded, !row.tile {
                Text(verbatim: "…").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.muted)
            }
        }
        .foregroundStyle(ink)
        .padding(.horizontal, row.tile ? 12 : 8)
        .frame(height: row.tile ? TreeMetrics.tile : TreeMetrics.line)
        .background { ground }
        .background(alignment: .bottom) {
            // A folded branch: a layer peeking out under the tile, as under a folded card.
            if row.tile, row.folded {
                RoundedRectangle(cornerRadius: TreeMetrics.tileRadius)
                    .fill(Palette.card(scheme).opacity(0.55))
                    .padding(.horizontal, 7)
                    .offset(y: 6)
            }
        }
        .padding(.leading, CGFloat(row.depth) * TreeMetrics.indent)
        .background(alignment: .leading) { branches }
        .padding(.bottom, row.tile && row.folded ? 6 : 0)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(row.selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityValue(row.folded ? "Collapsed" : row.waiting ? "No open tasks" : "")
    }

    private var ink: Color {
        if lit { return Palette.accent(scheme) }
        if row.selected { return scheme == .dark ? .black : .white }
        return row.muted ? Palette.muted : .primary
    }

    @ViewBuilder private var ground: some View {
        let shape = RoundedRectangle(cornerRadius: row.tile ? TreeMetrics.tileRadius : TreeMetrics.lineRadius)
        if lit {
            shape.fill(Palette.dropBg(scheme))
        } else if row.selected {
            shape.fill(Palette.strong(scheme))
        } else if row.tile {
            shape.fill(Palette.card(scheme))
        }
    }

    /// The thin line left of a subproject for each level it stands under, in the middle of that level's step.
    private var branches: some View {
        ZStack(alignment: .leading) {
            ForEach(0..<max(0, row.depth), id: \.self) { level in
                Rectangle()
                    .fill(Palette.branch(scheme))
                    .frame(width: 1.5)
                    .offset(x: CGFloat(level) * TreeMetrics.indent + TreeMetrics.indent / 2 - 0.75)
            }
        }
        .frame(height: row.tile ? 0 : TreeMetrics.line)
    }

}

/// A line that runs past its room fades out over its last points, as a card's title.
private struct Fade: View {
    var body: some View {
        HStack(spacing: 0) {
            Color.black
            LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing).frame(width: 24)
        }
    }
}

// MARK: The tasks

/// The By project view's list (board `T7`): the filter's node's tasks in its subprojects' parts, each card marked with
/// where it stands in the funnel.
struct ProjectTasks: View {
    @Bindable var model: BoardModel
    @Environment(\.colorScheme) private var scheme

    private var projects: ProjectsBoard { model.projects }

    var body: some View {
        // Only the list read for the view drawn: another node's list is never shown under this one's title.
        let view = projects.shownContext == model.snapshot?.funnel.view.context ? projects.view : nil
        VStack(alignment: .leading, spacing: 0) {
            if let view, !view.missing {
                ScrollViewReader { scroller in
                    ScrollView(.vertical) {
                        let entry = model.entry.lists[QuickEntryHost.projects]
                        let at = entry.map { PartedEntryAt(kind: $0.at.kind, section: $0.at.section, card: $0.at.card, rows: projects.parts.map(\.cards.count)) }
                        VStack(alignment: .leading, spacing: CardMetrics.gap) {
                            if at == .top, let entry { typed(entry) }
                            ForEach(Array(projects.parts.enumerated()), id: \.element.id) { index, part in
                                if part.section.header, let title = part.section.title {
                                    Color.clear
                                        .frame(maxWidth: .infinity, minHeight: ColumnMetrics.groupLeading, maxHeight: ColumnMetrics.groupLeading)
                                        .overlay(alignment: .leading) {
                                            Text(verbatim: title)
                                                .font(.system(size: ColumnMetrics.groupName, weight: .semibold))
                                                .foregroundStyle(Palette.pullInk(scheme))
                                                .lineLimit(1)
                                                .fixedSize()
                                        }
                                        .mask(Fade())
                                        .frame(maxWidth: .infinity, minHeight: ColumnMetrics.groupHead, alignment: .bottomLeading)
                                        .padding(.leading, CardMetrics.leading)
                                        .padding(.top, projects.drawsAnything(before: index) ? ColumnMetrics.sectionGap : 0)
                                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.projects.geometry.parts[part.id] = $0 }
                                }
                                let here: Int? = if case .part(index, let row) = at { row } else { nil }
                                ForEach(rows(of: part, entry: here.flatMap { row in entry.map { ($0, row) } })) { row in
                                    switch row {
                                    case .card(let card, _):
                                        ProjectCard(card: card, model: model)
                                            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.projects.geometry.cards[part.id + "/" + card.id] = $0 }
                                    case .pending(_, let text, let level, let branch):
                                        EntryRow(level: level, branch: branch) { PendingCapsule(text: text) }
                                    case .field(_, let level, let branch):
                                        EntryRow(level: level, branch: branch) { EntryCapsule(host: model.entry) }
                                    }
                                }
                                if part.section.plate, here == nil || entry?.at.keepsPlate == true {
                                    EmptyPlate(open: part.section.newTask.map { _ in { model.entry.openIn(QuickEntryHost.projects, part.section.group) } }, label: view.emptyLabel)
                                }
                            }
                            if at == .end, let entry { typed(entry) }
                            if projects.parts.isEmpty {
                                EmptyPlate(label: view.emptyLabel)
                            }
                        }
                        .padding(.horizontal, CardMetrics.columnInset)
                        .padding(.bottom, 120)
                        .background { TasksProbe(model: model) }
                    }
                    .keyboardRoom()
                    .onChange(of: model.entry.moved) {
                        guard let id = fieldId else { return }
                        withAnimation(.snappy) { scroller.scrollTo(id) }
                    }
                    .scrollIndicators(.hidden)
                }
            }
        }
    }

    /// A row of a part: a card, a text typed and waiting to be written, or the quick entry's field.
    enum PartRow: Identifiable {
        /// `key`: the card's own id, or the typed line's it was written from (`QuickEntryHost.heirs`): the text becomes the
        /// card in place.
        case card(BoardCard, key: String)
        case pending(key: String, text: String, level: Int, branch: Branch?)
        case field(id: String, level: Int, branch: Branch?)

        var id: String {
            switch self {
            case .card(_, let key): key
            case .pending(let key, _, _, _): key
            case .field(let id, _, _): id
            }
        }

        var level: Int {
            switch self {
            case .card(let card, _): card.level
            case .pending(_, _, let level, _), .field(_, let level, _): level
            }
        }
    }

    /// The field's row id, where it stands in this list.
    private var fieldId: String? {
        guard model.entry.lists[QuickEntryHost.projects] != nil else { return nil }
        return model.entry.state?.renaming?.id ?? model.entry.lineKeys[QuickEntryHost.projects]?.last
    }

    /// The typed rows (the texts waiting and the field) as the list draws them, at the field's level.
    private func typedRows(_ entry: ListEntryView) -> [PartRow] {
        let keys = model.entry.lineKeys[QuickEntryHost.projects] ?? []
        let level = entry.place.level
        var rows: [PartRow] = entry.pending.enumerated().map { .pending(key: keys[safe: $0.offset] ?? "\u{0}line/\($0.offset)", text: $0.element.text, level: $0.element.level, branch: nil) }
        rows.append(.field(id: model.entry.state?.renaming?.id ?? keys.last ?? "\u{0}field", level: level, branch: nil))
        return rows
    }

    /// The typed rows standing alone, before or after every part.
    @ViewBuilder
    private func typed(_ entry: ListEntryView) -> some View {
        ForEach(typedRows(entry)) { row in
            switch row {
            case .pending(_, let text, let level, _): EntryRow(level: level, branch: nil) { PendingCapsule(text: text) }
            case .field(_, let level, _): EntryRow(level: level, branch: nil) { EntryCapsule(host: model.entry) }
            case .card: EmptyView()
            }
        }
    }

    /// A part's rows: its cards, the renamed task's card giving its place to the field (in every part that shows it), and
    /// the typed rows at `entry`'s row; the branch lines drawn anew over the levels as they then stand, as a list's.
    private func rows(of part: ProjectsBoard.Part, entry: (ListEntryView, Int)?) -> [PartRow] {
        let heirs = model.entry.heirs
        var rows = part.cards.map { PartRow.card($0, key: heirs[$0.item.id] ?? $0.id) }
        guard let (entry, at) = entry else { return rows }
        let renaming = model.entry.state?.renaming?.id
        rows.insert(contentsOf: typedRows(entry), at: min(at, rows.count))
        rows = rows.filter { if case .card(let card, _) = $0 { card.item.id != renaming } else { true } }
        let levels = rows.map(\.level)
        let branches = model.branches(levels: levels)
        return rows.enumerated().map { index, row in
            let branch = levels[index] > 0 ? branches[safe: index] ?? nil : nil
            switch row {
            case .card(let card, let key) where card.branch != branch:
                return .card(BoardCard(item: card.item, level: card.level, branch: branch, due: card.due, repeats: card.repeats, paint: card.paint, corner: card.corner, parts: card.parts, face: card.face, stage: card.stage, id: card.id), key: key)
            case .pending(let key, let text, let level, _): return .pending(key: key, text: text, level: level, branch: branch)
            case .field(let id, let level, _): return .field(id: id, level: level, branch: branch)
            default: return row
            }
        }
    }
}

/// Folder in the project menu, a stock switch next to Rename: on for a folder; while the core can't turn it on (the
/// project has tasks of its own) it is drawn disabled with the core's reason under its label.
struct FolderToggle: View {
    let menu: ProjectMenu
    let projects: ProjectsBoard

    var body: some View {
        let name = menu.project.name
        Toggle(isOn: Binding(get: { menu.folder.on }, set: { on in Task { await projects.setFolder(name, on) } })) {
            Label(menu.folder.label, systemImage: "folder")
            if let reason = menu.folder.reason { Text(reason) }
        }
        .disabled(menu.folder.disabled)
    }
}

/// A card of the Projects page: a list's card, its menu the task's; a long press lifts it to be let go on the tree.
private struct ProjectCard: View {
    let card: BoardCard
    @Bindable var model: BoardModel

    var body: some View {
        let mark = model.mark(card.id)
        CardButton(
            card: card,
            // Renames are kept by the task's id: a card here is drawn per part, its own id is not the task's.
            renamedText: model.entry.renamedTexts[card.face.step?.id ?? card.item.id],
            renamedOver: card.face.twoLines ? model.entry.renamedTexts[card.item.id] : nil,
            menu: { later in model.cardMenu(card, later: later) },
            draggable: model.projects.cards[card.id]?.canDrop == true,
            carried: mark.hidden,
            onCarry: { model.startCarry(card, from: "projects") },
            from: "projects",
            onFold: card.item.can.fold ? { Task { await model.toggleCollapsed(card.item) } } : nil,
            onLink: { model.openLink($0) })
            .frame(height: card.listHeight)
            .background { if mark.waiting { DashedPlace() } }
            .overlay(alignment: .topLeading) { if let branch = card.branch { BranchLine(branch: branch, card: card.listHeight) } }
            .padding(.leading, CGFloat(card.level) * CardMetrics.indent)
    }
}

// MARK: Carries

/// Where the page's rows stand, kept out of what the page observes: a scroll moves them without drawing anything anew.
final class ProjectsGeometry {
    var rows: [String: CGRect] = [:]
    var parts: [String: CGRect] = [:]
    var cards: [String: CGRect] = [:]
}

/// The tree as a place of the board's drag: a card held over a row lights it and let go there goes to that project; a
/// project lifted by a long press, or the plus, shows the line of the gap it would go into, a step further in the more
/// the finger moves right.
private struct TreeProbe: UIViewRepresentable {
    let model: BoardModel

    func makeUIView(context: Context) -> Probe {
        let probe = Probe()
        probe.isUserInteractionEnabled = false
        probe.target.model = model
        model.route.add(probe.target)
        return probe
    }

    func updateUIView(_ probe: Probe, context: Context) { probe.target.model = model }

    final class Probe: UIView {
        let target = TreeTarget()

        override func didMoveToWindow() {
            super.didMoveToWindow()
            var view = superview
            while let next = view, !(next is UIScrollView) { view = next.superview }
            target.attach(to: view as? UIScrollView)
        }
    }
}

@MainActor
final class TreeTarget: NSObject, BoardTarget, UIGestureRecognizerDelegate {
    weak var model: BoardModel?
    private weak var scroll: UIScrollView?
    private let press = UILongPressGestureRecognizer()
    private var pressed: ProjectsRow?
    /// The gap shown under a carried project or the plus: where it goes, and the row it was asked before.
    private var aimed: (landing: ProjectsLanding, gap: Int, line: CGPoint)?
    /// Where the finger lifted a project and how deep the project stood: its depth moves only by the finger's shift.
    private var liftedFrom: CGFloat?

    override init() {
        super.init()
        press.addTarget(self, action: #selector(pressed(_:)))
        press.delegate = self
        press.minimumPressDuration = CarryMotion.liftDelay
    }

    func attach(to scroll: UIScrollView?) {
        guard scroll !== self.scroll else { return }
        self.scroll?.removeGestureRecognizer(press)
        self.scroll = scroll
        scroll?.addGestureRecognizer(press)
    }

    private var projects: ProjectsBoard? { model?.projects }
    private var rows: [ProjectsRow] { projects?.rows ?? [] }

    private func row(at point: CGPoint) -> ProjectsRow? {
        rows.first { projects?.geometry.rows[$0.node]?.contains(point) == true }
    }

    // MARK: Lifting a project

    func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        guard recognizer === press, let model, model.drag.mayLift, !model.selecting else { return false }
        pressed = row(at: press.firstFinger).flatMap { $0.canLift ? $0 : nil }
        return pressed != nil
    }

    @objc private func pressed(_ press: UILongPressGestureRecognizer) {
        guard let model else { return }
        let point = press.firstFinger
        switch press.state {
        case .began:
            guard let row = pressed, let window = scroll?.window, let frame = projects?.geometry.rows[row.node], let lift = lift(row, frame: frame, in: window) else { return }
            liftedFrom = point.x
            model.drag.lift(lift, at: point, in: window)
        case .changed:
            model.drag.move(to: point)
        case .ended:
            model.drag.letGo(at: point)
        case .cancelled, .failed:
            model.drag.cancel()
        default:
            break
        }
    }

    private func lift(_ row: ProjectsRow, frame: CGRect, in window: UIWindow) -> Lift? {
        guard let model else { return nil }
        let copy = ListController.image(of: window, in: frame)
        let payload = DragPayload(.project(row), from: "tree")
        payload.home = frame
        return Lift(payload: payload, copy: copy, frame: frame, begin: { model.startTreeCarry(row) }) { frame }
    }

    // MARK: A place of the board's drag

    var area: CGRect? { scroll.flatMap { view in view.window.map { view.convert(view.bounds, to: $0).intersection($0.bounds) } } }

    var scrolls: UIScrollView? { scroll }

    /// The panel lies over the lists: a carry inside it is the tree's, before the list under it.
    var priority: Int { 1 }

    /// A card rides above the finger, the row lit under it seen; a lifted project below it, its line and the row above
    /// the line seen. The plus stands aside of the finger already.
    func ride(_ payload: DragPayload?) -> CopyRide {
        switch payload?.kind {
        case .card: .above
        case .project: .below
        default: .held
        }
    }

    /// While the panel shows: a card of the funnel or the calendar (a subtask's goes as its task's), one of the By project
    /// list where it may go to a project (`canDrop`); a project lifted here; the plus.
    func takes(_ payload: DragPayload?) -> Bool {
        guard model?.panelShown == true else { return false }
        guard let payload else { return model?.funnel?.plus.tree == true }
        switch payload.kind {
        case .card(let card): return projects?.cards[card.id].map(\.canDrop) ?? true
        case .project: return true
        case .section: return false
        }
    }

    func hover(at point: CGPoint, carrying payload: DragPayload?) {
        guard let projects, let model else { return }
        if let payload, case .card = payload.kind {
            model.drag.hideLine()
            let under = row(at: point)
            let over = under.flatMap { $0.acceptsTask ? $0.node : nil }
            if projects.dropOn != over { projects.dropOn = over }
            return
        }
        aim(at: point, lifted: payload.flatMap { if case .project(let row) = $0.kind { row.node } else { nil } })
    }

    /// The gap under the finger and the depth its shift right gives, the line drawn there.
    private func aim(at point: CGPoint, lifted: String?) {
        guard let projects, let model, let area else { return }
        let framed = rows.compactMap { row in projects.geometry.rows[row.node].map { (row, $0) } }
        // Projects go only among the projects: from before the first one to before No project, never above All or among
        // Done's rows.
        let none = framed.firstIndex { $0.0.kind == "none" } ?? framed.count
        let first = framed.firstIndex { $0.0.kind == "project" } ?? none
        let gap = min(max(framed.firstIndex { point.y < $0.1.midY } ?? framed.count, min(first, none)), none)
        let left = area.minX + TreeMetrics.inset
        let indent = CGFloat(projects.measures.indent)
        // A lifted project keeps its depth until the finger shifts; the plus takes the depth the finger stands at, the
        // core counting it from the row above the gap's.
        let shift: CGFloat
        if lifted != nil, let from = liftedFrom {
            shift = point.x - from
        } else {
            let above = gap > 0 ? CGFloat(framed[gap - 1].0.depth) : 0
            shift = point.x - left - above * indent
        }
        guard let landing = projects.landing(gap: gap, shift: Double(shift), lifted: lifted) else {
            aimed = nil
            return model.drag.hideLine()
        }
        let above = gap > 0 ? framed[gap - 1].1.maxY : framed.first?.1.minY ?? area.minY
        let below = gap < framed.count ? framed[gap].1.minY : above + 4
        let y = gap == 0 ? (framed.first?.1.minY ?? area.minY) - 2 : (above + below) / 2
        let start = CGPoint(x: left + CGFloat(landing.depth) * indent, y: y)
        aimed = (landing, gap, start)
        model.drag.showLine(from: start, to: area.maxX - TreeMetrics.inset)
    }

    func leave() {
        if model?.carrying != true { liftedFrom = nil }
        projects?.dropOn = nil
        aimed = nil
        model?.drag.hideLine()
    }

    func letGo(carrying payload: DragPayload?) -> CarryLanding? {
        guard let projects, model != nil else { return nil }
        defer { leave() }
        switch payload?.kind {
        case .card:
            guard let node = projects.dropOn, let frame = projects.geometry.rows[node] else { return nil }
            model?.carryOnNode(node)
            return CarryLanding(rect: frame, folds: true)
        case .project(let row):
            guard let aimed, let name = row.project?.name else { return nil }
            let rect = lineRect
            Task { await projects.move(name, to: aimed.landing.place) }
            return CarryLanding(rect: rect, folds: true)
        case .section:
            return nil
        case nil:
            guard let aimed else { return nil }
            let rect = lineRect
            model?.session.naming()
            projects.asking = .project(aimed.landing.place)
            return CarryLanding(rect: rect, folds: true)
        }
    }

    /// Where the line stands, as a small box at its dot the copy shrinks into.
    private var lineRect: CGRect {
        guard let line = aimed?.line else { return .null }
        return CGRect(x: line.x, y: line.y - 4, width: 8, height: 8)
    }
}

/// The tasks as a place of the board's drag: the plus let go there types a task of the part it is let go in.
private struct TasksProbe: UIViewRepresentable {
    let model: BoardModel

    func makeUIView(context: Context) -> Probe {
        let probe = Probe()
        probe.isUserInteractionEnabled = false
        probe.target.model = model
        model.route.add(probe.target)
        return probe
    }

    func updateUIView(_ probe: Probe, context: Context) { probe.target.model = model }

    final class Probe: UIView {
        let target = TasksTarget()

        override func didMoveToWindow() {
            super.didMoveToWindow()
            var view = superview
            while let next = view, !(next is UIScrollView) { view = next.superview }
            target.attach(to: view as? UIScrollView)
        }
    }
}

@MainActor
final class TasksTarget: NSObject, BoardTarget, UIGestureRecognizerDelegate {
    weak var model: BoardModel?
    private weak var scroll: UIScrollView?
    /// The long press that lifts a card, on the tasks' scroll view, as the calendar's lifts a block.
    private let press = UILongPressGestureRecognizer()
    private weak var pressed: CardControl?

    override init() {
        super.init()
        press.addTarget(self, action: #selector(pressed(_:)))
        press.delegate = self
        press.minimumPressDuration = CarryMotion.liftDelay
    }

    func attach(to scroll: UIScrollView?) {
        guard scroll !== self.scroll else { return }
        self.scroll?.removeGestureRecognizer(press)
        self.scroll = scroll
        scroll?.addGestureRecognizer(press)
    }

    func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        guard recognizer === press else { return true }
        pressed = nil
        guard let scroll, let model else { return false }
        var view = scroll.hitTest(press.location(in: scroll), with: nil)
        while let next = view, !(next is CardControl), next !== scroll { view = next.superview }
        guard let control = view as? CardControl, control.draggable, let card = control.look?.card, model.mayLift(card, from: control.from) else { return false }
        pressed = control
        return true
    }

    @objc private func pressed(_ press: UILongPressGestureRecognizer) {
        guard let drag = model?.drag else { return }
        let point = press.firstFinger
        switch press.state {
        case .began:
            guard let control = pressed, let window = scroll?.window, let lift = control.lift(finger: point, in: window) else { return }
            drag.lift(lift, at: point, in: window)
        case .changed:
            drag.move(to: point)
        case .ended:
            drag.letGo(at: point)
        case .cancelled, .failed:
            drag.cancel()
        default:
            break
        }
    }

    var area: CGRect? { scroll.flatMap { view in view.window.map { view.convert(view.bounds, to: $0).intersection($0.bounds) } } }

    var scrolls: UIScrollView? { scroll }

    /// The plus, and a card of this list carried among its parts (moved, or into another part, as the core's
    /// `dropInProjects` writes it, as the plugin's).
    func takes(_ payload: DragPayload?) -> Bool {
        guard model?.presentation?.plusList == .projects else { return false }
        guard let payload else { return true }
        if case .card = payload.kind { return payload.from == "projects" }
        return false
    }

    /// Where a carried card would go: the list's place (`rules.placeOfDrop`), the line's start; nil where it stays.
    private var cardAim: (place: JSONValue, line: CGPoint)?

    /// The card under the finger among the parts' cards, the carried one left out, as a list places a card: the gap by
    /// the core's `placeAt` over the cards and the parts' headers where they stand, the level by the finger's `x`.
    private func aimCard(_ card: BoardCard, at point: CGPoint) {
        guard let model, let area else { return clearCard() }
        let projects = model.projects
        let geometry = projects.geometry
        var placed: [JSONValue] = [], listed: [JSONValue] = [], heads: [JSONValue] = [], frames: [CGRect] = []
        var home: JSONValue = .null
        for part in projects.parts {
            if part.section.header, let head = geometry.parts[part.id] {
                heads.append(["group": part.section.group.json, "firstCard": .number(Double(placed.count)), "top": .number(Double(head.minY)), "height": .number(Double(head.height))])
            }
            for other in part.cards {
                if other.id == card.id {
                    home = ["kind": "gap", "index": .number(Double(placed.count)), "level": .number(Double(other.level)), "group": part.section.group.json]
                    continue
                }
                guard let frame = geometry.cards[part.id + "/" + other.id] else { continue }
                placed.append(["level": .number(Double(other.level)), "group": part.section.group.json, "top": .number(Double(frame.minY)), "height": .number(Double(frame.height))])
                listed.append(["id": .string(other.item.id), "key": other.item.key.json, "level": .number(Double(other.level)), "group": part.section.group.json])
                frames.append(frame)
            }
        }
        let inset = Double(CardMetrics.columnInset)
        let level: Double = model.ruleNow("rules.levelAt", [.number(Double(point.x)), ["left": .number(Double(area.minX) + inset), "width": .number(Double(area.width) - 2 * inset)], .number(Double(CardMetrics.indent))]) ?? 0
        guard let gap: JSONValue = model.ruleNow("rules.placeAt", [.array(placed), .number(Double(point.y)), .number(level), .number(0), .null, .array(heads), home, .number(CardMetrics.dropHysteresis)]),
              let place: JSONValue = model.ruleNow("rules.placeOfDrop", [.array(listed), gap, home]), !place.isNull,
              let drop = projects.cards[card.id]?.drop,
              // Where the core takes no drop (a folder's own part, a stage that refuses the card) no line shows.
              model.ruleNow("rules.projectsTakes", [projects.raw, [drop], place]) == true,
              let index = gap["index"].number.map(Int.init) else { return clearCard() }
        let y = index < frames.count ? frames[index].minY - CardMetrics.gap / 2 : (frames.last?.maxY ?? area.minY) + CardMetrics.gap / 2
        let x = area.minX + CardMetrics.columnInset + CGFloat(gap["level"].number ?? 0) * CardMetrics.indent
        cardAim = (place, CGPoint(x: x, y: y))
        model.drag.showLine(from: CGPoint(x: x, y: y), to: area.maxX - CardMetrics.columnInset)
    }

    private func clearCard() {
        cardAim = nil
        model?.drag.hideLine()
    }

    /// A card let go where its line stood: written by the core (`tasks.dropInProjects`), the copy folding into the line;
    /// where the core takes no drop there (a stage that refuses it) nothing is written and the list stays.
    private func dropCard(_ card: BoardCard) -> CarryLanding? {
        defer { clearCard() }
        guard let model, let aim = cardAim, let drop = model.projects.cards[card.id]?.drop else { return nil }
        // No filter is By project's every task: the core's node for it is All (the plugin passes it so too).
        let node = model.filter?.node ?? "all"
        model.writeDrop("tasks.dropInProjects", [.array([drop]), aim.place, .string(node)])
        return CarryLanding(rect: CGRect(x: aim.line.x, y: aim.line.y - 4, width: 8, height: 8), folds: true)
    }

    /// Where the plus is held: the part let go in is read from it.
    private var held: CGPoint?

    /// The plus held over the tasks shows the drop line where the task will go, as the plugin's: after the last card of
    /// the part under the finger (the last whose header or card stands above it), or over the first part above them all.
    func hover(at point: CGPoint, carrying payload: DragPayload?) {
        if let payload, case .card(let card) = payload.kind { return aimCard(card, at: point) }
        held = point
        let aimed = target(at: point.y)
        guard let model, let area, let line = aimed.line, newTask(in: aimed.part) != nil else { return model?.drag.hideLine() ?? () }
        model.drag.showLine(from: CGPoint(x: area.minX + CardMetrics.columnInset, y: line), to: area.maxX - CardMetrics.columnInset)
    }

    func leave() {
        held = nil
        clearCard()
    }

    /// The part a let-go at `y` (window) writes into, and where its line stands.
    private func target(at y: CGFloat) -> (part: ProjectsBoard.Part?, line: CGFloat?) {
        guard let projects = model?.projects else { return (nil, nil) }
        let geometry = projects.geometry
        var found: (part: ProjectsBoard.Part, bottom: CGFloat)?
        var firstTop: CGFloat?
        for candidate in projects.parts {
            let frames = ([geometry.parts[candidate.id]] + candidate.cards.map { geometry.cards[candidate.id + "/" + $0.id] }).compactMap { $0 }
            guard let top = frames.map(\.minY).min(), let bottom = frames.map(\.maxY).max() else { continue }
            if firstTop == nil { firstTop = top }
            if top <= y { found = (candidate, bottom) }
        }
        if let found { return (found.part, found.bottom + CardMetrics.gap / 2) }
        return (nil, firstTop.map { $0 - CardMetrics.gap / 2 } ?? area.map { $0.minY + 4 })
    }

    /// What the plus let go in `part` writes, the core's: the part's own when one is aimed at, the list's only above them
    /// all; nil where it writes nothing (a folder's tasks, Done), and then no line is shown either.
    private func newTask(in part: ProjectsBoard.Part?) -> ProjectsNewTask? {
        guard let part else { return model?.projects.view?.newTask }
        return part.section.newTask
    }

    /// The part let go in, as the line showed it: the field at its end; above them all, before the first part's first
    /// card. Where the plus writes nothing (a folder's tasks, Done) it takes nothing.
    func letGo(carrying payload: DragPayload?) -> CarryLanding? {
        if let payload, case .card(let card) = payload.kind { return dropCard(card) }
        guard payload == nil, let model, let first = model.projects.parts.first else { return nil }
        let at = held
        let found = target(at: at?.y ?? 0).part
        held = nil
        model.drag.hideLine()
        let part = found ?? first
        guard newTask(in: found) != nil, part.section.newTask != nil else { return nil }
        let before = found == nil ? part.section.cards.first?.item.key.json ?? .null : .null
        model.entry.openAt(QuickEntryHost.projects, ["kind": "task", "group": part.section.group.json, "before": before])
        return CarryLanding(rect: at.map { CGRect(x: $0.x - 4, y: $0.y - 4, width: 8, height: 8) } ?? .null, folds: true)
    }
}
