import SwiftUI
import UIKit

/// A place of the screen that takes a carried card or the plus: a list, or the calendar. It answers in its own content's
/// space, the space its rows and minutes are measured in.
@MainActor
struct DropPlace {
    /// What of it shows, in the window.
    var visible: CGRect = .null
    /// Where its content's origin stands, in the window: a point under the finger is read from there.
    var origin: CGPoint = .zero
    let hover: (CGPoint) -> Void
    let leave: () -> Void
    /// Let go: where the card will stand, in the content's space, for the system to settle the carried card into; nil
    /// when the drop writes nothing.
    let land: () -> CGRect?
    /// The plus may be let go here: a column's title takes only cards, as the plugin's.
    var takesPlus = true
}

/// The screen's one drop interaction, UIKit's own, on the window: every list and the calendar register as places, and
/// a carry is routed to the place under the finger. Being UIKit's, a drop's preview flies into the gap or onto the time
/// it lands at, and a carry let go over no place flies back, as the system animates them.
@MainActor
final class BoardDrop: NSObject, UIDropInteractionDelegate {
    private(set) lazy var interaction = UIDropInteraction(delegate: self)
    /// Told when a carry's drag session ends, whatever came of it, once its drop has flown, and whether a place took the
    /// drop: the screen's way to end a carry whose card is gone.
    /// Each names the carry its session was (`carrying`), so a session still ending never ends a carry begun after it.
    var ended: (_ performed: Bool, _ carry: Int?) -> Void = { _, _ in }
    /// Told when a drop's copy has come down, with where it came down in the window (nil: the system's own place).
    var landed: (CGRect?, _ carry: Int?) -> Void = { _, _ in }
    /// The carry under way, which a session over the board belongs to.
    var carrying: () -> Int? = { nil }
    /// Each drop session over the board, by itself: the system may still be ending one (its copy settling) when the
    /// finger has lifted the next card.
    private struct Flight {
        let carry: Int?
        /// A place took the drop.
        var performed = false
        /// Where the card let go will stand, in the window.
        var landing: CGRect?
        /// The copy is flying: the session's end waits for it.
        var flying = false
        var endAfterFlight = false
        /// The copy the system flies, kept to fade it.
        weak var flown: UIView?
    }
    private var flights: [ObjectIdentifier: Flight] = [:]
    /// The session each dropped item belongs to.
    private var sessionOf: [ObjectIdentifier: ObjectIdentifier] = [:]

    private func flight(_ session: any UIDropSession) -> ObjectIdentifier {
        let key = ObjectIdentifier(session)
        if flights[key] == nil { flights[key] = Flight(carry: carrying()) }
        return key
    }
    /// The carry's copy folds shut onto the top of its place as it flies there (a section's, which lands on the room the
    /// section opens rather than on a card that looks like it): nothing of it is left while the system keeps it there.
    var foldsOnDrop: () -> Bool = { false }
    /// The carry's copy takes the size of where it lands and fades out on the way: a card dropped into a folded project
    /// part flies into the part's header (decision 56).
    var fadesOnDrop: () -> Bool = { false }
    private var places: [String: DropPlace] = [:]
    /// How each place that scrolls is scrolled by a carry held at its edge: by `dy` points, true when it moved.
    private var scrolls: [String: (CGFloat) -> Bool] = [:]
    /// Where the carry is held, in the window: the edge scroll reads it on every frame, the finger still or not.
    private var held: CGPoint?
    private var edgeLink: CADisplayLink?
    /// The top of the bar over the screen's bottom (the tab bar and the plus), in the window: a list's edge there is
    /// where it stops showing, not where it ends under the bar.
    var floor: CGFloat?
    private var current: String?

    /// Where each place last told it stands, kept apart from the places themselves: SwiftUI reports a view's geometry
    /// before its `onAppear` registers it, and a ribbon that opens where it last stood never moves again to report anew.
    private var spots: [String: (visible: CGRect, origin: CGPoint)] = [:]

    func register(_ key: String, _ place: DropPlace) {
        var place = place
        if let spot = spots[key] {
            place.visible = spot.visible
            place.origin = spot.origin
        }
        places[key] = place
    }

    /// The place moved on the screen: a scroll, the ribbon, a new day. Told before the place registers too.
    func move(_ key: String, visible: CGRect? = nil, origin: CGPoint? = nil) {
        var spot = spots[key] ?? (visible: .null, origin: .zero)
        if let visible { spot.visible = visible }
        if let origin { spot.origin = origin }
        spots[key] = spot
        places[key]?.visible = spot.visible
        places[key]?.origin = spot.origin
    }

    /// Where a place's content origin stands, in the window.
    func origin(of key: String) -> CGPoint? { places[key]?.origin }

    func remove(_ key: String) {
        if current == key { leave() }
        places[key] = nil
        scrolls[key] = nil
    }

