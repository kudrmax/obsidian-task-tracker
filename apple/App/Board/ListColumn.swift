import Core
import SwiftUI
import UIKit

/// A list's column: its title (with the day's arrows over the day list), its sections and cards. A long press on a card
/// shows its menu, and moving on lifts it to carry: its rows close up, and the rows part where it would land, the gap
/// drawn at the level it would take.
struct ListColumn: View {
    let list: BoardList
    @Bindable var model: BoardModel
    var dayArrows = false

    private static let space = "list"
    /// Room after the last row, so the last card scrolls over the keyboard.
    static let trailingRoom: CGFloat = 160

    /// The gap the finger points at: drawn by the drop line, the rows standing still.
    private var gap: ListGap? { model.gap?.column == list.column ? model.gap : nil }
    /// The gap a card let go here flies into: the rows part for it.
    private var settling: ListGap? { model.settling?.column == list.column ? model.settling : nil }
    private var key: String { "list.\(list.column.rawValue)" }

    var body: some View {
        let column = list.column
        let drawn = rows.map { KeyedRow(row: $0, heirs: model.entry.heirs, carried: [model.carry?.id, model.placedByDrop]) }
        VStack(alignment: .leading, spacing: ColumnMetrics.headGap) {
            ColumnTitle(title: list.title, dayArrows: dayArrows, model: model)
            ScrollViewReader { scroller in
                ScrollView {
                    VStack(alignment: .leading, spacing: CardMetrics.gap) {
                        ForEach(drawn, id: \.key) { keyed in
                            let row = keyed.row
                            // A row comes or goes by folding; what one row holds changing (a card and its rename
                            // field, which takes the card's id) changes in place, in the same frame.
                            VStack(alignment: .leading, spacing: 0) {
                                switch row {
                                case .header(let group, let header):
                                    SectionHeader(title: header, group: group, column: column, model: model)
                                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { model.rest(column, head: group.id, $0) }
                                        // As the plugin's header: room above it but at the list's top, its bottom on the first card.
                                        .padding(.top, row.id == drawn.first?.row.id ? 0 : ColumnMetrics.sectionGap)
                                        .padding(.bottom, -CardMetrics.gap)
                                        .transition(.identity)
                                case .plate(let group):
                                    EmptyPlate(hot: gap?.group == group.name && gap?.line == nil) { model.entry.openIn(column, group.name) }
                                        .transition(.identity)
                                case .card(let card):
                                    CardRow(card: card, column: column, model: model)
                                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { model.rest(column, card: card.id, $0) }
                                        .transition(.identity)
                                case .gap:
                                    GapSpace()
                                        .transition(.identity)
                                case .mark(let first):
                                    SectionMark()
                                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { model.rest(column, mark: $0) }
                                        .padding(.top, first ? 0 : ColumnMetrics.sectionGap)
                                        .transition(.identity)
                                case .pending(_, let text, let level, let branch):
                                    EntryRow(level: level, branch: branch) { PendingCapsule(text: text) }
                                        .transition(.identity)
                                case .field(_, let level, let branch, let section):
                                    EntryRow(level: level, branch: branch) { EntryCapsule(host: model.entry, section: section) }
                                        .transition(.identity)
                                }
                            }
                            // The carried card's row goes to its new place at once: the carried copy flies there.
                            .transaction { if keyed.carried { $0.animation = nil } }
                            .transition(FoldAway())
                        }
                        Color.clear.frame(height: Self.trailingRoom)
                    }
                    .padding(.horizontal, CardMetrics.columnInset)
                    .overlay(alignment: .topLeading) {
                        if let line = gap?.line { DropLine(from: line) }
                    }
                    .coordinateSpace(.named(Self.space))
                    .onGeometryChange(for: CGPoint.self) { $0.frame(in: .global).origin } action: { model.dropping.move(key, origin: $0) }
                }
                .scrollIndicators(.hidden)
                .softEdges(trailing: ListColumn.trailingRoom)
                .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { model.rest(column, width: $0) }
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.dropping.move(key, visible: $0) }
                // The field stays in sight: when it opens or moves, and when the keyboard takes the bottom of the list.
                .onChange(of: model.entry.moved) { reveal(scroller) }
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { _ in reveal(scroller) }
            }
        }
        .onAppear { model.registerList(column) }
        .onDisappear { model.dropping.remove(key) }
    }

    private func reveal(_ scroller: ScrollViewProxy) {
        guard model.entry.lists[list.column] != nil else { return }
        let renaming = model.entry.state?.renaming?.id
        guard let field = renaming ?? model.entry.lineKeys[list.column]?.last else { return }
        withAnimation(.snappy) { scroller.scrollTo(field) }
    }

    /// The list as drawn: each section's header, its No tasks plate, its cards with the carry's gap among them, and the
    /// quick entry's field with the texts typed before it, where the core's `listEntry` puts them. The card being renamed
    /// gives its place to the field.
    private var rows: [ListRowView] {
        let entry = model.entry.lists[list.column]
        let renaming = model.entry.state?.renaming?.id
        var typed: [ListRowView] = []
        if let entry {
            let keys = model.entry.lineKeys[list.column] ?? []
            typed = entry.pending.enumerated().map { .pending(key: keys[safe: $0.offset] ?? "\u{0}line", text: $0.element.text, level: $0.element.level, branch: nil) }
            // A card renamed gives its row to the field: the same row, its content now typed in, so nothing comes or goes.
            typed.append(.field(id: renaming ?? keys.last ?? "\u{0}field", level: entry.section ? 0 : entry.place.level, branch: nil, section: entry.section))
        }
        var rows: [ListRowView] = []
        if entry?.at.kind == "top" { rows += typed }
        let slot = model.carry?.section?.column == list.column ? model.sectionSlot : nil
        for (index, group) in list.groups.enumerated() {
            if slot == index { rows.append(.mark(first: rows.isEmpty)) }
            // A lifted section folds away, header and tasks, and the list closes over it.
            if model.isLifted(group, in: list.column) { continue }
            if let header = group.header { rows.append(.header(group, header)) }
            let here = entry.flatMap { $0.at.kind == "in" && $0.at.section == index ? $0 : nil }
            if group.empty, here == nil || here?.at.keepsPlate == true { rows.append(.plate(group)) }
            var cards = cardRows(of: group)
            if let here {
                let next = here.at.card.flatMap { list.cards[safe: $0] }
                let before = next.flatMap { next in cards.firstIndex { $0.id == next.id } } ?? cards.count
                cards.insert(contentsOf: typed, at: before)
            }
            rows += cards.filter { row in
                if case .card(let card) = row { card.item.id != renaming } else { true }
            }
        }
        if let slot, slot >= list.groups.count { rows.append(.mark(first: rows.isEmpty)) }
        if entry?.at.kind == "end" { rows += typed }
        // The card carried keeps its row, a dashed place; its subtasks fold away under it.
        let carried = Set(list.cards.filter { model.isFolded($0) }.map(\.id))
        return entry == nil && settling == nil && carried.isEmpty ? rows : Self.branched(rows, carried: carried, model: model)
    }

    /// The branch lines of every row while the field or a carry's gap stands in the list, or a card of it is carried, as
    /// the core draws a subtask's over the levels of the rows as they stand: a card above the field or the gap keeps its
    /// line going down to it, and a carried card's place closes up with no line left hanging into it.
    private static func branched(_ rows: [ListRowView], carried: Set<String>, model: BoardModel) -> [ListRowView] {
        let standing = rows.filter { !$0.isCarried(carried) }
        let branches = model.branches(levels: standing.compactMap(\.level))
        var at = -1
        return rows.map { row in
            guard let level = row.level, !row.isCarried(carried) else { return row }
            at += 1
            let branch = level > 0 ? branches[safe: at] ?? nil : nil
            switch row {
            case .card(let card) where card.branch != branch:
                return .card(BoardCard(item: card.item, level: card.level, branch: branch, due: card.due, repeats: card.repeats, shades: card.shades, corner: card.corner))
            case .gap: return .gap(level: level, branch: branch)
            case .pending(let key, let text, _, _): return .pending(key: key, text: text, level: level, branch: branch)
            case .field(let id, _, _, let section): return .field(id: id, level: level, branch: branch, section: section)
            default: return row
            }
        }
    }

    /// A group's cards as drawn, with the room a card let go flies into when it lands in this group.
    private func cardRows(of group: BoardGroup) -> [ListRowView] {
        var rows = group.cards.map(ListRowView.card)
        guard let gap = settling, gap.group == group.name, !group.empty else { return rows }
        let others = model.others(in: list.column)
        let next = others[safe: gap.at].flatMap { $0.item.group == gap.group ? $0 : nil }
        let at = next.flatMap { card in rows.firstIndex { $0.id == card.id } } ?? rows.count
        rows.insert(.gap(level: gap.level, branch: nil), at: at)
        return rows
    }
}

