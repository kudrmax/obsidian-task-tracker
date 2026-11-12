import Core
import SwiftUI
import UIKit
import os

/// What a carry lifts: where its copy starts on the screen, the copy itself, and how to begin the model's carry.
@MainActor
struct Lift {
    /// What is carried; nil: the plus, a task not written yet.
    let payload: DragPayload?
    /// The copy the finger carries, drawn as the thing lifted.
    let copy: UIView
    /// Where the copy starts, in the window.
    let frame: CGRect
    /// The copy rises off the board as the system lifts a view (a little larger, a shadow); the plus moves as it is.
    var rises = true
    /// The copy is a card as it was drawn: it lands as the card drawn where it lands.
    var card = false
    /// Begins the model's carry: its token, which its end names.
    let begin: () -> Int
    /// Where the thing lifted stands now, in the window: a carry that writes nothing flies back there.
    let home: () -> CGRect?
}

/// Where a let-go lands, in the window: the copy flies there and gives way to the card drawn there.
struct CarryLanding {
    var rect: CGRect
    /// Into a row of the Projects page's tree: the copy shrinks into the middle of it and is gone.
    var folds = false
    /// The plus taken by a place: the copy becomes the field that opens there.
    var opens = false
    /// On the calendar: the card lands as a block of its stack.
    var onCalendar = false
    /// Written, but the card it lands as shows nowhere on the screen: the copy fades where it was let go.
    var vanishes = false

    /// The copy fades where it is.
    static let away = CarryLanding(rect: .null, vanishes: true)
}

/// The place a carry let go on the cancel target: the plus's slot while anything is carried.
@MainActor
protocol CancelTarget: AnyObject {
    var area: CGRect? { get }
    func hold(_ held: Bool)
}

/// The board's one drag: lift, carry and drop of a card, a section, picked tasks and the plus, as one state machine
/// (`CarryFlow`: idle → lifted → carrying → landing → idle). The copy and the purple drop line are the app's own, in one
/// layer over the whole window, the line over the copy. Every move of the finger is routed to exactly one place
/// (`BoardRoute`); held near a list's or the calendar's edge, it scrolls; held over a day arrow, the day turns. Let go, the
/// screen after the drop is drawn in the same animation the copy flies in, and the card shows in the frame the copy lands.
@MainActor
final class DragController {
    private weak var model: BoardModel?
    let route: BoardRoute
    weak var cancelTarget: (any CancelTarget)?
    private var flow = CarryFlow()
    private let layer = CarryLayer()

    private struct Live {
        let token: Int
        let carry: Int
        let payload: DragPayload?
        let copy: CarryCopy
        let grip: CGPoint
        let home: () -> CGRect?
        var point: CGPoint
        var cancelling = false
        /// Where the copy rides against the finger.
        var ride = CopyRide.held
    }

    private var live: Live?

    init(model: BoardModel, route: BoardRoute) {
        self.model = model
        self.route = route
    }

    /// Nothing is carried: a press may lift (a copy still settling is set down by the lift itself, never by asking).
    var mayLift: Bool { flow.mayLift }

    // MARK: Lift

    /// A long press lifted `lift` with the finger at `point` (window): the copy stands where it was, rises, and the carry
    /// begins. False while another carry still lands.
    @discardableResult
    func lift(_ lift: Lift, at point: CGPoint, in window: UIWindow) -> Bool {
        // A press is recognized only after the long press's delay, by when the last copy has all but landed: it is set
        // down at once, so the next card lifts the moment the finger asks.
        if flow.settling != nil, let live { landed(live) }
        guard let carry = flow.lift() else { return false }
        let token = lift.begin()
        let copy = CarryCopy(content: lift.copy, frame: lift.frame, style: window.traitCollection.userInterfaceStyle, card: lift.card)
        timing.begin()
        route.window = window
        layer.attach(to: window)
        layer.carry(copy)
        // While carried, no other touch reaches the board: no menu, no tab, no day arrow, no pick.
        layer.blocksTouches = true
        live = Live(token: token, carry: carry, payload: lift.payload, copy: copy, grip: CGPoint(x: point.x - lift.frame.midX, y: point.y - lift.frame.midY), home: lift.home, point: point)
        if lift.rises {
            CarryFeel.lift()
            UIView.animate(springDuration: CarryMotion.rise, bounce: 0, options: [.allowUserInteraction, .beginFromCurrentState]) { copy.rise() }
        }
        return true
    }