    /// The place scrolls while a carry is held near its top or bottom edge, as the plugin's lists and calendar do.
    func scrolls(_ key: String, by scroll: @escaping (CGFloat) -> Bool) {
        scrolls[key] = scroll
    }

    // MARK: Scrolling at the edges

    /// The carry held at `point`: a place it is near the edge of starts scrolling, faster the nearer.
    private func hold(_ point: CGPoint?) {
        held = point
        guard point != nil, let current, scrolls[current] != nil else { return stopEdges() }
        guard edgeLink == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(edgeTick))
        link.add(to: .main, forMode: .common)
        edgeLink = link
    }

    private func stopEdges() {
        edgeLink?.invalidate()
        edgeLink = nil
    }

    @objc private func edgeTick() {
        guard let key = current, let point = held, let place = places[key], let scroll = scrolls[key] else { return stopEdges() }
        let fromTop = point.y - place.visible.minY
        let fromBottom = min(place.visible.maxY, floor ?? .infinity) - point.y
        var dy: CGFloat = 0
        if fromTop < Self.edgeBand { dy = -Self.edgeSpeed * (1 - max(0, fromTop) / Self.edgeBand) }
        else if fromBottom < Self.edgeBand { dy = Self.edgeSpeed * (1 - max(0, fromBottom) / Self.edgeBand) }
        guard dy != 0, scroll(dy) else { return }
        // The content moved under the still finger: the place reads where it now points, before its origin is told.
        place.hover(CGPoint(x: point.x - place.origin.x, y: point.y - place.origin.y + dy))
    }

    /// How near an edge a carry starts the scroll, and the fastest it scrolls, points a frame.
    private static let edgeBand: CGFloat = 48
    private static let edgeSpeed: CGFloat = 9

    private func place(at point: CGPoint, plus: Bool = false) -> String? {
        // By key, so a point two places share always goes to the same one.
        places.keys.sorted().first { key in places[key].map { $0.visible.contains(point) && (!plus || $0.takesPlus) } == true }
    }

    private func leave() {
        if let current { places[current]?.leave() }
        current = nil
        stopEdges()
    }

    // MARK: The plus, carried by the finger itself

    /// The plus held at `point` of the window: the place under it shows where the new task would stand.
    func carry(at point: CGPoint) {
        let key = place(at: point, plus: true)
        if key != current { leave() }
        current = key
        guard let key, let place = places[key] else { return }
        place.hover(CGPoint(x: point.x - place.origin.x, y: point.y - place.origin.y))
        hold(point)
    }

    /// The plus held over no place (the cancel target, the bars).
    func carryOff() { leave() }

    /// What came of the plus let go: no place under it, or a place took it, with where its field opens in the window.
    enum LetGo {
        case missed
        case taken(CGRect?)
    }

    func letGo() -> LetGo {
        guard let current, let place = places[current] else { return .missed }
        self.current = nil
        stopEdges()
        return .taken(place.land().map { $0.offsetBy(dx: place.origin.x, dy: place.origin.y) })
    }

    // MARK: A system carry

    func dropInteraction(_ interaction: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
        session.localDragSession != nil
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: any UIDropSession) -> UIDropProposal {
        guard let view = interaction.view else { return UIDropProposal(operation: .cancel) }
        _ = flight(session)
        let point = session.location(in: view)
        let key = place(at: point)
        if key != current { leave() }
        current = key
        guard let key, let place = places[key] else { return UIDropProposal(operation: .cancel) }
        place.hover(CGPoint(x: point.x - place.origin.x, y: point.y - place.origin.y))
        hold(point)
        return UIDropProposal(operation: .move)
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: any UIDropSession) { leave() }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: any UIDropSession) {
        let key = flight(session)
        if flights[key]?.carry == carrying() {
            current = nil
            stopEdges()
        }
        guard flights[key]?.flying != true else {
            flights[key]?.endAfterFlight = true
            return
        }
        finish(key)
    }

    private func finish(_ key: ObjectIdentifier) {
        guard let done = flights.removeValue(forKey: key) else { return }
        sessionOf = sessionOf.filter { $0.value != key }
        ended(done.performed, done.carry)
    }

    func dropInteraction(_ interaction: UIDropInteraction, performDrop session: any UIDropSession) {
        stopEdges()
        let key = flight(session)
        flights[key]?.performed = true
        for item in session.items { sessionOf[ObjectIdentifier(item)] = key }
        guard let current, let place = places[current] else { return }
        flights[key]?.landing = place.land().map { $0.offsetBy(dx: place.origin.x, dy: place.origin.y) }
        self.current = nil
    }

    /// The drop's own animation: the carry ends once it is done, never while the copy is still in the air.
    func dropInteraction(_ interaction: UIDropInteraction, item: UIDragItem, willAnimateDropWith animator: any UIDragAnimating) {
        guard let key = sessionOf[ObjectIdentifier(item)], let flight = flights[key] else { return }
        flights[key]?.flying = true
        if fadesOnDrop(), let flown = flight.flown { animator.addAnimations { flown.alpha = 0 } }
        animator.addCompletion { [weak self] _ in
            guard let self else { return }
            self.flights[key]?.flying = false
            self.landed(flight.landing, flight.carry)
            if self.flights[key]?.endAfterFlight == true { self.finish(key) }
        }
    }

    /// The carried card settles into its place: into the gap, or onto the line's time.
    func dropInteraction(_ interaction: UIDropInteraction, previewForDropping item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
        guard let key = sessionOf[ObjectIdentifier(item)], let landing = flights[key]?.landing, let view = interaction.view else { return nil }
        let target = UIDragPreviewTarget(container: view, center: CGPoint(x: landing.midX, y: landing.midY))
        let center = CGPoint(x: landing.midX, y: landing.minY)
        if foldsOnDrop() {
            // No shadow either: a folded copy's shadow would stay a line over the header.
            let parameters = UIDragPreviewParameters()
            parameters.backgroundColor = .clear
            parameters.shadowPath = UIBezierPath()
            let folded = UIDragPreviewTarget(container: view, center: center, transform: CGAffineTransform(scaleX: 1, y: 0.001))
            return UITargetedDragPreview(view: defaultPreview.view, parameters: parameters, target: folded)
        }
        // The copy comes down at the size of where it lands: a card landing taller or narrower than it was lifted
        // never comes down at its old size and jumps when its place is drawn.
        let size = defaultPreview.size
        guard size.width > 0, size.height > 0, abs(size.width - landing.width) > 0.5 || abs(size.height - landing.height) > 0.5 else {
            flights[key]?.flown = defaultPreview.view
            return defaultPreview.retargetedPreview(with: target)
        }
        let sized = UIDragPreviewTarget(container: view, center: target.center, transform: CGAffineTransform(scaleX: landing.width / size.width, y: landing.height / size.height))
        guard fadesOnDrop(), let copy = Self.picture(of: defaultPreview.view, size: size) else {
            flights[key]?.flown = defaultPreview.view
            return defaultPreview.retargetedPreview(with: sized)
        }
        // A copy of its own the system flies, so the fade reaches what is drawn; no shadow is left on the header.
        let parameters = UIDragPreviewParameters()
        parameters.backgroundColor = .clear
        parameters.shadowPath = UIBezierPath()
        flights[key]?.flown = copy
        return UITargetedDragPreview(view: copy, parameters: parameters, target: sized)
    }
}