/// A row as the list keys it: a card made from a typed line keeps that line's key (`QuickEntryHost.heirs`), so the text
/// becomes the card in its row.
private struct KeyedRow {
    let row: ListRowView
    let key: String
    /// The row of the card being carried, or just put in its place by a drop.
    let carried: Bool

    init(row: ListRowView, heirs: [String: String], carried: [String?]) {
        self.row = row
        if case .card(let card) = row, let heir = heirs[card.id] { key = heir } else { key = row.id }
        if case .card(let card) = row { self.carried = carried.contains(card.id) } else { self.carried = false }
    }
}

/// A row of a list as drawn: a section's header or its No tasks plate, a card, the gap a carry would land in, a text
/// typed and not written yet, or the field it is typed in.
private enum ListRowView: Identifiable {
    case header(BoardGroup, String)
    case plate(BoardGroup)
    case card(BoardCard)
    case gap(level: Int, branch: Branch?)
    case pending(key: String, text: String, level: Int, branch: Branch?)
    /// The field, in the row of the card it renames (by that card's id) or a row of its own.
    case field(id: String, level: Int, branch: Branch?, section: Bool)
    /// Where a carried section would land, before a header or at the list's end.
    case mark(first: Bool)

    var id: String {
        switch self {
        case .header(let group, _): "\u{0}head/\(group.id)"
        case .plate(let group): "\u{0}plate/\(group.id)"
        case .card(let card): card.id
        case .gap: "\u{0}gap"
        case .pending(let key, _, _, _): key
        case .field(let id, _, _, _): id
        case .mark: "\u{0}mark"
        }
    }

