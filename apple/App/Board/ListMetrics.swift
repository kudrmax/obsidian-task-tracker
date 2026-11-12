import Core
import SwiftUI

/// How tall each of the Rows view's lists stands: measured from the rows the screen read (their known heights), never
/// from what a list reports back after it is drawn, so no list's height feeds on its own layout. While a card or the plus
/// is carried, or the typed tasks are written, the heights hold where they are: a carry's room scrolls inside its list
/// instead of pushing the lists below it; let go, the heights the screen now needs come in one motion. A list that
/// shrinks waits for its leaving card to fade first, then slides; one that grows slides with its cards.
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
            apply(measured)
        }
    }

    /// The heights that grow now, in the drawing's own motion; the ones that shrink after the card leaving has faded.
    private func apply(_ measured: [BoardColumn: StackedList]) {
        let shrinks = measured.contains { column, list in (lists[column]?.wanted ?? 0) > list.wanted }
        guard shrinks else { return lists = measured }
        var growing = lists
        for (column, list) in measured where (lists[column]?.wanted ?? 0) <= list.wanted { growing[column] = list }
        lists = growing
        shrinking += 1
        let mine = shrinking
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.fadeFirst) { [weak self] in
            guard let self, self.shrinking == mine, !self.held else { return }
            withAnimation(.snappy) { self.lists = measured }
        }
    }

    @ObservationIgnored private var shrinking = 0
    /// How long a leaving card takes to fade, before its list closes over it.
    private static let fadeFirst: TimeInterval = 0.2

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
    /// The list a task is typed in and the room its field and typed lines take: it grows by them while every list still
    /// fits; when the lists share the room it keeps its height and the field scrolls inside it.
    var typed: (index: Int, room: Double)? = nil
    let gap: CGFloat
    let share: @Sendable (_ lists: [StackedList], _ room: Double) -> [Double]

    init(lists: [StackedList], gap: CGFloat, share: @escaping @Sendable (_ lists: [StackedList], _ room: Double) -> [Double], typed: (index: Int, room: Double)? = nil) {
        self.typed = typed
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
        let still = shared(room: room, cache: &cache)
        guard let typed, lists.indices.contains(typed.index) else { return still }
        let gaps = gap * CGFloat(max(0, lists.count - 1))
        let grown = lists.enumerated().map { $0.offset == typed.index ? $0.element.wanted + typed.room : $0.element.wanted }
        guard grown.reduce(0, +) <= Double(room - gaps) else { return still }
        return grown.map { CGFloat($0) }
    }

    private func shared(room: CGFloat, cache: inout Cache) -> [CGFloat] {
        if cache.room == room, cache.lists == lists { return cache.heights }
        let gaps = gap * CGFloat(max(0, lists.count - 1))
        let shared = share(lists, Double(max(0, room - gaps)))
        cache.room = room
        cache.lists = lists
        cache.heights = shared.count == lists.count ? shared.map { CGFloat($0) } : lists.map { CGFloat($0.wanted) }
        return cache.heights
    }

}
