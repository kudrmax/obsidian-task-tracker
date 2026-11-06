import Core
import SwiftUI

/// A card carried by the finger: long press lifts it, the rows part where it would land, and letting go drops it there —
/// on a list's gap, at a list's end, or on the calendar at a time. Let go anywhere else, it goes back untouched.
@MainActor
@Observable
final class CardDrag {
    struct Lifted: Equatable {
        let id: String
        let card: BoardCard
        var location: CGPoint
    }

    /// Where each card of a list is drawn on the screen, as the gaps between them read.
    struct Slot {
        let column: BoardColumn
        let index: Int
        let level: Int
        let frame: CGRect
    }

    private(set) var lifted: Lifted?
    private var slots: [String: Slot] = [:]
    private var columns: [BoardColumn: CGRect] = [:]
    /// The calendar on the screen, and the screen's y of its minute 0.
    private var timeline: (frame: CGRect, zero: CGFloat)?

    func place(_ id: String, _ slot: Slot) { slots[id] = slot }
    func place(_ column: BoardColumn, _ frame: CGRect) { columns[column] = frame }
    func placeTimeline(_ frame: CGRect, zero: CGFloat) { timeline = (frame, zero) }

    func move(_ card: BoardCard, to location: CGPoint) {
        if lifted?.id != card.id { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
        lifted = Lifted(id: card.id, card: card, location: location)
    }

    /// The card the rows part before while the finger is over it.
    var gapBefore: String? {
        guard let lifted else { return nil }
        return slots.first { $0.key != lifted.id && $0.value.frame.contains(lifted.location) }?.key
    }

    func drop(on model: BoardModel) async {
        guard let lifted else { return }
        let at = lifted.location
        defer { self.lifted = nil }
        if let (id, slot) = slots.first(where: { $0.key != lifted.id && $0.value.frame.contains(at) }) {
            _ = id
            await model.drop(lifted.id, in: slot.column, before: slot.index, level: slot.level)
        } else if let timeline, timeline.frame.contains(at) {
            await model.drop(lifted.id, atMinute: Double((at.y - timeline.zero) / CardMetrics.hour * 60), hourHeight: CardMetrics.hour)
        } else if let (column, _) = columns.first(where: { $0.value.contains(at) }) {
            await model.drop(lifted.id, in: column, before: .max, level: 0)
        }
    }
}

extension View {
    /// Lifts `card` on a long press and carries it with the finger; the drop is `drag`'s.
    func carries(_ card: BoardCard, with drag: CardDrag, model: BoardModel) -> some View {
        highPriorityGesture(
            LongPressGesture(minimumDuration: 0.25)
                .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .global))
                .onChanged { value in
                    if case .second(true, let moved) = value, let moved { drag.move(card, to: moved.location) }
                }
                .onEnded { _ in Task { await drag.drop(on: model) } }
        )
    }

    /// Tells `drag` where this card stands, so a drop over it lands before it.
    func dragSlot(_ card: BoardCard, column: BoardColumn, index: Int, drag: CardDrag) -> some View {
        onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
            drag.place(card.id, CardDrag.Slot(column: column, index: index, level: card.level, frame: frame))
        }
    }
}

/// The lifted card under the finger: a little larger, with a shadow, over everything.
struct LiftedCard: View {
    let drag: CardDrag

    var body: some View {
        GeometryReader { box in
            if let lifted = drag.lifted {
                let origin = box.frame(in: .global).origin
                TaskCapsule(card: lifted.card)
                    .frame(width: box.size.width / 2 - CardMetrics.columnInset * 2)
                    .scaleEffect(1.04)
                    .shadow(color: .black.opacity(0.45), radius: 17, y: 14)
                    .position(x: lifted.location.x - origin.x, y: lifted.location.y - origin.y)
                    .allowsHitTesting(false)
            }
        }
        .ignoresSafeArea()
    }
}
