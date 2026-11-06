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

    @State private var width: CGFloat = 0
    /// Where each card and header stands with no gap open in the list: a carry reads its place against them, so the gap
    /// opening under the finger never moves what it is read against.
    @State private var cardFrames: [String: CGRect] = [:]
    @State private var headerFrames: [String: CGRect] = [:]

    private static let space = "list"

    private var gap: ListGap? { model.gap?.column == list.column ? model.gap : nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ColumnTitle(title: list.title, dayArrows: dayArrows, model: model)
            ScrollView {
                VStack(alignment: .leading, spacing: CardMetrics.gap) {
                    ForEach(list.groups) { group in
                        if let header = group.header {
                            SectionHeader(title: header, group: group, column: list.column, model: model)
                                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { rest(header: group.id, $0) }
                        }
                        if group.empty, gap?.group != group.name { EmptyPlate() }
                        ForEach(rows(of: group)) { row in
                            switch row {
                            case .card(let card):
                                CardRow(card: card, model: model, question: $question)
                                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { rest(card: card.id, $0) }
                            case .gap(let level, let branch):
                                GapSpace(level: level, branch: branch)
                            }
                        }
                    }
                    Color.clear.frame(height: 160)
                }
                .padding(.horizontal, CardMetrics.columnInset)
                .coordinateSpace(.named(Self.space))
                .onGeometryChange(for: CGPoint.self) { $0.frame(in: .global).origin } action: { model.dropping.move(key, origin: $0) }
            }
            .scrollIndicators(.hidden)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.dropping.move(key, visible: $0) }
        }
        .onChange(of: list, initial: true) { register() }
        .onChange(of: width) { register() }
        .onDisappear { model.dropping.remove(key) }
    }

    private var key: String { "list.\(list.column.rawValue)" }

    /// The list as a place to drop on, with the cards it now shows.
    private func register() {
        let list = self
        model.dropping.register(key, DropPlace(hover: { list.hover(at: $0) }, leave: { list.leave() }, land: { list.land() }))
    }

    /// A group's rows as drawn: its cards, and the carry's gap among them when it lands in this group.
    private func rows(of group: BoardGroup) -> [ListRowView] {
        var rows = group.cards.map(ListRowView.card)
        guard let gap, gap.group == group.name else { return rows }
        let others = model.others(in: list.column)
        let next = others[safe: gap.at].flatMap { $0.item.group == gap.group ? $0 : nil }
        let branch: Branch? = gap.level == 0 ? nil : (next?.level == gap.level ? .mid : .last)
        let at = next.flatMap { card in rows.firstIndex { $0.id == card.id } } ?? rows.count
        rows.insert(.gap(level: gap.level, branch: branch), at: at)
        return rows
    }

    private func rest(card id: String, _ frame: CGRect) {
        if gap == nil { cardFrames[id] = frame }
    }

    private func rest(header id: String, _ frame: CGRect) {
        if gap == nil { headerFrames[id] = frame }
    }

    // MARK: A carry over the list

    private func hover(at point: CGPoint) {
        let others = model.others(in: list.column)
        let before = others.firstIndex { (cardFrames[$0.id]?.midY ?? .infinity) > point.y } ?? others.count
        model.hover(list.column, before: before, level: level(point.x), passed: passedHeaders(at: point))
    }

    private func leave() { model.leave(list.column) }

    /// Let go: the drop is written, and the card settles into the gap shown.
    private func land() -> CGRect? {
        guard let id = model.carried else { return nil }
        let spot = gapRect()
        Task { await model.drop(id, in: list.column) }
        return id == Carried.plus ? nil : spot
    }

    /// Where the gap stands in the list: before the card it parts from, or under the last card of its section.
    private func gapRect() -> CGRect? {
        guard let gap else { return nil }
        let others = model.others(in: list.column)
        let indent = CGFloat(gap.level) * CardMetrics.indent
        let x = CardMetrics.columnInset + indent
        let w = width - CardMetrics.columnInset * 2 - indent
        if let next = others[safe: gap.at], next.item.group == gap.group, let frame = cardFrames[next.id] {
            return CGRect(x: x, y: frame.minY, width: w, height: CardMetrics.height)
        }
        let above = others.prefix(gap.at).last { $0.item.group == gap.group }
        guard let frame = above.flatMap({ cardFrames[$0.id] }) ?? list.groups.first(where: { $0.name == gap.group }).flatMap({ headerFrames[$0.id] }) else { return nil }
        return CGRect(x: x, y: frame.maxY + CardMetrics.gap, width: w, height: CardMetrics.height)
    }

    /// How deep a card let go at `x` goes: left of the list's middle a task, then one level deeper for each indent past
    /// it; the core fits it to what the neighbours allow.
    private func level(_ x: CGFloat) -> Double {
        let cards = width - CardMetrics.columnInset * 2
        let middle = cards / 2
        let along = x - CardMetrics.columnInset
        return along <= middle ? 0 : Double(1 + (along - middle) / CardMetrics.indent)
    }

    /// The headers above a point, in their order: the section a drop lands in is the last of them.
    private func passedHeaders(at point: CGPoint) -> [String?] {
        guard list.showsHeaders else { return [] }
        return list.groups.filter { $0.header != nil && (headerFrames[$0.id]?.midY ?? .infinity) < point.y }.map(\.name)
    }
}

/// A row of a list as drawn: a card, or the gap a carry would land in.
private enum ListRowView: Identifiable {
    case card(BoardCard)
    case gap(level: Int, branch: Branch?)

    var id: String {
        switch self {
        case .card(let card): card.id
        case .gap: "\u{0}gap"
        }
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
    var body: some View {
        Text("No tasks")
            .font(.system(size: CardMetrics.title))
            .foregroundStyle(Palette.muted)
            .padding(.leading, CardMetrics.leading)
            .frame(maxWidth: .infinity, minHeight: CardMetrics.height, alignment: .leading)
            .overlay {
                RoundedRectangle(cornerRadius: CardMetrics.radius).strokeBorder(Palette.muted.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            }
    }
}

/// One card in a list: at its depth, with its branch. A long press shows its menu and lifts it to carry. Select Tasks
/// puts the system's selection circle before it, as Mail and Reminders do. Carried, it gives its place up.
struct CardRow: View {
    let card: BoardCard
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
                onCarry: { model.startCarry(card.id) },
                onCancel: { model.cancelCarry() },
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