    // MARK: Carry

    /// The finger moved to `point` (window; the first finger's, never the middle of two): the copy follows it; the place under it shows its line, the cancel target fills
    /// under it; held at an edge the list or calendar scrolls, over a day arrow the day turns.
    func move(to point: CGPoint) {
        timing.measure { carry(to: point) }
    }

    private func carry(to point: CGPoint) {
        guard var live, flow.move(live.carry) else { return }
        live.point = point
        let cancelling = cancelTarget?.area?.contains(point) == true
        if cancelling != live.cancelling { cancelTarget?.hold(cancelling) }
        live.cancelling = cancelling
        self.live = live
        if cancelling {
            route.carryOff()
            hideLine()
            edges.stop()
            springs.leave()
            follow(point)
            return
        }
        model?.carryMoved(at: point)
        hold(point, carrying: live.payload)
        springs.hover(at: point)
        follow(point)
    }

    /// The copy where the finger holds it; over the Projects page's tree a card rides above the finger, so the row lit
    /// under it stays in sight, and a lifted project below it, so the line and the row above the line do. Going in and
    /// out of such a place it glides there.
    private func follow(_ point: CGPoint) {
        guard var live else { return }
        let ride = live.cancelling ? .held : route.ride(live.payload)
        let center: CGPoint
        switch ride {
        case .above: center = CGPoint(x: point.x - live.grip.x, y: point.y - live.copy.bounds.height / 2 - CarryMotion.aboveFinger)
        case .below: center = CGPoint(x: point.x - live.grip.x, y: point.y + live.copy.bounds.height / 2 + CarryMotion.aboveFinger)
        case .held: center = CGPoint(x: point.x - live.grip.x, y: point.y - live.grip.y)
        }
        if ride != live.ride {
            live.ride = ride
            self.live = live
            UIView.animate(springDuration: CarryMotion.rise, bounce: 0, options: [.allowUserInteraction, .beginFromCurrentState]) { live.copy.center = center }
        } else {
            live.copy.center = center
        }
    }

    /// The place under the finger again, the finger still: the rows under it changed (a scroll, another day).
    func holdAgain() {
        guard let live, !live.cancelling, case .carrying = flow.phase else { return }
        _ = route.hold(live.point, carrying: live.payload)
    }

    private func hold(_ point: CGPoint, carrying payload: DragPayload?) {
        if !route.hold(point, carrying: payload) { hideLine() }
        edges.follow(point, in: route.scrolled(at: point), floor: route.floor) { [weak self] in self?.holdAgain() }
    }

    // MARK: Let go

    /// Let go at `point`: on the cancel target the copy flies home; elsewhere the place under the finger takes it, the
    /// screen after the drop drawn in the same animation the copy flies to the card's frame in it.
    func letGo(at point: CGPoint) {
        timing.step("let go") { release(at: point) }
    }

    private func release(at point: CGPoint) {
        guard let live, flow.letGo(live.carry) else { return }
        ended()
        guard !live.cancelling else {
            route.carryOff()
            hideLine()
            return flyHome(live)
        }
        // One spring: the place's rows open and close as its screen is drawn, and the copy flies into it, both starting in
        // this frame. The look the copy turns into is drawn before the flight starts, not inside its animation.
        var landing: CarryLanding?
        CarryMotion.animate { landing = self.route.letGo(carrying: live.payload) }
        hideLine()
        guard let landing else { return flyHome(live) }
        let look = arrival(for: landing)
        CarryMotion.animate({ live.copy.land(on: landing, look: look) }) { _ in self.landed(live) }
    }

    /// The touch was taken away (the screen went, a call came): the copy flies home.
    func cancel() {
        guard let live, flow.letGo(live.carry) else { return }
        ended()
        route.carryOff()
        hideLine()
        flyHome(live)
    }

