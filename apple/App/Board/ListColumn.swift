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
                                .dropDestination(for: DraggedTask.self) { dropped, _ in
                                    land(dropped, before: firstIndex(of: group), level: 0, passed: passed(through: groupIndex))
                                }
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
                            CardRow(card: card, column: list.column.rawValue, model: model, question: $question) { dropped in
                                land(dropped, before: index(of: card), level: card.level, passed: passed(through: groupIndex))
                            }
                        }
                    }
                    Color.clear
                        .frame(height: 120)
                        .contentShape(.rect)
                        .dropDestination(for: DraggedTask.self) { dropped, _ in
                            land(dropped, before: list.cards.count, level: 0, passed: passed(through: list.groups.count - 1))
                        }
                }
                .padding(.horizontal, CardMetrics.columnInset)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func index(of card: BoardCard) -> Int { list.cards.firstIndex { $0.id == card.id } ?? list.cards.count }

    private func firstIndex(of group: BoardGroup) -> Int {
        group.cards.first.map(index(of:)) ?? list.cards.count
    }

    private func passed(through groupIndex: Int) -> [String?] {
        guard list.showsHeaders, groupIndex >= 0 else { return [] }
        return list.groups.prefix(groupIndex + 1).map(\.name)
    }

    private func land(_ dropped: [DraggedTask], before index: Int, level: Int, passed: [String?]) -> Bool {
        guard let id = dropped.first?.id else { return false }
        Task { await model.drop(id, in: list.column, before: index, level: level, passed: passed) }
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
            Button {
                if dayArrows { Task { await model.showToday() } }
            } label: {
                Text(title)
                    .font(.system(size: 20, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .disabled(!dayArrows)
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

/// One card in a list: at its depth, with its branch, its menu on a tap and a drag on a long press.
struct CardRow: View {
    let card: BoardCard
    let column: String
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?
    let land: ([DraggedTask]) -> Bool
    @State private var targeted = false

    var body: some View {
        capsule
            .overlay(alignment: .topLeading) { if let branch = card.branch { BranchLine(branch: branch) } }
            .padding(.leading, CGFloat(card.level) * CardMetrics.indent)
            .padding(.top, targeted ? CardMetrics.height + CardMetrics.gap : 0)
            .animation(.snappy, value: targeted)
            .dropDestination(for: DraggedTask.self, action: { dropped, _ in land(dropped) }, isTargeted: { targeted = $0 })
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
            .draggable(DraggedTask(id: card.id)) { TaskCapsule(card: card).frame(width: 180) }
            .simultaneousGesture(TapGesture().onEnded { model.found = nil })
        } else {
            TaskCapsule(card: card, ringed: ringed)
        }
    }
}
