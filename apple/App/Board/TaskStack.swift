import Core
import SwiftUI
import UIKit

/// A task's subtasks as a stack of the same capsules as the lists, at their depths with their branches, with the quick
/// entry's field and the texts waiting before it where the core puts them (`stackEntry`): the full screen draws it under
/// the title, and a card on the calendar under its lifted copy while a subtask is typed (`TimelineStack`).
struct TaskStack: View {
    let task: TaskItem
    @Bindable var model: BoardModel
    let tree: FullTree?
    let cards: [String: BoardCard]
    /// Under the task's own card (the calendar's stack): the subtasks one level in, branching from it.
    var underCard = false
    /// The full screen's subtasks: a circle before each ticks it done in place, and again opens it.
    var ticks = false
    let menu: (TaskItem, _ later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu?

    var body: some View {
        let rows = stackRows
        let base = underCard ? 1 : 0
        let levels = (underCard ? [0] : []) + rows.map { $0.level + base }
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: CardMetrics.gap) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    let level = row.level + base
                    let branch = level > 0 ? model.branch(levels: levels, index: index + base) : nil
                    switch row {
                    case .row(let full): subtask(full, level: level, branch: branch)
                    case .pending(_, let text, _): typed(level: level, branch: branch) { PendingCapsule(text: text) }
                    case .field: typed(level: level, branch: branch) { EntryCapsule(host: model.entry) }
                    }
                }
            }
        }
    }

    /// The task and its subtasks as the file has them: the task found again, its tree, and the subtasks' cards coloured
    /// and dated as a list draws them.
    static func read(_ task: TaskItem, model: BoardModel) async -> (task: TaskItem?, tree: FullTree?, cards: [String: BoardCard]) {
        let found: TaskItem? = try? await model.read("tasks.find", [task.key.json, .string(task.text)])
        let tree: FullTree? = try? await model.rule("tasks.fullTree", [(found ?? task).json])
        let drawn = await model.cards((tree?.rows ?? []).map { ListRow(item: $0.item, level: $0.level) })
        return (found, tree, Dictionary(drawn.map { ($0.item.id, $0) }, uniquingKeysWith: { first, _ in first }))
    }

    /// The subtasks as drawn, with the field and the texts waiting before it where the core puts them.
    private var stackRows: [StackRow] {
        var rows = (tree?.rows ?? []).map(StackRow.row)
        guard let entry = model.entry.stackEntry(task), let index = entry.at.index, let level = entry.at.level else { return rows }
        switch entry.at.kind {
        case "row" where rows.indices.contains(index):
            rows[index] = .field(level: level)
        case "new" where index <= rows.count:
            let typed = entry.pending.enumerated().map { StackRow.pending(index: $0.offset, text: $0.element.text, level: $0.element.level) }
            rows.insert(contentsOf: typed + [.field(level: level)], at: index)
        default:
            break
        }
        return rows
    }

    private enum StackRow: Identifiable {
        case row(FullRow)
        case pending(index: Int, text: String, level: Int)
        case field(level: Int)

        var id: String {
            switch self {
            case .row(let row): row.item.id
            case .pending(let index, _, _): "\u{0}pending/\(index)"
            case .field: "\u{0}entry"
            }
        }

        var level: Int {
            switch self {
            case .row(let row): row.level
            case .pending(_, _, let level), .field(let level): level
            }
        }
    }

    private func typed(level: Int, branch: Branch?, @ViewBuilder _ content: () -> some View) -> some View {
        content()
            .overlay(alignment: .topLeading) { if let branch { BranchLine(branch: branch) } }
            .padding(.leading, CGFloat(level) * CardMetrics.indent)
    }

    /// A subtask as the same capsule as on the main screen, at its depth; a tap shows its own menu.
    private func subtask(_ row: FullRow, level: Int, branch: Branch?) -> some View {
        let drawn = cards[row.item.id]
        let card = BoardCard(item: row.item, level: level, branch: level > 0 ? branch : nil, due: drawn?.due, repeats: drawn?.repeats ?? row.item.repeats, paint: drawn?.paint, parts: drawn?.parts)
        return HStack(spacing: Self.tickGap) {
            if ticks { TickCircle(item: row.item) { Task { await model.write("tasks.toggleDone", [row.item.key.json]) } } }
            CardButton(card: card, menu: { later in menu(row.item, later) }, draggable: false, onLink: { model.openLink($0) }, onProject: model.projectOpener(row.item))
                .frame(height: CardMetrics.height)
        }
        .overlay(alignment: .topLeading) { if let branch = card.branch { BranchLine(branch: branch) } }
        .padding(.leading, CGFloat(level) * CardMetrics.indent)
    }
}

