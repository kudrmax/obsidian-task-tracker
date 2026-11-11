import Core
import SwiftUI
import UIKit

/// The Projects page, the ribbon's place left of Inbox (boards `projects-screen/`, the tree variant В): the whole tree on
/// the left, the chosen node's tasks on the right, the divider between them as between Today and the calendar. A tap on a
/// row chooses it, again folds its branch; the segment groups the tasks By project or By stage; a card carried onto a row
/// goes to that project, a project lifted in the tree reorders or nests; the plus let go on the tasks types a task of the
/// part, in the tree a project of the gap. Everything is the core's answer (`ProjectsBoard`).
struct ProjectsPage: View {
    @Bindable var model: BoardModel
    @AppStorage("projectsTreeShare") private var share: Double = 0.5
    @State private var dragStart: CGFloat?

    private var projects: ProjectsBoard { model.projects }

    var body: some View {
        GeometryReader { box in
            let width = box.size.width
            let tree = treeWidth(width)
            HStack(alignment: .top, spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    ColumnTitle(title: String(localized: "Projects"), model: model)
                        .padding(.bottom, ColumnMetrics.headGap)
                    ProjectTree(model: model)
                }
                .frame(width: tree)
                .frame(maxHeight: .infinity, alignment: .top)
                Color.clear.frame(width: 0)
                    .overlay { divider(width) }
                ProjectTasks(model: model)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
        .task(id: ReadKey(file: model.snapshot?.tasksText, shown: model.place == .projects)) {
            guard model.place == .projects || projects.view == nil else { return }
            await projects.read()
        }
        .alert(projects.asking?.title ?? "", isPresented: Binding(get: { projects.asking != nil }, set: { if !$0 { projects.asking = nil } }), presenting: projects.asking) { ask in
            NameField(ask: ask, board: projects)
        }
    }

    private struct ReadKey: Equatable {
        let file: String?
        let shown: Bool
    }

    /// The tree's width for its saved share, within the bounds the core gives a list beside the calendar.
    private func treeWidth(_ width: CGFloat) -> CGFloat {
        model.listWidths(share: share, viewWidth: width).map { CGFloat($0.width) } ?? width / 2
    }

    /// The line between the tree and the tasks, and its handle, which drags the tree wider or narrower as Today's divider.
    private func divider(_ width: CGFloat) -> some View {
        ZStack {
            Rectangle().fill(Color(.separator)).frame(width: 1 / UIScreen.main.scale)
                .padding(.top, ColumnMetrics.titleRow + ColumnMetrics.headGap)
            Capsule()
                .fill(Color(.tertiaryLabel))
                .frame(width: 5, height: 36)
                .frame(width: 28)
                .frame(maxHeight: .infinity)
                .contentShape(.rect)
                .gesture(
                    DragGesture(minimumDistance: 2, coordinateSpace: .global)
                        .onChanged { drag in
                            let start = dragStart ?? treeWidth(width)
                            if dragStart == nil { dragStart = start }
                            guard let bounds = model.listWidths(share: share, viewWidth: width),
                                  let stop = model.dividerAt(start + drag.translation.width, widths: bounds, speed: Double(abs(drag.velocity.width)) / 1000) else { return }
                            share = model.listShare(of: CGFloat(stop.width), viewWidth: width) ?? share
                        }
                        .onEnded { _ in dragStart = nil }
                )
                .sensoryFeedback(.selection, trigger: dragStart == nil)
                .accessibilityLabel("Divider")
                .accessibilityHint("Drag to make the projects wider or narrower")
        }
        .frame(width: 28)
    }
}

/// The name field of what the Projects page asks: a task typed for the plus, a new project, a rename.
private struct NameField: View {
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
        let rows = projects.view?.rows ?? []
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
            .padding(.bottom, 120)
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
        .accessibilityValue(row.folded ? "Collapsed" : row.waiting ? "Waiting" : "")
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

/// The chosen node's tasks: its name, which opens the project's menu, the segment, and its parts of cards.
struct ProjectTasks: View {
    @Bindable var model: BoardModel
    @Environment(\.colorScheme) private var scheme

    private var projects: ProjectsBoard { model.projects }

