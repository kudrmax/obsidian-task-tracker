import Core
import SwiftUI
import UIKit

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
    /// Into a folded project part: the copy shrinks into the middle of its header and is gone.
    var folds = false
    /// The plus taken by a place: the copy becomes the field that opens there.
    var opens = false
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
    }

    private var live: Live?

    init(model: BoardModel, route: BoardRoute) {
        self.model = model
        self.route = route
    }

    /// A press may lift now: nothing is carried. A copy still settling into its place (a press is recognized only after
    /// the long press's delay, by when the copy has all but landed) is set down at once, so the next card lifts the moment
    /// the finger asks.
    var idle: Bool {
        if case .landing = flow.phase, let live { landed(live) }
        return flow.phase == .idle
    }

    /// The copy and line flight's motion: the list's own time for rows moving (`ListController.unfold`).
    static let flight: TimeInterval = 0.35

    // MARK: Lift

    /// A long press lifted `lift` with the finger at `point` (window): the copy stands where it was, rises, and the carry
    /// begins. False while another carry still lands.
    @discardableResult
    func lift(_ lift: Lift, at point: CGPoint, in window: UIWindow) -> Bool {
        guard let carry = flow.lift() else { return false }
        let token = lift.begin()
        let copy = CarryCopy(content: lift.copy, frame: lift.frame, style: window.traitCollection.userInterfaceStyle, card: lift.card)
        layer.attach(to: window)
        layer.carry(copy)
        live = Live(token: token, carry: carry, payload: lift.payload, copy: copy, grip: CGPoint(x: point.x - lift.frame.midX, y: point.y - lift.frame.midY), home: lift.home, point: point)
        if lift.rises {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            UIView.animate(springDuration: 0.25, bounce: 0, options: [.allowUserInteraction, .beginFromCurrentState]) { copy.rise() }
        }
        return true
    }

    // MARK: Carry

    /// The finger moved to `point` (window): the copy follows it; the place under it shows its line, the cancel target fills
    /// under it; held at an edge the list or calendar scrolls, over a day arrow the day turns.
    func move(to point: CGPoint) {
        guard var live, flow.move(live.carry) else { return }
        live.point = point
        live.copy.center = CGPoint(x: point.x - live.grip.x, y: point.y - live.grip.y)
        let cancelling = cancelTarget?.area?.contains(point) == true
        if cancelling != live.cancelling { cancelTarget?.hold(cancelling) }
        live.cancelling = cancelling
        self.live = live
        if cancelling {
            route.carryOff()
            hideLine()
            edges.stop()
            springs.leave()
            return
        }
        hold(point, carrying: live.payload)
        springs.hover(at: point)
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
        guard let live, flow.letGo(live.carry) else { return }
        edges.stop()
        springs.leave()
        cancelTarget?.hold(false)
        guard !live.cancelling else {
            route.carryOff()
            hideLine()
            return flyHome(live)
        }
        var landing: CarryLanding?
        // One animation: the place's rows open and close as its screen is drawn, and the copy flies into it.
        UIView.animate(springDuration: Self.flight, bounce: 0, options: [.allowUserInteraction]) {
            landing = self.route.letGo(carrying: live.payload)
            self.hideLine()
            if let landing { live.copy.land(on: landing, look: self.arrival(for: landing)) }
        } completion: { _ in
            if landing != nil { self.landed(live) }
        }
        if landing == nil { flyHome(live) }
    }

    /// The touch was taken away (the screen went, a call came): the copy flies home.
    func cancel() {
        guard let live, flow.letGo(live.carry) else { return }
        edges.stop()
        springs.leave()
        cancelTarget?.hold(false)
        route.carryOff()
        hideLine()
        flyHome(live)
    }

    /// The copy flies back where the thing was lifted from, as the system returns a cancelled drag; the carry ends once it
    /// is down, and its place closes then.
    private func flyHome(_ live: Live) {
        guard let home = live.home() else { return landed(live) }
        UIView.animate(springDuration: Self.flight, bounce: 0, options: [.allowUserInteraction]) {
            live.copy.land(on: CarryLanding(rect: home), look: nil)
        } completion: { _ in
            self.landed(live)
        }
    }

    /// The copy is down: the card it flew into shows in this same frame, the copy goes, the carry ends.
    private func landed(_ live: Live) {
        guard flow.landed(live.carry) else { return }
        model?.revealLanding()
        live.copy.removeFromSuperview()
        layer.clear()
        self.live = nil
        model?.endCarry(live.token)
    }

    /// What the copy turns into as it lands where it is a size other than its own: the card as drawn there, or a
    /// section's header.
    private func arrival(for landing: CarryLanding) -> UIView? {
        guard !landing.opens, !landing.folds, let live, let model, let window = live.copy.window else { return nil }
        let size = live.copy.bounds.size
        guard abs(size.width - landing.rect.width) > 1 || abs(size.height - landing.rect.height) > 1 else { return nil }
        let rect = landing.rect
        switch live.payload?.kind {
        case .card:
            guard let id = model.landedId, let card = model.drawnCard(id) else { return nil }
            return FloatImage.view(TaskCapsule(card: card, height: rect.height).frame(width: rect.width, height: rect.height), like: live.copy, in: window)
        case .section(let group):
            return FloatImage.view(SectionTitle(title: group.header ?? "", muted: group.name == nil).frame(width: rect.width, height: rect.height), like: live.copy, in: window)
        case nil:
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
    let springs = SpringZones()
}

/// The layer over the whole window that holds the carried copy and, over it, the drop line. It takes no touch.
@MainActor
final class CarryLayer: UIView {
    private let copies = UIView()
    private let dot = UIView()
    private let bar = UIView()
    static let dot: CGFloat = 8
    static let thickness: CGFloat = 2

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
        dot.layer.cornerRadius = Self.dot / 2
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
            self.dot.frame = CGRect(x: start.x, y: start.y - Self.dot / 2, width: Self.dot, height: Self.dot)
            self.bar.frame = CGRect(x: start.x + Self.dot / 2, y: start.y - Self.thickness / 2, width: max(0, end - start.x - Self.dot / 2), height: Self.thickness)
            self.dot.alpha = 1
            self.bar.alpha = 1
        }
        if first { UIView.performWithoutAnimation(place) } else { UIView.animate(springDuration: 0.12, bounce: 0, options: [.beginFromCurrentState], animations: place) }
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
    static let rise: CGFloat = 1.04

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
        transform = CGAffineTransform(scaleX: Self.rise, y: Self.rise)
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
        let rect = landing.rect
        if landing.folds {
            let scale = ListController.foldedLanding
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
/// under it. One display link, running only while the finger is at an edge.
@MainActor
final class EdgeScroll {
    private weak var scroll: UIScrollView?
    private var point: CGPoint = .zero
    private var floor: CGFloat = .infinity
    private var moved: () -> Void = {}
    private var link: CADisplayLink?
    static let band: CGFloat = 48
    static let speed: CGFloat = 9

    func follow(_ point: CGPoint, in scroll: UIScrollView?, floor: CGFloat, moved: @escaping () -> Void) {
        self.scroll = scroll
        self.point = point
        self.floor = floor
        self.moved = moved
        guard step() != 0 else { return stop() }
        guard link == nil else { return }
        let made = CADisplayLink(target: Ticker(self), selector: #selector(Ticker.tick))
        made.add(to: .main, forMode: .common)
        link = made
    }

    func stop() {
        link?.invalidate()
        link = nil
    }

    /// How far to scroll this frame: up at the top band, down at the bottom one (the visible bottom: the tab bar's top).
    private func step() -> CGFloat {
        guard let scroll, let window = scroll.window else { return 0 }
        let area = scroll.convert(scroll.bounds, to: window)
        let top = area.minY, bottom = min(area.maxY, floor)
        guard point.x >= area.minX, point.x < area.maxX else { return 0 }
        let fromTop = point.y - top, fromBottom = bottom - point.y
        if fromTop < Self.band, fromTop > -Self.band { return -Self.speed * min(1, 1 - fromTop / Self.band) }
        if fromBottom < Self.band { return Self.speed * min(1, 1 - fromBottom / Self.band) }
        return 0
    }

    fileprivate func tick() {
        guard let scroll else { return stop() }
        let dy = step()
        guard dy != 0 else { return stop() }
        let most = max(-scroll.adjustedContentInset.top, scroll.contentSize.height + scroll.adjustedContentInset.bottom - scroll.bounds.height)
        let next = min(max(-scroll.adjustedContentInset.top, scroll.contentOffset.y + dy), most)
        guard abs(next - scroll.contentOffset.y) >= 0.5 else { return }
        scroll.contentOffset.y = next
        moved()
    }

    /// The display link holds its target strongly: a small one that holds the scroller weakly.
    @MainActor
    private final class Ticker: NSObject {
        weak var owner: EdgeScroll?
        init(_ owner: EdgeScroll) { self.owner = owner }
        @objc func tick() { owner?.tick() }
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
    /// How long a carry stays over an arrow before it turns the day, as the system's spring loading.
    static let delay: TimeInterval = 0.5

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
        dwell = Timer.scheduledTimer(withTimeInterval: Self.delay, repeats: false) { [weak self, weak view] _ in
            MainActor.assumeIsolated {
                guard let self, let view, self.over === view else { return }
                self.dwell = nil
                UISelectionFeedbackGenerator().selectionChanged()
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
