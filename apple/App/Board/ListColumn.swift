import Core
import SwiftUI

/// A list's column: its title (with the day's arrows over the day list), its sections and cards. A tap on a card opens
/// its menu, a long press lifts it to drag; the rows part where it would land.
struct ListColumn: View {
    let list: BoardList
    @Bindable var model: BoardModel
    var dayArrows = false
    @Binding var question: MenuQuestion?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ColumnTitle(title: list.title, dayArrows: dayArrows, model: model)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: CardMetrics.gap) {
                    ForEach(Array(list.groups.enumerated()), id: \.element.id) { groupIndex, group in
                        if let header = group.header {
                            SectionHeader(title: header, group: group, column: list.column, model: model)
                                .landing(list: list.column, model: model, gap: false) { id, x in
                                    await model.drop(id, in: list.column, before: firstIndex(of: group), level: 0, endOf: group.cards.isEmpty ? groupIndex : nil)
                                }
                        }
                        if group.empty {
                            EmptyPlate()
                                .landing(list: list.column, model: model) { id, x in
                                    await model.drop(id, in: list.column, before: .max, level: 0, endOf: groupIndex)
                                }
                        }
                        ForEach(group.cards) { card in
                            CardRow(card: card, column: list.column, index: index(of: card), width: width - CardMetrics.columnInset * 2, model: model, question: $question)
                        }
                    }
                    Color.clear
                        .frame(height: 160)
                        .contentShape(.rect)
                        .landing(list: list.column, model: model) { id, x in
                            await model.drop(id, in: list.column, before: .max, level: Self.level(x, width: width - CardMetrics.columnInset * 2))
                        }
                }
                .padding(.horizontal, CardMetrics.columnInset)
                .animation(.snappy(duration: 0.3), value: model.selecting)
            }
            .scrollIndicators(.hidden)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        }
    }

    @State private var width: CGFloat = 0

    /// How deep a card let go at `x` goes: left of the list's middle a task, then one level deeper for each indent past it.
    static func level(_ x: CGFloat, width: CGFloat) -> Int {
        let middle = width / 2
        return x <= middle ? 0 : 1 + Int((x - middle) / CardMetrics.indent)
    }

    private func firstIndex(of group: BoardGroup) -> Int {
        group.cards.first.map(index(of:)) ?? list.cards.count
    }

    private func index(of card: BoardCard) -> Int { list.cards.firstIndex { $0.id == card.id } ?? list.cards.count }



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

/// One card in a list: at its depth, with its branch. A tap opens its menu, a long press lifts it to carry; while a card
/// is carried over it, the rows part above it. Select Tasks puts the system's selection circle before it.
struct CardRow: View {
    let card: BoardCard
    let column: BoardColumn
    let index: Int
    /// The list's width, which a drop's level is read against.
    let width: CGFloat
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
            withAnimation(.snappy(duration: 0.2)) { model.togglePick(card.item) }
        }
        .landing(list: column, model: model) { id, x in
            await model.drop(id, in: column, before: index, level: ListColumn.level(x, width: width))
        }
    }

    @ViewBuilder
    private var capsule: some View {
        let ringed = model.found == card.id
        if model.selecting {
            TaskCapsule(card: card)
        } else {
            CardButton(card: card, menu: { model.cardMenu(card.item) { question = $0 } }, ringed: ringed) { model.found = nil }
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

/// Where a carried card or the plus can be let go: the rows part over it while one is held above it.
private struct Landing: ViewModifier {
    let list: BoardColumn
    let model: BoardModel
    let gap: Bool
    let land: (String, CGFloat) async -> Void
    @State private var targeted = false

    func body(content: Content) -> some View {
        content
            .padding(.top, gap && targeted ? CardMetrics.height + CardMetrics.gap : 0)
            .animation(.snappy(duration: 0.25), value: targeted)
            .dropDestination(for: String.self) { ids, at in
                guard let id = ids.first else { return false }
                Task { await land(id, at.x) }
                return true
            } isTargeted: { over in
                targeted = over
            }
    }
}

extension View {
    fileprivate func landing(list: BoardColumn, model: BoardModel, gap: Bool = true, land: @escaping (String, CGFloat) async -> Void) -> some View {
        modifier(Landing(list: list, model: model, gap: gap, land: land))
    }
}
