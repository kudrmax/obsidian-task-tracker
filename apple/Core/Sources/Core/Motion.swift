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

/// The phases of the board's own drag, one carry at a time: idle → lifted → carrying → landing → idle. A carry is
/// lifted by a long press (the plus at once), carried by every move of the finger, let go (into its place, home, or into
/// the field the plus opens), and is idle again only when its copy is down. Every step names its carry: a step of a carry
/// that is no longer under way changes nothing, so a late signal (a gesture's end heard after the landing) ends nothing of
/// the next carry, and a carry lands exactly once.
public struct CarryFlow: Equatable, Sendable {
    public enum Phase: Equatable, Sendable {
        case idle
        case lifted(Int)
        case carrying(Int)
        case landing(Int)
    }

    public private(set) var phase: Phase = .idle
    private var last = 0

    public init() {}

    /// The carry under way, in any phase but idle.
    public var current: Int? {
        switch phase {
        case .idle: nil
        case .lifted(let token), .carrying(let token), .landing(let token): token
        }
    }

    /// A press may lift now: nothing is carried, or the last copy is only settling (it is set down as the new carry lifts).
    /// Read only: asking changes nothing, so a press that is then refused leaves the landing copy as it was.
    public var mayLift: Bool {
        switch phase {
        case .idle, .landing: true
        case .lifted, .carrying: false
        }
    }

    /// The carry whose copy is still settling, if any.
    public var settling: Int? {
        if case .landing(let token) = phase { token } else { nil }
    }

    /// A lift: a new carry's token, or nil while another carry is under way (a press during a landing lifts nothing).
    public mutating func lift() -> Int? {
        guard phase == .idle else { return nil }
        last += 1
        phase = .lifted(last)
        return last
    }

    /// The finger moved: true when `token` is lifted or carried, which it is now.
    public mutating func move(_ token: Int) -> Bool {
        switch phase {
        case .lifted(token), .carrying(token):
            phase = .carrying(token)
            return true
        default:
            return false
        }
    }

    /// Let go (or cancelled): true when `token` was lifted or carried; its copy flies now.
    public mutating func letGo(_ token: Int) -> Bool {
        switch phase {
        case .lifted(token), .carrying(token):
            phase = .landing(token)
            return true
        default:
            return false
        }
    }

    /// The copy of `token` is down: true once, when it was landing; the board is idle again.
    public mutating func landed(_ token: Int) -> Bool {
        guard phase == .landing(token) else { return false }
        phase = .idle
        return true
    }
}

/// How a list or the calendar scrolls under a carry held at its edge: faster the nearer the edge, by the second (so a
/// 120 Hz screen scrolls as far in a second as a 60 Hz one), and not at all where it can go no further that way.
public struct EdgeScrollStep: Equatable, Sendable {
    /// How deep the band at each edge is, in points.
    public let band: Double
    /// The most it scrolls in a second, at the very edge.
    public let speed: Double

    public init(band: Double, speed: Double) {
        self.band = band
        self.speed = speed
    }

    /// Points a second, up (negative) at the top band or down at the bottom one, for a finger `fromTop` below the area's
    /// top and `fromBottom` above its visible bottom; zero between the bands.
    public func velocity(fromTop: Double, fromBottom: Double) -> Double {
        if fromTop < band, fromTop > -band { return -speed * min(1, 1 - fromTop / band) }
        if fromBottom < band { return speed * min(1, 1 - fromBottom / band) }
        return 0
    }

    /// The offset after `elapsed` seconds at `velocity`, kept within `least`…`most`; nil where it can't move that way (the
    /// scroll has reached its end), so the display link stops.
    public static func next(offset: Double, velocity: Double, elapsed: Double, least: Double, most: Double) -> Double? {
        guard velocity != 0 else { return nil }
        let top = max(least, most)
        if velocity < 0, offset <= least + 0.5 { return nil }
        if velocity > 0, offset >= top - 0.5 { return nil }
        return min(max(least, offset + velocity * max(0, elapsed)), top)
    }
}

/// The screen a drop would leave, worked out off the main thread while the carry is held over a place, so the let-go
/// finds it ready instead of asking the core in the frame the finger lifts. One piece of work at a time, the latest asked
/// waiting after it (a carry passes many places; the ones passed over are never worked out); a let-go on the place under
/// way waits only for its rest.
public final class Prefetch<Key: Hashable & Sendable, Value: Sendable>: @unchecked Sendable {
    private let lock = NSCondition()
    private let queue: DispatchQueue
    private var running: Key?
    private var next: (key: Key, work: @Sendable () -> Value?)?
    /// The last pieces worked out, the newest last: a finger back over a place it passed finds it ready.
    private var done: [(key: Key, value: Value?)] = []
    private static var kept: Int { 4 }

    public init(label: String) {
        queue = DispatchQueue(label: label, qos: .userInitiated)
    }

    /// `key`'s value is wanted: worked out now, or after the piece under way, replacing any other waiting.
    public func want(_ key: Key, _ work: @escaping @Sendable () -> Value?) {
        lock.lock()
        defer { lock.unlock() }
        guard running != key, !done.contains(where: { $0.key == key }), next?.key != key else { return }
        next = (key, work)
        guard running == nil else { return }
        startNext()
    }

    /// `key`'s value: ready, or waited for when it is the piece under way; nil when it was never asked or went by (the
    /// caller works it out itself).
    public func take(_ key: Key) -> Value? {
        lock.lock()
        defer { lock.unlock() }
        while running == key { lock.wait() }
        return done.last { $0.key == key }?.value ?? nil
    }

    /// Nothing wanted any more (the carry ended): what is waiting is dropped, what is ready forgotten.
    public func clear() {
        lock.lock()
        next = nil
        done = []
        lock.unlock()
    }

    private func startNext() {
        guard let (key, work) = next else { return }
        next = nil
        running = key
        queue.async { [self] in
            let value = work()
            lock.lock()
            done.append((key, value))
            if done.count > Self.kept { done.removeFirst(done.count - Self.kept) }
            running = nil
            lock.broadcast()
            startNext()
            lock.unlock()
        }
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
        floor = max(floor, started + 1)
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