    func isCarried(_ carried: Set<String>) -> Bool {
        if case .card(let card) = self { carried.contains(card.id) } else { false }
    }

    /// The depth of a row that stands among the cards.
    var level: Int? {
        switch self {
        case .card(let card): card.level
        case .gap(let level, _), .pending(_, _, let level, _), .field(_, let level, _, _): level
        case .header, .plate, .mark: nil
        }
    }
}

/// A row typed in, at its depth with its branch.
private struct EntryRow<Content: View>: View {
    let level: Int
    let branch: Branch?
    @ViewBuilder let content: Content

    var body: some View {
        content
            .overlay(alignment: .topLeading) { if let branch { BranchLine(branch: branch) } }
            .padding(.leading, CGFloat(level) * CardMetrics.indent)
    }
}

/// The room a card let go flies into: the rows part for it as it lands; it draws nothing of its own, the card brings its
/// branch with it.
private struct GapSpace: View {
    var body: some View {
        Color.clear
            .frame(height: CardMetrics.height)
            .frame(maxWidth: .infinity)
            .transition(.identity)
            .accessibilityHidden(true)
    }
}

/// Where a carried card will land, as the plugin shows it (`DropLine`): the calendar's drop line between two cards, from
/// a dot at the left edge of the level it picks to the list's right edge. The rows stand still under it.
private struct DropLine: View {
    let from: CGPoint
    @Environment(\.colorScheme) private var scheme
    static let dot: CGFloat = 8
    static let thickness: CGFloat = 2

