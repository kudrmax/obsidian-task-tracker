import Core
import SwiftUI

/// A list's column: its title (with the day's arrows over the day list), its sections and cards. A long press on a card
/// shows its menu, and moving on lifts it to carry: its rows close up, and the rows part where it would land, the gap
/// drawn at the level it would take.
struct ListColumn: View {
    let list: BoardList
    @Bindable var model: BoardModel
    var dayArrows = false
    @Binding var question: MenuQuestion?

    private static let space = "list"

    private var gap: ListGap? { model.gap?.column == list.column ? model.gap : nil }
    private var key: String { "list.\(list.column.rawValue)" }

    var body: some View {
        let column = list.column
        VStack(alignment: .leading, spacing: 8) {
            ColumnTitle(title: list.title, dayArrows: dayArrows, model: model)
            ScrollViewReader { scroller in
                ScrollView {
                    VStack(alignment: .leading, spacing: CardMetrics.gap) {
                        ForEach(rows) { row in
                            switch row {
                            case .header(let group, let header):
                                SectionHeader(title: header, group: group, column: column, model: model)
                                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { model.rest(column, head: group.id, $0) }
                            case .plate(let group):
                                EmptyPlate { model.entry.openIn(column, group.name) }
                            case .card(let card):
                                CardRow(card: card, column: column, model: model, question: $question)
                                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { model.rest(column, card: card.id, $0) }
                            case .gap(let level, let branch):
                                GapSpace(level: level, branch: branch)
                            case .pending(_, let text, let level, let branch):
                                EntryRow(level: level, branch: branch) { PendingCapsule(text: text) }
                            case .field(let level, let branch, let section):
                                EntryRow(level: level, branch: branch) { EntryCapsule(host: model.entry, section: section) }
                            }
                        }
                        Color.clear.frame(height: 160)
                    }
                    .padding(.horizontal, CardMetrics.columnInset)
                    .coordinateSpace(.named(Self.space))
                    .onGeometryChange(for: CGPoint.self) { $0.frame(in: .global).origin } action: { model.dropping.move(key, origin: $0) }
                }
                .scrollIndicators(.hidden)
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
        withAnimation(.snappy) { scroller.scrollTo(ListRowView.fieldID) }
    }

    /// The list as drawn: each section's header, its No tasks plate, its cards with the carry's gap among them, and the
    /// quick entry's field with the texts typed before it, where the core's `listEntry` puts them. The card being renamed
    /// gives its place to the field.
    private var rows: [ListRowView] {
        let entry = model.entry.lists[list.column]
        let renaming = model.entry.state?.renaming?.id
        var typed: [ListRowView] = []
        if let entry {
            typed = entry.pending.enumerated().map { .pending(index: $0.offset, text: $0.element.text, level: $0.element.level, branch: nil) }
            typed.append(.field(level: entry.section ? 0 : entry.place.level, branch: nil, section: entry.section))
        }
        var rows: [ListRowView] = []
        if entry?.at.kind == "top" { rows += typed }
        for (index, group) in list.groups.enumerated() {
            if let header = group.header { rows.append(.header(group, header)) }
            let here = entry.flatMap { $0.at.kind == "in" && $0.at.section == index ? $0 : nil }
            if group.empty, gap?.group != group.name, here == nil || here?.at.keepsPlate == true { rows.append(.plate(group)) }
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
        if entry?.at.kind == "end" { rows += typed }
        return entry == nil ? rows : Self.branched(rows, model: model)
    }

    /// The branch lines of the rows typed in, as the core draws a subtask's, over the levels of the list as it stands.
    private static func branched(_ rows: [ListRowView], model: BoardModel) -> [ListRowView] {
        let levels = rows.compactMap(\.level)
        var at = -1
        return rows.map { row in
            guard let level = row.level else { return row }
            at += 1
            guard level > 0 else { return row }
            switch row {
            case .pending(let index, let text, _, _): return .pending(index: index, text: text, level: level, branch: model.branch(levels: levels, index: at))
            case .field(_, _, let section): return .field(level: level, branch: model.branch(levels: levels, index: at), section: section)
            default: return row
            }
        }
    }

    /// A group's cards as drawn, with the carry's gap among them when it lands in this group.
    private func cardRows(of group: BoardGroup) -> [ListRowView] {
        var rows = group.cards.map(ListRowView.card)
        guard let gap, gap.group == group.name else { return rows }
        let others = model.others(in: list.column)
        let next = others[safe: gap.at].flatMap { $0.item.group == gap.group ? $0 : nil }
        let at = next.flatMap { card in rows.firstIndex { $0.id == card.id } } ?? rows.count
        rows.insert(.gap(level: gap.level, branch: gap.branch), at: at)
        return rows
    }
}

/// A row of a list as drawn: a section's header or its No tasks plate, a card, the gap a carry would land in, a text
/// typed and not written yet, or the field it is typed in.
private enum ListRowView: Identifiable {
    case header(BoardGroup, String)
    case plate(BoardGroup)
    case card(BoardCard)
    case gap(level: Int, branch: Branch?)
    case pending(index: Int, text: String, level: Int, branch: Branch?)
    case field(level: Int, branch: Branch?, section: Bool)

    static let fieldID = "\u{0}entry"

    var id: String {
        switch self {
        case .header(let group, _): "\u{0}head/\(group.id)"
        case .plate(let group): "\u{0}plate/\(group.id)"
        case .card(let card): card.id
        case .gap: "\u{0}gap"
        case .pending(let index, _, _, _): "\u{0}pending/\(index)"
        case .field: Self.fieldID
        }
    }

    /// The depth of a row that stands among the cards.
    var level: Int? {
        switch self {
        case .card(let card): card.level
        case .gap(let level, _), .pending(_, _, let level, _), .field(let level, _, _): level
        case .header, .plate: nil
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

/// Where a carried card would land: one card's room at the level it would take, a subtask's with its branch.
private struct GapSpace: View {
    let level: Int
    let branch: Branch?

    var body: some View {
        Color.clear
            .frame(height: CardMetrics.height)
            .frame(maxWidth: .infinity)
            .overlay(alignment: .topLeading) {
                if let branch {
                    BranchLine(branch: branch).padding(.leading, CGFloat(level) * CardMetrics.indent)
                }
            }
            .transition(.identity)
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
        .frame(height: 32)
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

    var body: some View {
        Text(title)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Palette.muted)
            .frame(maxWidth: .infinity, minHeight: 30, alignment: .bottomLeading)
            .padding(.leading, CardMetrics.leading)
            .padding(.bottom, 4)
            .contentShape(.rect)
            .contextMenu {
                if let menu = group.menu {
                    if menu.rename { Button("Rename", systemImage: "pencil") { name = menu.section; renaming = true } }
                    if menu.remove {
                        Button("Remove Section", systemImage: "trash", role: .destructive) { Task { await model.removeSection(column, menu.section) } }
                    }
                }
            }
            .alert("Rename Section", isPresented: $renaming) {
                TextField("Name", text: $name)
                Button("Cancel", role: .cancel) {}
                Button("Rename") { if let section = group.menu?.section { Task { await model.renameSection(column, section, to: name) } } }
            }
    }
}

/// A section with no task: its dashed plate under the header, as the plugin draws it.
struct EmptyPlate: View {
    /// A tap types a new task in the section.
    var open: (() -> Void)?

    var body: some View {
        Text("No tasks")
            .font(.system(size: CardMetrics.title))
            .foregroundStyle(Palette.muted)
            .padding(.leading, CardMetrics.leading)
            .frame(maxWidth: .infinity, minHeight: CardMetrics.height, alignment: .leading)
            .overlay {
                RoundedRectangle(cornerRadius: CardMetrics.radius).strokeBorder(Palette.muted.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
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
    @Binding var question: MenuQuestion?

    var body: some View {
        let carried = model.isCarried(card)
        HStack(spacing: 10) {
            if model.selecting {
                SelectionCircle(on: model.picked.contains(card.id))
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }
            capsule(carried: carried)
                .overlay(alignment: .topLeading) { if let branch = card.branch, !carried { BranchLine(branch: branch) } }
                .padding(.leading, CGFloat(card.level) * CardMetrics.indent)
        }
        .contentShape(.rect)
        .onTapGesture {
            guard model.selecting else { return }
            UISelectionFeedbackGenerator().selectionChanged()
            withAnimation(.snappy(duration: 0.2)) { model.togglePick(card.id) }
        }
        .frame(height: carried ? 0 : CardMetrics.height, alignment: .top)
        .padding(.bottom, carried ? -CardMetrics.gap : 0)
        .accessibilityHidden(carried)
    }

    @ViewBuilder
    private func capsule(carried: Bool) -> some View {
        if model.selecting {
            TaskCapsule(card: card)
        } else {
            CardButton(
                card: card,
                menu: { later in model.cardMenu(card.item, ask: { question = $0 }, later: later) },
                ringed: model.found == card.id,
                carried: carried,
                onTouch: { model.found = nil },
                onCarry: { model.startCarry(card, from: column.rawValue, grab: $0) },
                onCancel: { model.cancelCarry() },
                onEnd: { model.carryEnded() },
                onFold: card.item.can.fold ? { Task { await model.toggleCollapsed(card.item) } } : nil)
                .frame(height: CardMetrics.height)
        }
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
