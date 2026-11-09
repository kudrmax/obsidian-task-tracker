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

/// Who ends a carry, whatever order its signals come in: the card's drag session ("dropped", or home after a cancel),
/// the board's drop session (performed or not, ended), the copy landing and the write drawn. Every method answers whether
/// the carry ends now, and a carry ends exactly once: after `true` every signal answers `false`. A section is carried by
/// the board's session alone; a card's cancel is ended by its own copy coming home (`landed`).
public struct CarryLife: Equatable, Sendable {
    public enum Kind: Sendable { case card, section, plus }

    public let kind: Kind
    /// How it ends once let go: the copy's landing and, when it writes, the write drawn.
    public private(set) var end: CarryEnd?
    public private(set) var finished = false
    /// The card said its drop was taken while the board's session for it was still open: the board's end decides.
    private var droppedWhileBoardOpen = false

    public init(kind: Kind) {
        self.kind = kind
    }

    /// Let go: the first one says how it ends (a drop that writes, or none); later ones change nothing. True when this
    /// call let it go.
    @discardableResult
    public mutating func letGo(writes: Bool) -> Bool {
        guard !finished, end == nil else { return false }
        end = CarryEnd(writes: writes)
        return true
    }

    public var released: Bool { end != nil }

    /// The copy came down (a drop's flight, a cancel's flight home, or a session that ended with nothing flying).
    public mutating func landed() -> Bool {
        letGo(writes: false)
        guard var current = end else { return false }
        let done = current.land()
        end = current
        return ending(done)
    }

    /// The drop's write is drawn, or failed and draws nothing.
    public mutating func drawn() -> Bool {
        guard var current = end else { return false }
        let done = current.draw()
        end = current
        return ending(done)
    }

    /// The card's drag session ended with a drop. A drop the board took already let it go: its landing ends it. While the
    /// board still has a session for it (UIKit may hand the board the drop after the card's end), the board's end
    /// decides. Otherwise another receiver took it (a field, another app): it ends now, nothing written here.
    public mutating func cardDropped(boardOpen: Bool) -> Bool {
        guard !finished, end == nil else { return false }
        if boardOpen {
            droppedWhileBoardOpen = true
            return false
        }
        return landed()
    }

    /// The board's drop session for it ended. Performed: its drop let it go, the landing ends it. Not performed: a cancel,
    /// whose card ends it once its copy is home, unless the card said it was dropped elsewhere or it is a section, which
    /// has no end of its own.
    public mutating func boardEnded(performed: Bool) -> Bool {
        guard !finished else { return false }
        if !performed, !droppedWhileBoardOpen, kind == .card { return false }
        return landed()
    }

    /// Ended at once from outside (a new lift, the plus become a field): true unless it had ended already.
    public mutating func finish() -> Bool { ending(true) }

    private mutating func ending(_ done: Bool) -> Bool {
        guard done, !finished else { return false }
        finished = true
        return true
    }
}

/// `LandingSpan`: a block of the day's timeline after a drop, by its task's id.
public struct LandingSpan: Decodable, Sendable, Hashable {
    public let id: String
    public let span: DaySpan
}

/// `DropLanding` (`tasks.landing`): where the core will leave a dropped task, asked at the drop before its write, so the
/// carried copy flies straight there.
public struct DropLanding: Decodable, Sendable {
    public let kind: String
    public let id: String
    public let item: TaskItem?
    /// A block of the day's timeline: its span as shown (on the now line when `ridesNow`), and every block of the day.
    public let span: DaySpan?
    public let ridesNow: Bool?
    public let slotted: [LandingSpan]?
    /// A card of a column: its section and its index among that section's tasks there, in the file's order.
    public let column: String?
    public let group: String?
    public let index: Int?
    /// In a list drawn in project parts: the part it is drawn in, the section there and its index among that section's
    /// cards in the part.
    public let part: LandingPart?
    /// A subtask: its parent's id, and its index among the parent's open subtasks.
    public let parent: String?
}

