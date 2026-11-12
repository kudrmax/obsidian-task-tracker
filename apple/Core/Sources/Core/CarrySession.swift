import Foundation

/// The core's calls a carry to a project makes (`docs/door.md`, «The carry to a project»), as `TaskBoard` answers them.
public protocol CarryCalls: Sendable {
    func startCarry(keys: [TaskKey], cards: [JSONValue], plus: Bool, wide: Bool) throws
    func carryAt(edge: Bool, node: String?, now: Date) throws -> Double?
    func carryOnNode(_ node: String) throws
    func endCarry(_ how: String) throws
    func endProjectName() throws
}

extension TaskBoard: CarryCalls {}

/// The clock a carry waits on: the moment now, and a pause that can be called off.
@MainActor
public protocol CarryClock {
    func now() -> Date
    /// Runs `work` after `ms` milliseconds unless the returned call-off runs first.
    func after(ms: Double, _ work: @escaping @MainActor () -> Void) -> () -> Void
}

/// The device's own clock.
@MainActor
public struct SystemCarryClock: CarryClock {
    public init() {}

    public func now() -> Date { Date() }

    public func after(ms: Double, _ work: @escaping @MainActor () -> Void) -> () -> Void {
        let item = DispatchWorkItem { MainActor.assumeIsolated { work() } }
        DispatchQueue.main.asyncAfter(deadline: .now() + max(0, ms) / 1000, execute: item)
        return { item.cancel() }
    }
}

/// One carry of a card, a calendar block or the plus as the core keeps it: lifted, the finger reported at the screen's
/// edge or over a panel row whenever that changes and again once the pause the core answers is over, let go somewhere.
/// Every call to the core runs off the main thread, one after another in the order they were made, so a later report
/// never overtakes an earlier one and the session's end comes after them all.
@MainActor
public final class CarrySession {
    /// How a carry ends, as `tasks.endCarry` takes it; `closed`: `carryOnNode` ended it already.
    public enum End: String, Sendable {
        case dropped, nowhere, naming, closed
    }

    /// Where the finger is, as the core is told: within the left edge, over a panel row's node.
    public struct Spot: Equatable, Sendable {
        public let edge: Bool
        public let node: String?

        public init(edge: Bool, node: String?) {
            self.edge = edge
            self.node = node
        }
    }

    private let calls: any CarryCalls
    private let clock: any CarryClock
    /// The screen read again: after a pause brought the panel out or opened a row, after a drop on a row, after an end
    /// that changed the view.
    private let redraw: @MainActor () async -> Void
    private let problem: @MainActor (Error) -> Void

    public private(set) var isOpen = false
    private var end: End?
    private var reported: Spot?
    private var callOff: (() -> Void)?
    private var chain: Task<Void, Never>?

    public init(calls: any CarryCalls, clock: any CarryClock, redraw: @escaping @MainActor () async -> Void, problem: @escaping @MainActor (Error) -> Void) {
        self.calls = calls
        self.clock = clock
        self.redraw = redraw
        self.problem = problem
    }

    /// A carry lifted: the funnel's tasks by their keys, the By project list's cards by their drops, or the plus.
    public func start(keys: [TaskKey], cards: [JSONValue] = [], plus: Bool = false) {
        isOpen = true
        end = nil
        reported = nil
        stopWaiting()
        enqueue(redraw: false) { try $0.startCarry(keys: keys, cards: cards, plus: plus, wide: false) }
    }

    /// The finger at `spot`: the core is told when it differs from what it was told last.
    public func moved(to spot: Spot) {
        guard isOpen, spot != reported else { return }
        report(spot, waited: false)
    }

    /// Let go nowhere, flown home or cancelled: the session ends `nowhere` (the core puts the lift's filter back).
    public func wentNowhere() {
        if end == nil { end = .nowhere }
    }

    /// The plus let go in the tree: the session ends `naming`, the panel kept while the name is typed.
    public func naming() {
        end = .naming
    }

    /// Let go on a panel row: every carried task goes to that project; the session ends with it.
    public func onNode(_ node: String) {
        end = .closed
        enqueue(redraw: true) { try $0.carryOnNode(node) }
    }

    /// The carry over, its copy down: the core told how it ended, unless a drop on a row ended it already. Returns how.
    @discardableResult
    public func close() -> End? {
        guard isOpen else { return nil }
        isOpen = false
        stopWaiting()
        reported = nil
        let how = end ?? .dropped
        end = nil
        guard how != .closed else { return how }
        enqueue(redraw: how != .dropped) { try $0.endCarry(how.rawValue) }
        return how
    }

    /// The new project's name answered or cancelled: the panel the naming kept out goes.
    public func endProjectName() {
        enqueue(redraw: true) { try $0.endProjectName() }
    }

    /// Every call made so far has answered.
    public func idle() async {
        await chain?.value
    }

    private func report(_ spot: Spot, waited: Bool) {
        reported = spot
        stopWaiting()
        let calls = calls
        let now = clock.now()
        let before = chain
        chain = Task { [weak self] in
            await before?.value
            let wait: Double?
            do {
                wait = try await Task.detached { try calls.carryAt(edge: spot.edge, node: spot.node, now: now) }.value
            } catch {
                self?.problem(error)
                return
            }
            guard let self, self.isOpen, self.reported == spot else { return }
            if waited { await self.redraw() }
            guard let wait, self.isOpen, self.reported == spot else { return }
            self.callOff = self.clock.after(ms: wait) { [weak self] in
                guard let self, self.isOpen, self.reported == spot else { return }
                self.report(spot, waited: true)
            }
        }
    }

    private func stopWaiting() {
        callOff?()
        callOff = nil
    }

    private func enqueue(redraw: Bool, _ call: @escaping @Sendable (any CarryCalls) throws -> Void) {
        let calls = calls
        let before = chain
        chain = Task { [weak self] in
            await before?.value
            do {
                try await Task.detached { try call(calls) }.value
            } catch {
                self?.problem(error)
            }
            if redraw { await self?.redraw() }
        }
    }
}