    var body: some View {
        GeometryReader { box in
            HStack(spacing: 0) {
                Circle().frame(width: Self.dot, height: Self.dot)
                Rectangle().frame(height: Self.thickness)
            }
            .foregroundStyle(Palette.accent(scheme))
            .frame(width: max(Self.dot, box.size.width - CardMetrics.columnInset - from.x), height: Self.dot)
            .offset(x: from.x, y: from.y - Self.dot / 2)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// A column's title, 20 points bold; the day list's has the arrows that turn the day, and a tap on it comes back to today.
struct ColumnTitle: View {
    let title: String
    var dayArrows = false
    @Bindable var model: BoardModel

    var body: some View {
        HStack(spacing: 4) {
            if dayArrows {
                Button("Previous Day", systemImage: "chevron.left") { Task { await model.step(-1) } }
                    .labelStyle(.iconOnly)
                    .frame(width: 32, height: 32)
            }
            if dayArrows {
                Button { Task { await model.showToday() } } label: { titleText }
                    .accessibilityHint("Back to today")
            } else {
                titleText.accessibilityAddTraits(.isHeader)
            }
            if dayArrows {
                Button("Next Day", systemImage: "chevron.right") { Task { await model.step(1) } }
                    .labelStyle(.iconOnly)
                    .frame(width: 32, height: 32)
            }
        }
        .buttonStyle(.plain)
        .fontWeight(.semibold)
        .frame(height: ColumnMetrics.titleRow)
        .padding(.horizontal, dayArrows ? 0 : 16)
    }

    private var titleText: some View {
        Text(title)
            .font(.system(size: 20, weight: .bold))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

/// A section's heading in a list: its menu renames or removes it, as the core offers.
struct SectionHeader: View {
    let title: String
    let group: BoardGroup
    let column: BoardColumn
    @Bindable var model: BoardModel
    @State private var renaming = false
    @State private var name = ""
    @State private var spot = MenuSpot.Anchor()
    @Environment(\.colorScheme) private var scheme

    /// Rename and Remove Section, as the core offers them for the section.
    private var headerMenu: UIMenu? {
        guard let menu = group.menu else { return nil }
        var actions: [UIMenuElement] = []
        if menu.rename {
            actions.append(UIAction(title: String(localized: "Rename"), image: UIImage(systemName: "pencil")) { _ in
                name = menu.section
                renaming = true
            })
        }
        if menu.remove {
            actions.append(UIAction(title: String(localized: "Remove Section"), image: UIImage(systemName: "trash"), attributes: .destructive) { _ in
                Task { await model.removeSection(column, menu.section) }
            })
        }
        return actions.isEmpty ? nil : UIMenu(children: actions)
    }

    var body: some View {
        Text(title)
            .font(.system(size: ColumnMetrics.groupName, weight: .semibold))
            .frame(height: ColumnMetrics.groupLeading)
            .foregroundStyle(group.name == nil ? Palette.muted : Palette.pullInk(scheme))
            .lineLimit(1)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            .padding(.leading, CardMetrics.leading)
            .padding(.trailing, 4)
            .frame(height: ColumnMetrics.groupHead)
            .contentShape(.rect)
            // As a card's: a tap opens its menu once the finger is up, a long press lifts it; no context menu, so the lift
            // never flashes one.
            .background { MenuSpot(spot: spot) }
            .onTapGesture { point in spot.present(headerMenu, at: point) }
            .modifier(SectionLift(group: group, column: column, model: model))
            .alert("Rename Section", isPresented: $renaming) {
                TextField("Name", text: $name)
                Button("Cancel", role: .cancel) {}
                Button("Rename") { if let section = group.menu?.section { Task { await model.renameSection(column, section, to: name) } } }
            }
    }
}

/// A long press on a section's header lifts the section, as the plugin's (`GroupDrag`): moving on carries it among the
/// list's sections; it shows as a card with the section's name and count over two layers of its tasks.
private struct SectionLift: ViewModifier {
    let group: BoardGroup
    let column: BoardColumn
    let model: BoardModel

    func body(content: Content) -> some View {
        if group.reorder {
            content.onDrag {
                model.startSectionCarry(column, group)
                return NSItemProvider(object: "section" as NSString)
            } preview: {
                SectionFloat(name: group.header ?? "", count: group.cards.filter { $0.level == 0 }.count)
            }
        } else {
            content
        }
    }
}

/// The lifted section under the finger (`.tc-section-float`): its name and the number of its tasks on a card, two layers
/// of its tasks beneath.
private struct SectionFloat: View {
    let name: String
    let count: Int
    @Environment(\.colorScheme) private var scheme
    static let width: CGFloat = 190
    static let height: CGFloat = CardMetrics.height + 2
    static let step = CGSize(width: 7, height: 6)

    var body: some View {
        let dark = scheme == .dark
        ZStack(alignment: .topLeading) {
            layer(Color(hex: dark ? "#1C1C1E" : "#EFEFF2"), depth: 2)
            layer(Color(hex: dark ? "#242426" : "#F7F7F9"), depth: 1)
            HStack(spacing: 8) {
                Text(name)
                    .font(.system(size: CardMetrics.title, weight: .semibold))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(verbatim: "\(count)")
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Palette.muted)
            }
            .padding(.leading, CardMetrics.leading)
            .padding(.trailing, 12)
            .frame(width: Self.width, height: Self.height)
            .background(Color(hex: dark ? "#2C2C2E" : "#FFFFFF"), in: .capsule)
        }
        .frame(width: Self.width, height: Self.height + 2 * Self.step.height, alignment: .top)
    }

    private func layer(_ fill: Color, depth: CGFloat) -> some View {
        Capsule().fill(fill)
            .frame(width: Self.width - 2 * Self.step.width * depth, height: Self.height)
            .offset(x: Self.step.width * depth, y: Self.step.height * depth)
    }
}

/// Where a carried section would land (`.tc-group-drop`): a dashed card's room before a header or at the list's end.
private struct SectionMark: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        RoundedRectangle(cornerRadius: CardMetrics.radius)
            .strokeBorder(Palette.dash(scheme), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            .frame(height: CardMetrics.height)
            .accessibilityHidden(true)
    }
}

/// A section with no task: its dashed plate under the header, as the plugin draws it.
struct EmptyPlate: View {
    /// A carried card would land in the section: the plate lights in the accent, as the plugin's (`is-hot`).
    var hot = false
    /// A tap types a new task in the section.
    var open: (() -> Void)?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Text("No tasks")
            .font(.system(size: CardMetrics.title))
            .foregroundStyle(hot ? Palette.accent(scheme) : Palette.muted)
            .padding(.leading, CardMetrics.leading)
            .frame(maxWidth: .infinity, minHeight: CardMetrics.height, alignment: .leading)
            .background(hot ? Palette.dropBg(scheme) : .clear, in: .rect(cornerRadius: CardMetrics.radius))
            .overlay {
                RoundedRectangle(cornerRadius: CardMetrics.radius)
                    .strokeBorder(hot ? Palette.accent(scheme) : Palette.muted.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: hot ? [] : [4, 3]))
            }
            .contentShape(.rect(cornerRadius: CardMetrics.radius))
            .onTapGesture { open?() }
            .accessibilityAddTraits(open == nil ? [] : .isButton)
    }
}

/// One card in a list: at its depth, with its branch. A long press shows its menu and lifts it to carry. Select Tasks
/// puts the system's selection circle before it, as Mail and Reminders do. Carried, it gives its place up.
struct CardRow: View {
    let card: BoardCard
    let column: BoardColumn
    @Bindable var model: BoardModel

