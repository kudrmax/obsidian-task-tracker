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
                    ForEach(list.groups) { group in
                        if let header = group.header {
                            SectionHeader(title: header, group: group, column: list.column, model: model)
                        }
                        if group.empty {
                            Text("No tasks")
                                .font(.system(size: CardMetrics.title))
                                .foregroundStyle(Palette.muted)
                                .padding(.leading, CardMetrics.leading)
                                .frame(maxWidth: .infinity, minHeight: CardMetrics.height, alignment: .leading)
                                .overlay {
                                    RoundedRectangle(cornerRadius: CardMetrics.radius).strokeBorder(Palette.muted.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                                }
                        }
                        ForEach(group.cards) { card in
                            CardRow(card: card, column: list.column, index: index(of: card), model: model, question: $question)
                        }
                    }
                    Color.clear.frame(height: 120)
                }
                .padding(.horizontal, CardMetrics.columnInset)
            }
            .scrollIndicators(.hidden)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.drag.place(list.column, $0) }
        }
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

/// One card in a list: at its depth, with its branch, its menu on a tap; a long press lifts it to carry, and the rows
/// part before the card it would land before.
struct CardRow: View {
    let card: BoardCard
    let column: BoardColumn
    let index: Int
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?

    var body: some View {
        let gap = model.drag.gapBefore == card.id
        capsule
            .overlay(alignment: .topLeading) { if let branch = card.branch { BranchLine(branch: branch) } }
            .padding(.leading, CGFloat(card.level) * CardMetrics.indent)
            .dragSlot(card, column: column, index: index, drag: model.drag)
            .padding(.top, gap ? CardMetrics.height + CardMetrics.gap : 0)
            .opacity(model.drag.lifted?.id == card.id ? 0 : 1)
            .animation(.snappy, value: gap)
    }

    @ViewBuilder
    private var capsule: some View {
        let ringed = model.found == card.id
        if model.selecting {
            Button { model.togglePick(card.item) } label: {
                TaskCapsule(card: card, selecting: true, picked: model.picked.contains(card.id))
            }
            .buttonStyle(.plain)
        } else if let menu = model.snapshot?.menus[card.id] {
            Menu {
                TaskMenuContent(items: [card.item], menu: menu, model: model, question: $question)
            } label: {
                TaskCapsule(card: card, ringed: ringed)
            }
            .buttonStyle(.plain)
            .tint(.primary)
            .simultaneousGesture(TapGesture().onEnded { model.found = nil })
            .carries(card, with: model.drag, model: model)
        } else {
            TaskCapsule(card: card, ringed: ringed)
        }
    }
}
