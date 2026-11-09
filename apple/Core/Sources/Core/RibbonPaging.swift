/// The ribbon of lists (Inbox, Soon, Today) paged by the finger: one swipe moves it one place at most, as the plugin's
/// screen swipe. Where it lands is the core's (`rules.swipeLanding`); this type only keeps that answer to the places
/// next to the one the swipe started from, whatever the answer, the glide or the finger's speed.
public struct RibbonPaging: Sendable, Equatable {
    /// Where each place's left edge stands in the ribbon, left to right.
    public let stops: [Double]

    public init(stops: [Double]) {
        self.stops = stops
    }

    /// The place nearest `offset`.
    public func nearest(_ offset: Double) -> Int {
        stops.indices.min { abs(stops[$0] - offset) < abs(stops[$1] - offset) } ?? 0
    }

    /// The place a swipe starts from, fixed when the finger touches the ribbon: the place a running glide is headed to,
    /// else the place nearest where the ribbon stands.
    public func start(at offset: Double, gliding headedTo: Int?) -> Int {
        if let headedTo, stops.indices.contains(headedTo) { return headedTo }
        return nearest(offset)
    }

    /// How far the finger may draw the ribbon: no further than the places next to `from`.
    public func clamp(_ offset: Double, from: Int) -> Double {
        let low = stops[max(0, from - 1)]
        let high = stops[min(stops.count - 1, from + 1)]
        return min(high, max(low, offset))
    }

    /// The place a swipe started at `from` lands on, let go at `offset` with `speed` (points per millisecond, onward
    /// positive): `rule` is the core's `swipeLanding(moved, distance, speed)`; its answer is kept to one place either way.
    public func landing(from: Int, offset: Double, speed: Double, rule: (_ moved: Double, _ distance: Double, _ speed: Double) -> Int) -> Int {
        let moved = offset - stops[from]
        let next = moved > 0 ? from + 1 : from - 1
        guard moved != 0, stops.indices.contains(next) else { return from }
        let shift = rule(moved, abs(stops[next] - stops[from]), speed)
        let onward = shift == 0 ? from : next
        return min(stops.count - 1, max(0, onward))
    }
}
