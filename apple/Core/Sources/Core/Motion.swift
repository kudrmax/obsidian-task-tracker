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

/// The carries of the board, each a drag session of the system's: a carry begins when its session does and ends when that
/// session ends, the one signal the system gives once per session. A session still ending (its copy settling) when the
/// next lift begins ends nothing of the next one.
public struct CarryTurns: Equatable, Sendable {
    public private(set) var current: Int?
    private var last = 0

    public init() {}

    /// A new carry: its token, which its end names.
    public mutating func begin() -> Int {
        last += 1
        current = last
        return last
    }

    /// The session of carry `token` ended: true when it was the carry under way, which ends now, once.
    public mutating func end(_ token: Int) -> Bool {
        guard current == token else { return false }
        current = nil
        return true
    }
}

/// Which reads may draw while drops are written: the screen a drop's preview drew stands until a read started after the
/// drop's write, which shows the file with it. A read started earlier would draw the file from before the drop.
public struct DropReads: Equatable, Sendable {
    private var writing = 0
    private var floor = 0

    public init() {}

    /// A drop's preview is drawn: its write is under way.
    public mutating func previewDrawn() {
        writing += 1
    }

    /// The drop's write is made (or failed) when `started` reads had begun: only a read begun after it may draw.
    public mutating func written(readsStarted started: Int) {
        writing = max(0, writing - 1)
        floor = started + 1
    }

    /// The read numbered `serial` (counted as each begins) may draw.
    public func mayDraw(_ serial: Int) -> Bool {
        writing == 0 && serial >= floor
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
