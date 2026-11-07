import Foundation

/// How the screen moves from one drawing to the next: chosen by what differs between the two, never by who asked for the
/// read (a drop, Sync, a return to the app, Undo all move the same change the same way).
public enum BoardMotion: Equatable, Sendable {
    /// Nothing the screen draws differs, or there was nothing drawn before: drawn as it is.
    case still
    /// Another day: the day list and the calendar slide in from the side of the day's direction.
    case turn(forward: Bool)
    /// Cards came, went, moved or changed: each by its id slides, folds away or unfolds in one transaction.
    case change
}

extension BoardSnapshot {
    /// The motion from `old`, the drawing on the screen, to this one.
    public func motion(from old: BoardSnapshot?) -> BoardMotion {
        guard let old else { return .still }
        if old.day != day { return .turn(forward: day > old.day) }
        return old.lists == lists && old.timeline == timeline ? .still : .change
    }
}

/// The end of a carry, one owner for every way it ends: the carried copy must have landed (a drop's flight, a cancel's
/// flight home, or none at all) and, when the drop wrote, the screen must show the write. Only then is the place in the
/// list released and the card shown where the screen draws it.
public struct CarryEnd: Equatable, Sendable {
    public private(set) var landed = false
    public private(set) var drawn: Bool

    /// `writes`: the drop is written, so its end waits for the screen to draw the write too.
    public init(writes: Bool) {
        drawn = !writes
    }

    public var done: Bool { landed && drawn }

    /// The copy is in its place (or there was none to fly): true when the carry may end now.
    public mutating func land() -> Bool {
        landed = true
        return done
    }

    /// The screen shows the write (or the write failed and shows nothing): true when the carry may end now.
    public mutating func draw() -> Bool {
        drawn = true
        return done
    }
}