extension TaskStack {
    static let tickGap: CGFloat = 8
}

/// The full screen's circle before a subtask, as the plugin's: empty while it is open; filled with a check once done, with
/// a cross once dropped, the card crossed out and left in its place. A tap ticks it done or opens it again.
struct TickCircle: View {
    let item: TaskItem
    let toggle: () -> Void
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Button {
            UISelectionFeedbackGenerator().selectionChanged()
            toggle()
        } label: {
            Image(systemName: item.open ? "circle" : item.status == "done" ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.system(size: 22))
                .foregroundStyle(item.open ? Color(.tertiaryLabel) : Palette.accent(scheme))
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 24, height: CardMetrics.height)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.open ? "Mark as done" : "Open again")
    }
}

/// Add Subtask on a card that stands only on the calendar, as the plugin's: the card is lifted over a dimmed screen where
/// it stands, its subtasks stacked under it and the field last among them. Typing ends as anywhere (Enter on an empty
/// field, a tap elsewhere, the check): the stack goes with the field.
struct TimelineStack: View {
    let shown: BoardModel.ShownStack
    @Bindable var model: BoardModel
    @State private var tree: FullTree?
    @State private var cards: [String: BoardCard] = [:]
    @State private var task: TaskItem?
    @State private var room: CGFloat = 0

    var body: some View {
        GeometryReader { box in
            let width = min(box.size.width - 2 * Layout.margin, Self.width)
            let left = min(max(Layout.margin, shown.frame.minX - box.frame(in: .global).minX), box.size.width - Layout.margin - width)
            let top = min(max(0, shown.frame.minY - box.frame(in: .global).minY), max(0, box.size.height * Self.highest - room))
            ZStack(alignment: .topLeading) {
                Rectangle()
                    .fill(.black.opacity(0.25))
                    .background(.ultraThinMaterial)
                    .ignoresSafeArea()
                    .onTapGesture { model.entry.blur() }
                VStack(alignment: .leading, spacing: CardMetrics.gap) {
                    TaskCapsule(card: card, height: CardMetrics.height)
                        .frame(height: CardMetrics.height)
                    TaskStack(task: task ?? shown.card.item, model: model, tree: tree, cards: cards, underCard: true) { _, _ in nil }
                }
                .frame(width: width, alignment: .topLeading)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { room = $0 }
                .offset(x: left, y: top)
            }
        }
        .task { await read() }
        .onChange(of: model.snapshot?.tasksText) { Task { await read() } }
        .onAppear {
            model.entry.stackRead = {
                let read = await TaskStack.read(shown.card.item, model: model)
                return {
                    task = read.task ?? task
                    tree = read.tree
                    cards = read.cards
                }
            }
        }
        .transition(.opacity)
    }

    /// The lifted card as the calendar draws it now: its counter follows the subtasks written.
    private var card: BoardCard {
        let place = shown.card.item.place
        return model.snapshot?.timeline.slots.first { $0.card.item.place == place }?.card ?? shown.card
    }

    private static let width: CGFloat = 320
    /// The stack's bottom stays above the keyboard: no lower than this share of the screen.
    private static let highest: CGFloat = 0.5

    private func read() async {
        let read = await TaskStack.read(shown.card.item, model: model)
        task = read.task ?? task
        tree = read.tree
        cards = read.cards
    }
}