extension BoardDrop {
    /// A still picture of the carried card, which the system's preview holds out of any window: a view of our own to fade.
    static func picture(of view: UIView, size: CGSize) -> UIView? {
        let image = UIGraphicsImageRenderer(size: size).image { context in view.layer.render(in: context.cgContext) }
        let copy = UIImageView(image: image)
        copy.frame = CGRect(origin: .zero, size: size)
        return copy
    }
}

/// Puts the screen's drop interaction on its window.
struct DropAnchor: UIViewRepresentable {
    let drop: BoardDrop

    func makeUIView(context: Context) -> AnchorView {
        let view = AnchorView()
        view.drop = drop
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: AnchorView, context: Context) {}

    final class AnchorView: UIView {
        var drop: BoardDrop?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard let drop, let window, drop.interaction.view !== window else { return }
            window.addInteraction(drop.interaction)
        }
    }
}

/// Tells of every touch that begins anywhere in the window, taking none: the found card's ring goes at the next touch, as
/// the plugin's (`FoundCard`).
struct TouchWatch: UIViewRepresentable {
    /// Where the touch began, in the window.
    let touched: @MainActor (CGPoint) -> Void

    func makeUIView(context: Context) -> Probe { Probe(touched: touched) }

    func updateUIView(_ probe: Probe, context: Context) { probe.watch.touched = touched }

    final class Probe: UIView {
        let watch: Watch

        init(touched: @escaping @MainActor (CGPoint) -> Void) {
            watch = Watch(touched: touched)
            super.init(frame: .zero)
            isUserInteractionEnabled = false
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError("not from a storyboard") }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            if let window, watch.view !== window { window.addGestureRecognizer(watch) }
        }
    }

    /// Fails at once on every touch, after telling of it: no other gesture ever waits for it or loses its touches.
    final class Watch: UIGestureRecognizer, UIGestureRecognizerDelegate {
        var touched: @MainActor (CGPoint) -> Void

        init(touched: @escaping @MainActor (CGPoint) -> Void) {
            self.touched = touched
            super.init(target: nil, action: nil)
            cancelsTouchesInView = false
            delaysTouchesBegan = false
            delaysTouchesEnded = false
            delegate = self
        }

        override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
            touched(touches.first?.location(in: nil) ?? .zero)
            state = .failed
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }
}