    /// The finger is up: the edges stop scrolling, the arrows stop counting, the board takes touches again.
    private func ended() {
        edges.stop()
        springs.leave()
        cancelTarget?.hold(false)
        layer.blocksTouches = false
    }

    /// The copy flies back where the thing was lifted from, as the system returns a cancelled drag; the carry ends once it
    /// is down, and its place closes then.
    private func flyHome(_ live: Live) {
        model?.carryWentNowhere()
        guard let home = live.home() else { return landed(live) }
        CarryMotion.animate({ live.copy.land(on: CarryLanding(rect: home), look: nil) }) { _ in self.landed(live) }
    }

    /// The copy is down: the card it flew into shows in this same frame, the copy goes, the carry ends.
    private func landed(_ live: Live) {
        guard flow.landed(live.carry) else { return }
        self.live = nil
        timing.step("landed") {
            // The carry's end drawn in this same frame as the copy goes: the card, its branch, a section's header.
            model?.finishCarry(live.token)
            live.copy.removeFromSuperview()
            layer.clear()
        }
        timing.end()
    }

    /// What the copy turns into as it lands where it is a size other than its own: the card as drawn there, or a
    /// section's header.
    private func arrival(for landing: CarryLanding) -> UIView? {
        guard !landing.opens, !landing.folds, !landing.vanishes, let live, let model, let window = live.copy.window else { return nil }
        let size = live.copy.bounds.size
        guard abs(size.width - landing.rect.width) > 1 || abs(size.height - landing.rect.height) > 1 else { return nil }
        let rect = landing.rect
        switch live.payload?.kind {
        case .card:
            guard let id = model.landedId, let card = model.drawnCard(id, onCalendar: landing.onCalendar) else { return nil }
            return FloatImage.view(TaskCapsule(card: card, height: rect.height).frame(width: rect.width, height: rect.height), like: live.copy, in: window)
        case .section(let group):
            return FloatImage.view(SectionTitle(title: group.header ?? "", muted: group.name == nil).frame(width: rect.width, height: rect.height), like: live.copy, in: window)
        case .project, nil:
            return nil
        }
    }

    // MARK: The line

    /// The drop line, from the dot at the level's left edge to the list's right edge, over everything, the copy too.
    func showLine(from start: CGPoint, to end: CGFloat) {
        layer.line(from: start, to: end, dark: layer.traitCollection.userInterfaceStyle == .dark)
    }

    func hideLine() { layer.hideLine() }

    // MARK: Edges and day arrows

    private let edges = EdgeScroll()
    let timing = CarryTiming()
    let springs = SpringZones()
}

/// The layer over the whole window that holds the carried copy and, over it, the drop line. It takes no touch.
@MainActor
final class CarryLayer: UIView {
    private let copies = UIView()
    private let dot = UIView()
    private let bar = UIView()

    /// While a carry is live the layer takes every new touch, so a second finger reaches nothing on the board; the finger
    /// that carries was taken by its gesture before and keeps going.
    var blocksTouches = false {
        didSet { isUserInteractionEnabled = blocksTouches }
    }