    var body: some View {
        let waiting = model.isWaiting(card)
        // Its subtasks go with a carried card: they fold away under its dashed place.
        let folded = model.isFolded(card)
        let selecting = model.selecting
        HStack(spacing: 10) {
            if selecting {
                SelectionCircle(on: model.picked.contains(card.id))
                    .contentShape(.rect)
                    .onTapGesture { pick() }
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }
            // One card in and out of Select Tasks: the circle slides in beside it and it makes room, never a new card.
            CardButton(
                card: card,
                renamedText: model.entry.renamedTexts[card.id],
                menu: { later in selecting ? nil : model.cardMenu(card.item, later: later) },
                ringed: model.found == card.id,
                draggable: !selecting,
                carried: folded || model.isHidden(card),
                arrival: model.arrival?.id == card.id ? model.arrival?.from : nil,
                onTouch: { model.found = nil },
                onPick: selecting ? { pick() } : nil,
                onCarry: { model.startCarry(card, from: column.rawValue, grab: $0) },
                onCancel: { model.cancelCarry() },
                onEnd: { model.carryEnded() },
                onFold: card.item.can.fold && !selecting ? { Task { await model.toggleCollapsed(card.item) } } : nil)
                .frame(height: CardMetrics.height)
                // Behind the card from the lift on, with no fade: the card hides over it once the carried copy leaves.
                .background { if waiting { WaitingPlace().transition(.identity) } }
                .overlay(alignment: .topLeading) { if let branch = card.branch, !folded, !waiting { BranchLine(branch: branch) } }
                .padding(.leading, CGFloat(card.level) * CardMetrics.indent)
        }
        .frame(height: folded ? 0 : CardMetrics.height, alignment: .top)
        .padding(.bottom, folded ? -CardMetrics.gap : 0)
        .accessibilityHidden(folded)
    }