    var body: some View {
        let view = projects.view
        VStack(alignment: .leading, spacing: 0) {
            title(view)
                .padding(.bottom, ColumnMetrics.headGap)
            if let view, !view.missing {
                Picker("Group", selection: Binding(get: { view.mode }, set: { mode in Task { await model.projects.setMode(mode) } })) {
                    ForEach(view.modes, id: \.mode) { Text($0.label).tag($0.mode) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, CardMetrics.columnInset)
                .padding(.bottom, 8)
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: CardMetrics.gap) {
                        ForEach(Array(projects.parts.enumerated()), id: \.element.id) { index, part in
                            if let title = part.section.title {
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
                                    .padding(.top, index == 0 ? 0 : ColumnMetrics.sectionGap)
                                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.projects.geometry.parts[part.id] = $0 }
                            }
                            ForEach(part.cards) { card in
                                ProjectCard(card: card, model: model)
                                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.projects.geometry.cards[part.id + "/" + card.id] = $0 }
                            }
                        }
                        if projects.parts.isEmpty {
                            Text(verbatim: view.emptyLabel)
                                .font(.system(size: CardMetrics.title))
                                .foregroundStyle(Palette.muted)
                                .padding(.leading, CardMetrics.leading)
                                .frame(maxWidth: .infinity, minHeight: CardMetrics.height, alignment: .leading)
                        }
                    }
                    .padding(.horizontal, CardMetrics.columnInset)
                    .padding(.bottom, 120)
                    .background { TasksProbe(model: model) }
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    /// The chosen node's name, 20 points bold, fading at its end; a project's opens its menu: Rename, and its note.
    @ViewBuilder
    private func title(_ view: ProjectsView?) -> some View {
        let text = Color.clear
            .frame(maxWidth: .infinity, minHeight: ColumnMetrics.titleRow, maxHeight: ColumnMetrics.titleRow)
            .overlay(alignment: .leading) {
                Text(verbatim: view?.title ?? "")
                    .font(.system(size: 20, weight: .bold))
                    .lineLimit(1)
                    .fixedSize()
            }
            .mask(Fade())
            .padding(.horizontal, 16)
            .accessibilityAddTraits(.isHeader)
        if let menu = view?.menu {
            Menu {
                Button(menu.renameLabel, systemImage: "pencil") { model.projects.asking = .rename(menu.project.name) }
                if let note = menu.note {
                    Section(menu.noteLabel) {
                        Button(note.name, systemImage: "doc.text") { model.projects.openNote(note.link) }
                        Button(menu.detachLabel, systemImage: "minus.circle", role: .destructive) { Task { await model.projects.detach(menu.project.name) } }
                    }
                }
            } label: {
                text.contentShape(.rect)
            }
            .buttonStyle(.plain)
            .menuOrder(.fixed)
        } else {
            text
        }
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
            renamedText: model.entry.renamedTexts[card.face.step?.id ?? card.id],
            menu: { later in model.cardMenu(card, later: later) },
            overMenu: { later in model.cardMenu(card, over: true, later: later) },
            draggable: model.projects.cards[card.id]?.canDrop == true,
            carried: mark.hidden,
            onCarry: { model.startCarry(card, from: "projects") },
            from: "projects",
            onFold: card.item.can.fold ? { Task { await model.toggleCollapsed(card.item); await model.projects.read() } } : nil,
            onLink: { model.openLink($0) })
            .frame(height: card.listHeight)
            .background { if mark.waiting { DashedPlace() } }
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
    private var rows: [ProjectsRow] { projects?.view?.rows ?? [] }

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

    /// A card rides above the finger, the row lit under it seen; a lifted project below it, its line and the row above
    /// the line seen. The plus stands aside of the finger already.
    func ride(_ payload: DragPayload?) -> CopyRide {
        switch payload?.kind {
        case .card: .above
        case .project: .below
        default: .held
        }
    }

    /// A card only where it may go to a project (a task, not a subtask); a project lifted here; the plus.
    func takes(_ payload: DragPayload?) -> Bool {
        guard let payload else { return model?.place == .projects }
        switch payload.kind {
        case .card(let card): return projects?.cards[card.id]?.canDrop == true
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
            springLoad(under?.unfoldsOnHover == true ? under?.node : nil)
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

    /// The folded row a held card waits over, and the pause after which its branch opens, as a folder opens under a
    /// carried file in Files.
    private var waitingOver: String?
    private var unfold: DispatchWorkItem?

    private func springLoad(_ node: String?) {
        guard node != waitingOver else { return }
        unfold?.cancel()
        unfold = nil
        waitingOver = node
        guard let node, let projects else { return }
        let work = DispatchWorkItem { [weak self] in
            guard self?.waitingOver == node else { return }
            UISelectionFeedbackGenerator().selectionChanged()
            Task { await projects.unfold(node) }
        }
        unfold = work
        DispatchQueue.main.asyncAfter(deadline: .now() + projects.measures.hoverMs / 1000, execute: work)
    }

    func leave() {
        if model?.carrying != true { liftedFrom = nil }
        springLoad(nil)
        projects?.dropOn = nil
        aimed = nil
        model?.drag.hideLine()
    }

    func letGo(carrying payload: DragPayload?) -> CarryLanding? {
        guard let projects, let model else { return nil }
        defer { leave() }
        switch payload?.kind {
        case .card(let card):
            guard let node = projects.dropOn, let frame = projects.geometry.rows[node] else { return nil }
            Task { await projects.drop(card.id, on: node) }
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

    /// The plus alone: a card stays where it is shown, let go here.
    func takes(_ payload: DragPayload?) -> Bool { payload == nil && model?.place == .projects }

    /// Where the plus is held: the part let go in is read from it.
    private var held: CGPoint?

    /// The plus held over the tasks shows the drop line where the task will go, as the plugin's: after the last card of
    /// the part under the finger (the last whose header or card stands above it), or over the first part above them all.
    func hover(at point: CGPoint, carrying payload: DragPayload?) {
        held = point
        guard let model, let area, let line = target(at: point.y).line else { return model?.drag.hideLine() ?? () }
        model.drag.showLine(from: CGPoint(x: area.minX + CardMetrics.columnInset, y: line), to: area.maxX - CardMetrics.columnInset)
    }

    func leave() {
        held = nil
        model?.drag.hideLine()
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

    /// The part let go in, as the line showed it; above them all, the node's own.
    func letGo(carrying payload: DragPayload?) -> CarryLanding? {
        guard payload == nil, let projects = model?.projects, let view = projects.view else { return nil }
        let at = held
        let part = target(at: at?.y ?? 0).part
        held = nil
        model?.drag.hideLine()
        guard let new = part?.section.newTask ?? view.newTask else { return nil }
        projects.asking = .task(new)
        return CarryLanding(rect: at.map { CGRect(x: $0.x - 4, y: $0.y - 4, width: 8, height: 8) } ?? .null, folds: true)
    }
}