    init() {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        copies.isUserInteractionEnabled = false
        addSubview(copies)
        for view in [dot, bar] {
            view.alpha = 0
            addSubview(view)
        }
        dot.layer.cornerRadius = CardMetrics.dropDot / 2
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    /// Over everything in `window`, its own size.
    func attach(to window: UIWindow) {
        if superview !== window {
            removeFromSuperview()
            window.addSubview(self)
        }
        frame = window.bounds
        copies.frame = bounds
        window.bringSubviewToFront(self)
    }

    func carry(_ copy: UIView) {
        copies.addSubview(copy)
    }

    /// Nothing carried: the layer stays, empty.
    func clear() {
        hideLine()
    }

    func line(from start: CGPoint, to end: CGFloat, dark: Bool) {
        let accent = UIColor(dark ? Palette.accentDark : Palette.accentLight)
        dot.backgroundColor = accent
        bar.backgroundColor = accent
        let first = dot.alpha == 0
        let place = {
            let dot = CardMetrics.dropDot, line = CardMetrics.dropLine
            self.dot.frame = CGRect(x: start.x, y: start.y - dot / 2, width: dot, height: dot)
            self.bar.frame = CGRect(x: start.x + dot / 2, y: start.y - line / 2, width: max(0, end - start.x - dot / 2), height: line)
            self.dot.alpha = 1
            self.bar.alpha = 1
        }
        if first { UIView.performWithoutAnimation(place) } else { UIView.animate(springDuration: CarryMotion.lineStep, bounce: 0, options: [.beginFromCurrentState], animations: place) }
    }

    func hideLine() {
        UIView.performWithoutAnimation {
            dot.alpha = 0
            bar.alpha = 0
        }
    }
}

/// The carried copy: the thing lifted, drawn as it stood, opaque. It rises as the system lifts a view (a little larger, a
/// soft shadow) and, landing, settles back to the card's own size and look where the card is drawn. A card's copy is
/// clipped to the card's shape and its looks are drawn from its top-left corner, so a copy landing at another width (a
/// subtask's level, the calendar) changes its look with the text standing still, never stretched or doubled.
@MainActor
final class CarryCopy: UIView {
    private let clip = UIView()
    private let content: UIView
    private var arrival: UIView?
    private let card: Bool

    init(content: UIView, frame: CGRect, style: UIUserInterfaceStyle, card: Bool) {
        self.content = content
        self.card = card
        super.init(frame: frame)
        isUserInteractionEnabled = false
        overrideUserInterfaceStyle = style
        clip.frame = bounds
        clip.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        clip.clipsToBounds = card
        clip.layer.cornerRadius = card ? CardMetrics.radius : 0
        clip.layer.cornerCurve = .continuous
        addSubview(clip)
        place(content)
        clip.addSubview(content)
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0
        layer.shadowRadius = 12
        layer.shadowOffset = CGSize(width: 0, height: 6)
        dark = style == .dark
    }

    private var dark = false

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    /// A look in the copy: a card's at its own size from the top-left corner, anything else filling the copy.
    private func place(_ look: UIView) {
        if card {
            look.frame = CGRect(origin: .zero, size: look.bounds.size == .zero ? bounds.size : look.bounds.size)
            look.contentMode = .topLeft
        } else {
            look.frame = bounds
            look.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            look.contentMode = .scaleToFill
        }
    }

    func rise() {
        transform = CGAffineTransform(scaleX: CarryMotion.riseScale, y: CarryMotion.riseScale)
        layer.shadowOpacity = dark ? 0.55 : 0.16
    }

    /// The copy at its landing, flown there in the animation it is called in: the card's own size and look in place, no
    /// lift left; into a folded part it shrinks into the header's middle and fades; the plus becomes the field.
    func land(on landing: CarryLanding, look: UIView?) {
        if let look, arrival == nil {
            UIView.performWithoutAnimation {
                place(look)
                look.alpha = 0
                clip.addSubview(look)
            }
            arrival = look
        }
        transform = .identity
        layer.shadowOpacity = 0
        if landing.vanishes {
            alpha = 0
            return
        }
        let rect = landing.rect
        if landing.folds {
            let scale = CarryMotion.foldedLanding
            bounds = CGRect(origin: .zero, size: CGSize(width: bounds.width * scale, height: bounds.height * scale))
            center = CGPoint(x: rect.midX, y: rect.midY)
            alpha = 0
            return
        }
        bounds = CGRect(origin: .zero, size: rect.size)
        center = CGPoint(x: rect.midX, y: rect.midY)
        arrival?.alpha = 1
        if arrival != nil, !card { content.alpha = 0 }
        if landing.opens {
            clip.layer.cornerRadius = CardMetrics.radius
            alpha = 0
        }
    }
}

/// A list or the calendar under a carry held near its top or its visible bottom (the tab bar's edge) scrolls on, faster
/// the nearer, as a list does under the system's drag, and the place under the still finger is read anew as rows pass
/// under it. One display link, running only while the finger is at an edge and the scroll can still go that way; its
/// speed is by the second (`EdgeScrollStep`), whatever the screen's frame rate.
@MainActor
final class EdgeScroll {
    private weak var scroll: UIScrollView?
    private var point: CGPoint = .zero
    private var floor: CGFloat = .infinity
    private var moved: () -> Void = {}
    private var link: CADisplayLink?
    private var last: CFTimeInterval?

