import Foundation

/// A row of a list as a drop reads it, in the order the list draws its rows, the carried ones left out.
public enum DropRow: Equatable, Sendable {
    /// A card, at its depth, in its section (and its project's part in a list grouped by project).
    case card(level: Int, group: String?, zone: JSONValue?)
    /// A section's header (`group` as a place sees it: a name, or `{ group, project }`), or a project group's, which opens
    /// a part of the list.
    case head(group: JSONValue, opens: Bool)
    /// Anything else that takes a row: an empty section's plate, a typed line, the field.
    case other
}

/// Where a carry over a list lands: the system's drag gives the gap it opens as a row index, the finger's `x` the level;
/// the core's `rules.placeAt` reads them as a `GapPlace` over the rows laid out evenly, so every gap of every list, its
/// headers and empty sections among them, is a place, and a gap never reads as nothing.
public struct ListTarget: Sendable {
    public let rows: [DropRow]

    public init(rows: [DropRow]) {
        self.rows = rows
    }

    /// Each row's height in the even layout the place is read over.
    static let unit: Double = 100

    var cards: [PlacedCard] {
        rows.enumerated().compactMap { index, row in
            guard case .card(let level, let group, let zone) = row else { return nil }
            return PlacedCard(level: level, group: group, zone: zone, top: Double(index) * Self.unit, height: Self.unit)
        }
    }

    var heads: [PlacedHead] {
        var before = 0
        var heads: [PlacedHead] = []
        for (index, row) in rows.enumerated() {
            switch row {
            case .card: before += 1
            case .head(let group, let opens): heads.append(PlacedHead(group: group, opens: opens, firstCard: before, top: Double(index) * Self.unit, height: Self.unit))
            case .other: break
            }
        }
        return heads
    }

    /// The finger at the gap before row `gap` (`rows.count`: after the last): just past the rows above it, never past a
    /// header below it, so a gap under a header is in that header's section and a gap over one ends the section before.
    func y(at gap: Int) -> Double {
        Double(min(max(0, gap), rows.count)) * Self.unit + 1
    }

    /// The core's `GapPlace` for the gap before row `gap`, the finger asking for `level` (fractional, `rules.levelAt`).
    public func place(at gap: Int, level: Double, board: TaskBoard) throws -> JSONValue {
        try board.placeAt(cards, y: y(at: gap), level: level, shift: 0, room: .null, heads: heads, held: .null, hysteresis: 0)
    }
}

extension ListTarget {
    /// The gap a row carried within its own list stands in: the rows (`others`, by their middles as the list lays them out
    /// now) whose middle is above the carried row's middle. Over its own row the system names the row's place in the data,
    /// not where it now stands; where the list lays it out says it.
    public static func gap(holding middle: Double, among others: [Double]) -> Int {
        others.filter { $0 < middle }.count
    }
}

