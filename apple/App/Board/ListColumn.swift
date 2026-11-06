import Core
import SwiftUI

/// A list's column: its title (with the day's arrows over the day list), its sections and cards. A tap on a card opens
/// its menu, a long press lifts it to drag; the rows part where it would land.
struct ListColumn: View {
    let list: BoardList
    @Bindable var model: BoardModel
    var dayArrows = false
    @Binding var question: MenuQuestion?

    @State private var width: CGFloat = 0
    /// Where each card and header stands in the list, as a carry reads its place: taken as the carry begins, so the gap
    /// opening under the finger never moves the places it is read against.
    @State private var cardFrames: [String: CGRect] = [:]
    @State private var headerFrames: [String: CGRect] = [:]
    @State private var frozen: (cards: [String: CGRect], headers: [String: CGRect])?
    /// The card a carry held over the list would land before; past the last card, the list's end.
    @State private var gap: Int?

    private static let space = "list"

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ColumnTitle(title: list.title, dayArrows: dayArrows, model: model)
            ScrollView {
                VStack(alignment: .leading, spacing: CardMetrics.gap) {
                    ForEach(list.groups) { group in
                        if let header = group.header {
                            SectionHeader(title: header, group: group, column: list.column, model: model)
                                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { headerFrames[group.id] = $0 }
                        }
                        if group.empty { EmptyPlate() }
                        ForEach(group.cards) { card in
                            let index = index(of: card)
                            CardRow(card: card, model: model, question: $question)
                                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { cardFrames[card.id] = $0 }
                                .padding(.top, gap == index ? CardMetrics.height + CardMetrics.gap : 0)
                        }
                    }
                    Color.clear.frame(height: 160)
                }
                .padding(.horizontal, CardMetrics.columnInset)
                .coordinateSpace(.named(Self.space))
                .contentShape(.rect)
                .onDrop(of: [.plainText], delegate: ListDrop(list: self))
                .animation(.snappy(duration: 0.25), value: gap)
                .animation(.snappy(duration: 0.3), value: list)
                .animation(.snappy(duration: 0.3), value: model.selecting)
            }
            .scrollIndicators(.hidden)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        }
    }

    /// How deep a card let go at `x` goes: left of the list's middle a task, then one level deeper for each indent past it.
    static func level(_ x: CGFloat, width: CGFloat) -> Int {
        let middle = width / 2
        return x <= middle ? 0 : 1 + Int((x - middle) / CardMetrics.indent)
    }

    private func index(of card: BoardCard) -> Int { list.cards.firstIndex { $0.id == card.id } ?? list.cards.count }

    // MARK: A carry over the list

    fileprivate func hover(at point: CGPoint) {
        if frozen == nil { frozen = (cardFrames, headerFrames) }
        let place = place(at: point)
        if place != gap {
            UISelectionFeedbackGenerator().selectionChanged()
            gap = place
        }
    }

    fileprivate func leave() {
        gap = nil
        frozen = nil
    }

    fileprivate func land(_ id: String, at point: CGPoint) {
        let before = place(at: point)
        let passed = passedHeaders(at: point)
        // The drop's point is in the list with its side insets; the level is read in the cards' own width.
        let level = Self.level(point.x - CardMetrics.columnInset, width: width - CardMetrics.columnInset * 2)
        leave()
        Task { await model.drop(id, in: list.column, before: before, level: level, passed: passed) }
    }

    /// The card a point stands before: the first whose middle is under it.
    private func place(at point: CGPoint) -> Int {
        let frames = frozen?.cards ?? cardFrames
        return list.cards.firstIndex { (frames[$0.id]?.midY ?? .infinity) > point.y } ?? list.cards.count
    }

    /// The headers above a point, in their order: the section a drop lands in is the last of them.
    private func passedHeaders(at point: CGPoint) -> [String?] {
        guard list.showsHeaders else { return [] }
        let frames = frozen?.headers ?? headerFrames
        return list.groups.filter { $0.header != nil && (frames[$0.id]?.midY ?? .infinity) < point.y }.map(\.name)
    }
}

/// The list taking a carried card or the plus: the gap follows the finger, and letting go drops it there.
private struct ListDrop: DropDelegate {
    let list: ListColumn

    func dropUpdated(info: DropInfo) -> DropProposal? {
        list.hover(at: info.location)
        return DropProposal(operation: .move)
    }

    func dropExited(info: DropInfo) { list.leave() }

    func performDrop(info: DropInfo) -> Bool {
        let point = info.location
        guard let provider = info.itemProviders(for: [.plainText]).first else { return false }
        _ = provider.loadObject(ofClass: NSString.self) { object, _ in
            guard let id = object as? String else { return }
            Task { @MainActor in list.land(id, at: point) }
        }
        return true
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

/// One card in a list: at its depth, with its branch. A tap opens its menu, a long press lifts it to carry. Select Tasks
/// puts the system's selection circle before it, as Mail and Reminders do.
struct CardRow: View {
    let card: BoardCard
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?

    var body: some View {
        HStack(spacing: 10) {
            if model.selecting {
                SelectionCircle(on: model.picked.contains(card.id))
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }
            capsule
                .overlay(alignment: .topLeading) { if let branch = card.branch { BranchLine(branch: branch) } }
                .padding(.leading, CGFloat(card.level) * CardMetrics.indent)
        }
        .contentShape(.rect)
        .onTapGesture {
            guard model.selecting else { return }
            UISelectionFeedbackGenerator().selectionChanged()
            withAnimation(.snappy(duration: 0.2)) { model.togglePick(card.id) }
        }
    }

    @ViewBuilder
    private var capsule: some View {
        if model.selecting {
            TaskCapsule(card: card)
        } else {
            CardButton(
                card: card,
                menu: { model.cardMenu(card.item) { question = $0 } },
                ringed: model.found == card.id,
                onTouch: { model.found = nil },
                onCarry: { model.carrying = $0 })
                .frame(height: CardMetrics.height)
                // While something is carried the card lies under a cover: the list's own target takes the drop.
                .overlay { if model.carrying { Color.clear.contentShape(.rect) } }
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