    func follow(_ point: CGPoint, in scroll: UIScrollView?, floor: CGFloat, moved: @escaping () -> Void) {
        self.scroll = scroll
        self.point = point
        self.floor = floor
        self.moved = moved
        guard let scroll, next(scroll, elapsed: 0) != nil else { return stop() }
        guard link == nil else { return }
        let made = CADisplayLink(target: Ticker(self), selector: #selector(Ticker.tick(_:)))
        made.add(to: .main, forMode: .common)
        link = made
        last = nil
    }

    func stop() {
        link?.invalidate()
        link = nil
        last = nil
    }

    /// The offset after `elapsed` seconds: up at the top band, down at the bottom one (the visible bottom: the tab bar's
    /// top); nil between the bands or where the scroll can go no further that way.
    private func next(_ scroll: UIScrollView, elapsed: Double) -> CGFloat? {
        guard let window = scroll.window else { return nil }
        let area = scroll.convert(scroll.bounds, to: window)
        guard point.x >= area.minX, point.x < area.maxX else { return nil }
        let velocity = CarryMotion.edges.velocity(fromTop: Double(point.y - area.minY), fromBottom: Double(min(area.maxY, floor) - point.y))
        let least = -scroll.adjustedContentInset.top
        let most = scroll.contentSize.height + scroll.adjustedContentInset.bottom - scroll.bounds.height
        return EdgeScrollStep.next(offset: Double(scroll.contentOffset.y), velocity: velocity, elapsed: elapsed, least: Double(least), most: Double(most)).map { CGFloat($0) }
    }

    fileprivate func tick(_ link: CADisplayLink) {
        let elapsed = last.map { link.timestamp - $0 } ?? link.targetTimestamp - link.timestamp
        last = link.timestamp
        guard let scroll, let offset = next(scroll, elapsed: elapsed) else { return stop() }
        scroll.contentOffset.y = offset
        moved()
    }

    /// The display link holds its target strongly: a small one that holds the scroller weakly.
    @MainActor
    private final class Ticker: NSObject {
        weak var owner: EdgeScroll?
        init(_ owner: EdgeScroll) { self.owner = owner }
        @objc func tick(_ link: CADisplayLink) { owner?.tick(link) }
    }
}

/// The places a carry held over for a moment activates, as the system's spring loading (Files' folders): the day arrows,
/// which turn the day under a carry. Each activates once per stay, with the selection tick.
@MainActor
final class SpringZones {
    private struct Zone {
        weak var view: UIView?
        let activate: () -> Void
    }

    private var zones: [Zone] = []
    private weak var over: UIView?
    private var dwell: Timer?

    func add(_ view: UIView, activate: @escaping () -> Void) {
        zones.removeAll { $0.view == nil || $0.view === view }
        zones.append(Zone(view: view, activate: activate))
    }

    func hover(at point: CGPoint) {
        let zone = zones.first { zone in
            guard let view = zone.view, let window = view.window, !view.isHidden, view.alpha > 0 else { return false }
            return view.convert(view.bounds, to: window).contains(point)
        }
        guard zone?.view !== over else { return }
        leave()
        guard let zone, let view = zone.view else { return }
        over = view
        let activate = zone.activate
        dwell = Timer.scheduledTimer(withTimeInterval: CarryMotion.springLoad, repeats: false) { [weak self, weak view] _ in
            MainActor.assumeIsolated {
                guard let self, let view, self.over === view else { return }
                self.dwell = nil
                CarryFeel.tick()
                activate()
            }
        }
    }

