import Core
import SwiftUI

/// How tall each of the Rows view's lists stands: measured from the rows the screen read (their known heights), never
/// from what a list reports back after it is drawn, so no list's height feeds on its own layout. While a card or the plus
/// is carried or a task is typed the heights hold where they are: a carry's room or the field scrolls inside its list
/// instead of pushing the lists below it; let go, the heights the screen now needs come in one motion.
@MainActor
@Observable
final class ListMetrics {
    private(set) var lists: [BoardColumn: StackedList] = [:]
    @ObservationIgnored private var waiting: [BoardColumn: StackedList]?

    /// A carry or a field holds the heights.
    @ObservationIgnored var held = false {
        didSet {
            guard !held, let waiting else { return }
            self.waiting = nil
            withAnimation(.snappy) { lists = waiting }
        }
    }

    /// The heights the read `snapshot` needs, set in the transaction it is drawn in, or kept until a hold ends.
    func measure(_ snapshot: BoardSnapshot) {
        var measured: [BoardColumn: StackedList] = [:]
        for (column, list) in snapshot.lists {
            measured[column] = Self.measure(list, plate: snapshot.funnel.view.plate(column.rawValue))
        }
        if held {
            waiting = measured
        } else if measured != lists {
            lists = measured
        }
    }

    /// A list as the Rows view draws it: its small title, then each section's header, its No tasks plate, its cards; a
    /// list with no row draws the core's plate (`ViewChoice.plates`).
    static func measure(_ list: BoardList, plate: String?) -> StackedList {
        var rows: [DrawnRow] = []
        for group in list.groups {
            if let header = group.header { rows.append(.header(group, header)) }
            if group.empty { rows.append(.plate(group)) }
            rows += group.cards.map(DrawnRow.card)
        }
        if rows.isEmpty, let plate { rows.append(.vacant(plate)) }
        var previous: DrawnRow?
        let measured = rows.map { row in
            defer { previous = row }
            let card: Bool = if case .card = row { true } else { false }
            return StackedList.Row(height: Double(row.height ?? CardMetrics.height), top: Double(DrawnRow.top(of: row, after: previous)), card: card)
        }
        return StackedList.measuring(head: Double(Self.head), rows: measured)
    }

    /// A stacked list's title row: the stage's small heading and the gap under it.
    static let head = ColumnMetrics.groupHead + ColumnMetrics.headGap
}

/// The Rows view's lists one under another: each as tall as it is while all fit, else as the core shares the room
/// (`rules.stackedLists`), a list that scrolls ending under a whole card and the fade. The heights are worked out once
/// for each room and set of measures, and every list is laid out at its own; nothing is measured back from the lists.
struct StackedRowsLayout: SwiftUI.Layout {
    let lists: [StackedList]
    let gap: CGFloat
    let share: (_ lists: [StackedList], _ room: Double) -> [Double]

    init(lists: [StackedList], gap: CGFloat, share: @escaping (_ lists: [StackedList], _ room: Double) -> [Double]) {
        self.lists = lists
        self.gap = gap
        self.share = share
    }

    struct Cache {
        var room: CGFloat = -1
        var lists: [StackedList] = []
        var heights: [CGFloat] = []
    }

    func makeCache(subviews: Subviews) -> Cache { Cache() }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
        proposal.replacingUnspecifiedDimensions()
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) {
        let heights = heights(room: bounds.height, cache: &cache)
        var y = bounds.minY
        for (index, subview) in subviews.enumerated() {
            let height = heights[safe: index] ?? 0
            subview.place(at: CGPoint(x: bounds.minX, y: y), proposal: ProposedViewSize(width: bounds.width, height: height))
            y += height + gap
        }
    }

    private func heights(room: CGFloat, cache: inout Cache) -> [CGFloat] {
        if cache.room == room, cache.lists == lists { return cache.heights }
        let gaps = gap * CGFloat(max(0, lists.count - 1))
        let shared = share(lists, Double(max(0, room - gaps)))
        cache.room = room
        cache.lists = lists
        cache.heights = shared.count == lists.count ? shared.map { CGFloat($0) } : lists.map { CGFloat($0.wanted) }
        return cache.heights
    }

}