    private func pick() {
        UISelectionFeedbackGenerator().selectionChanged()
        withAnimation(.snappy(duration: 0.2)) { model.togglePick(card.id) }
    }
}

/// Where a carried card was lifted from, as the plugin keeps it (`is-waiting`): a dashed outline of the card. The card itself
/// hides over it once the carried copy has left.
private struct WaitingPlace: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        RoundedRectangle(cornerRadius: CardMetrics.radius)
            .strokeBorder(Palette.dash(scheme), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            .accessibilityHidden(true)
    }
}

/// The system's selection mark, as Mail and Reminders draw it: an empty ring, or the accent's filled circle with a check.
struct SelectionCircle: View {
    let on: Bool

    var body: some View {
        Image(systemName: on ? "checkmark.circle.fill" : "circle")
            .font(.system(size: 22))
            .symbolRenderingMode(on ? .palette : .monochrome)
            .foregroundStyle(on ? AnyShapeStyle(.white) : AnyShapeStyle(Color(.tertiaryLabel)), AnyShapeStyle(.tint))
            .contentTransition(.symbolEffect(.replace))
            .accessibilityLabel(on ? "Selected" : "Not selected")
    }
}

/// A list or the calendar fades out softly at an edge it scrolls past, over half a card's height: at the top under its
/// title while something is scrolled up there, at the bottom while more is below (where Inbox meets Backlog), as the
/// plugin's lists do; a list at its top shows no fade there. iOS's own soft scroll edge shows only under the system's bars,
/// and these columns scroll under their own titles: a mask of the same kind. `trailing` is room at the end of the content
/// that holds nothing (a list's space to scroll its last card over the keyboard): no fade for it.
private struct SoftEdges: ViewModifier {
    var trailing: CGFloat = 0
    @State private var edges = Edges()
    static let fade = CardMetrics.height / 2