    func leave() {
        dwell?.invalidate()
        dwell = nil
        over = nil
    }
}

/// A DEBUG build's measure of a carry, told to the log (`category: drop`) as it lands: how long each move of the finger
/// took the main thread, and the frames that came late while it was carried and while it landed.
@MainActor
final class CarryTiming {
    private static let log = Logger(subsystem: "com.kudrmax.taskcalendar", category: "drop")
    private var moves: [Double] = []
    private var frames: [Double] = []
    /// Each late frame and each step, by when it came after the lift (ms).
    private var marks: [String] = []
    private var started: CFTimeInterval = 0
    private var link: CADisplayLink?
    private var last: CFTimeInterval = 0
    private var steps: [(String, Double)] = []

    func begin() {
        #if DEBUG || CARRY_TIMING
        moves = []
        frames = []
        steps = []
        marks = []
        started = CACurrentMediaTime()
        last = 0
        let made = CADisplayLink(target: Ticker(self), selector: #selector(Ticker.tick(_:)))
        made.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        made.add(to: .main, forMode: .common)
        link = made
        #endif
    }

    func measure(_ work: () -> Void) {
        #if DEBUG || CARRY_TIMING
        let start = CACurrentMediaTime()
        work()
        moves.append((CACurrentMediaTime() - start) * 1000)
        #else
        work()
        #endif
    }

    func step(_ name: String, _ work: () -> Void) {
        #if DEBUG || CARRY_TIMING
        let start = CACurrentMediaTime()
        work()
        steps.append((name, (CACurrentMediaTime() - start) * 1000))
        marks.append("\(name)@\(Int((start - started) * 1000))")
        #else
        work()
        #endif
    }

    func end() {
        #if DEBUG || CARRY_TIMING
        link?.invalidate()
        link = nil
        guard !moves.isEmpty else { return }
        let sorted = moves.sorted()
        let mean = moves.reduce(0, +) / Double(moves.count)
        let p95 = sorted[min(sorted.count - 1, Int(Double(sorted.count) * 0.95))]
        let late = frames.filter { $0 > 1000.0 / 60 * 1.5 }.count
        let worst = frames.max() ?? 0
        Self.log.notice("CARRY moves \(self.moves.count) mean \(mean, format: .fixed(precision: 2)) ms p95 \(p95, format: .fixed(precision: 2)) ms max \(sorted.last ?? 0, format: .fixed(precision: 2)) ms; frames \(self.frames.count) late \(late) worst \(worst, format: .fixed(precision: 1)) ms; \(self.steps.map { "\($0.0) \(String(format: "%.2f", $0.1)) ms" }.joined(separator: ", "), privacy: .public); \(self.marks.joined(separator: " "), privacy: .public)")
        #endif
    }

    fileprivate func tick(_ link: CADisplayLink) {
        if last > 0 {
            let interval = (link.timestamp - last) * 1000
            frames.append(interval)
            if interval > 1000.0 / 60 * 1.5 { marks.append("late \(Int(interval))@\(Int((link.timestamp - started) * 1000))") }
        }
        last = link.timestamp
    }

    @MainActor
    private final class Ticker: NSObject {
        weak var owner: CarryTiming?
        init(_ owner: CarryTiming) { self.owner = owner }
        @objc func tick(_ link: CADisplayLink) { owner?.tick(link) }
    }
}

extension UIGestureRecognizer {
    /// Where the finger that began the gesture is, in the window: never the middle of two fingers.
    var firstFinger: CGPoint {
        numberOfTouches > 0 ? location(ofTouch: 0, in: nil) : location(in: nil)
    }
}

/// Work run at the next frame of the screen, not later in this one: what a frame need not draw at once waits one frame.
@MainActor
enum NextFrame {
    static func run(_ work: @escaping @MainActor () -> Void) {
        let link = CADisplayLink(target: Once(work), selector: #selector(Once.fire(_:)))
        link.add(to: .main, forMode: .common)
    }

    @MainActor
    private final class Once: NSObject {
        let work: @MainActor () -> Void
        var fired = false
        /// When it was asked: a tick of the frame being drawn now (its vsync came before) is not the next frame.
        let asked = CACurrentMediaTime()
        init(_ work: @escaping @MainActor () -> Void) { self.work = work }
        @objc func fire(_ link: CADisplayLink) {
            guard link.timestamp >= asked else { return }
            link.invalidate()
            guard !fired else { return }
            fired = true
            work()
        }
    }
}