/// The project part a card lands in (`LandingPart`): the part's key and zone, its section and index there.
public struct LandingPart: Decodable, Sendable, Equatable {
    public let key: String
    public let zone: JSONValue
    public let section: String?
    public let index: Int
    /// The part is folded: its cards are not drawn, the card lands under its header.
    public let folded: Bool?
}

/// Where a landed card stands among a column's cards without the carried ones: before card `at`, at `level`, in `group`.
public struct LandingGap: Equatable, Sendable {
    public let at: Int
    public let level: Int
    public let group: String?
    /// The project's part it opens in, in a list grouped by project; nil in a plain list.
    public let zone: JSONValue?

    public init(at: Int, level: Int, group: String?, zone: JSONValue? = .none) {
        self.at = at
        self.level = level
        self.group = group
        self.zone = zone
    }
}

extension DropLanding {
    /// The room the landed card takes in `column`, among `others` (the column's cards without the carried ones, in their
    /// drawing order); nil when it lands elsewhere.
    public func gap(in column: BoardColumn, among others: [BoardCard]) -> LandingGap? {
        switch kind {
        case "list":
            // Into a folded part no room opens: nothing of it is drawn.
            guard self.column == column.rawValue, part?.folded != true else { return nil }
            // A list drawn in project parts: the core names the part and the place in it; a plain list counts in file order.
            let section = part.map(\.section) ?? group
            let zone: JSONValue? = part.map { .some($0.zone) } ?? .none
            guard let index = part?.index ?? index else { return nil }
            let here = { (card: BoardCard) in card.item.group == section && (zone == nil || card.zone == zone) }
            let tops = others.indices.filter { others[$0].level == 0 && here(others[$0]) }
            if let at = tops[safe: index] { return LandingGap(at: at, level: 0, group: section, zone: zone) }
            let end = others.indices.last { here(others[$0]) }.map { $0 + 1 } ?? others.count
            return LandingGap(at: end, level: 0, group: section, zone: zone)
        case "subtask":
            guard let parent, let index, let at = others.firstIndex(where: { $0.id == parent }) else { return nil }
            let level = others[at].level + 1
            var end = at + 1
            var children: [Int] = []
            while end < others.count, others[end].level >= level {
                if others[end].level == level { children.append(end) }
                end += 1
            }
            let part: JSONValue? = if case .some(let zone) = others[at].zone { .some(zone) } else { .none }
            return LandingGap(at: children[safe: index] ?? end, level: level, group: others[at].item.group, zone: part)
        default:
            return nil
        }
    }
}

extension TaskBoard {
    /// Where `tasks.drop` with the same arguments will leave each task, over the text `snapshot` was drawn from: asked
    /// in the frame of the drop, it reads no file and never waits for a read on another thread. Nothing is written.
    public func landing(_ tasks: JSONValue, to: JSONValue, over snapshot: BoardSnapshot, now: Date = Date()) throws -> [DropLanding] {
        try answer("tasks.landing", [tasks, to, .string(snapshot.day)], drawnFrom: snapshot.tasksText, settingsJSON: snapshot.settingsJSON, now: now).decode([DropLanding].self)
    }

    /// The box a timeline landing's card takes in the stack the core lays out with the day's blocks after the drop.
    public func box(of landing: DropLanding, events: [BoardEvent], measures: TimelineMeasures) throws -> StackBox? {
        guard landing.kind == "timeline", let slotted = landing.slotted, let at = slotted.firstIndex(where: { $0.id == landing.id }) else { return nil }
        let taskSpans = JSONValue.array(slotted.map { ["start": .number(Double($0.span.start)), "end": $0.span.end.map { .number(Double($0)) } ?? .null] })
        let eventSpans = JSONValue.array(events.map { ["start": .number(Double($0.start)), "end": .number(Double($0.end)), "level": .number(Double($0.level))] })
        let boxes: [StackBox] = try rule("rules.stackTasks", [taskSpans, eventSpans, .number(measures.hour), measures.card, measures.insets])
        return boxes[safe: at]
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