    struct Edges: Equatable {
        var top: CGFloat = 0
        var bottom: CGFloat = 0
    }

    func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: Edges.self) { geometry in
                let above = geometry.contentOffset.y + geometry.contentInsets.top
                let below = geometry.contentSize.height + geometry.contentInsets.bottom - trailing - geometry.contentOffset.y - geometry.containerSize.height
                return Edges(top: min(Self.fade, max(0, above)), bottom: min(Self.fade, max(0, below)))
            } action: { _, new in edges = new }
            .mask {
                VStack(spacing: 0) {
                    LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom).frame(height: edges.top)
                    Rectangle()
                    LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom).frame(height: edges.bottom)
                }
            }
    }
}

extension View {
    func softEdges(trailing: CGFloat = 0) -> some View { modifier(SoftEdges(trailing: trailing)) }
}

/// How far a calendar's top fade reaches at a scroll offset: an event cut by the top edge keeps its title under it.
enum SoftEdge {
    static func top(at offset: CGFloat) -> CGFloat { min(SoftEdges.fade, max(0, offset)) }
}

/// A row that comes or goes in a list folds open or shut from its top while the rows below slide to make or close its
/// room: its visible part shrinks as fast as the gap closes, so the row below never draws over it, and it fades.
/// The clip is a shape, not a mask's view builder: SwiftUI renders a running transition off the main thread, where a
/// main-actor closure traps.
struct FoldAway: Transition {
    func body(content: Content, phase: TransitionPhase) -> some View {
        let share: CGFloat = phase.isIdentity ? 1 : 0
        // The row's own height folds, so the rows below move by exactly what shows of it, one row or a whole block.
        FoldedHeight(share: share) {
            content.clipShape(TopPart(share: share))
        }
        .opacity(share)
    }
}

/// Its content at the top `share` of its height: the height it takes in the list.
private struct FoldedHeight: SwiftUI.Layout {
    var share: CGFloat

    var animatableData: CGFloat {
        get { share }
        set { share = newValue }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let content = subviews.first else { return .zero }
        let size = content.sizeThatFits(proposal)
        return CGSize(width: size.width, height: size.height * share)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let content = subviews.first else { return }
        let size = content.sizeThatFits(proposal)
        content.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: bounds.width, height: size.height))
    }
}

/// The top `share` of a row, cut only at its bottom: what the row draws beyond its other edges, and beyond the bottom
/// while it stands whole (a card's menu preview flying home inside it), is not cut.
private struct TopPart: Shape {
    var share: CGFloat

    var animatableData: CGFloat {
        get { share }
        set { share = newValue }
    }

    nonisolated func path(in rect: CGRect) -> Path {
        let reach = max(rect.width, rect.height) * 4
        let bottom = share >= 1 ? rect.maxY + reach : rect.minY + rect.height * share
        return Path(CGRect(x: rect.minX - reach, y: rect.minY - reach, width: rect.width + reach * 2, height: bottom - rect.minY + reach))
    }
}

/// Where a SwiftUI view opens a UIKit menu at a tap's point, as a card's does (`MenuOpener`): it takes no touches, so a
/// long press on the view stays its own (a lift, a drag).
struct MenuSpot: UIViewRepresentable {
    let spot: Anchor

    @MainActor
    final class Anchor {
        let opener = MenuOpener { _ in }

        func present(_ menu: UIMenu?, at point: CGPoint) {
            guard let menu else { return }
            opener.present(menu, at: point) { nil }
        }
    }

    func makeUIView(context: Context) -> MenuOpener { spot.opener }
    func updateUIView(_ view: MenuOpener, context: Context) {}
}
