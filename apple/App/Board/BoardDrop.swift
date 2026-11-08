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
}

/// The screen's one drop interaction, UIKit's own, on the window: every list and the calendar register as places, and
/// a carry is routed to the place under the finger. Being UIKit's, a drop's preview flies into the gap or onto the time
/// it lands at, and a carry let go over no place flies back, as the system animates them.
@MainActor
final class BoardDrop: NSObject, UIDropInteractionDelegate {
    private(set) lazy var interaction = UIDropInteraction(delegate: self)
    /// Told when a carry's drag session ends, whatever came of it: the screen's way to end a carry whose card is gone.
    var ended: () -> Void = {}
    private var places: [String: DropPlace] = [:]
    private var current: String?
    /// Where the card let go will stand, in the window, kept for the drop's preview.
    private var landing: CGRect?

    func register(_ key: String, _ place: DropPlace) {
        let kept = places[key]
        var place = place
        if let kept {
            place.visible = kept.visible
            place.origin = kept.origin
        }
        places[key] = place
    }

    /// The place moved on the screen: a scroll, the ribbon, a new day.
    func move(_ key: String, visible: CGRect? = nil, origin: CGPoint? = nil) {
        if let visible { places[key]?.visible = visible }
        if let origin { places[key]?.origin = origin }
    }

    func remove(_ key: String) {
        if current == key { leave() }
        places[key] = nil
    }

    private func place(at point: CGPoint) -> String? {
        places.first { $0.value.visible.contains(point) }?.key
    }

    private func leave() {
        if let current { places[current]?.leave() }
        current = nil
    }

    // MARK: The plus, carried by the finger itself

    /// The plus held at `point` of the window: the place under it shows where the new task would stand.
    func carry(at point: CGPoint) {
        let key = place(at: point)
        if key != current { leave() }
        current = key
        guard let key, let place = places[key] else { return }
        place.hover(CGPoint(x: point.x - place.origin.x, y: point.y - place.origin.y))
    }

    /// The plus held over no place (the cancel target, the bars).
    func carryOff() { leave() }

    /// The plus let go: true when a place took it.
    func letGo() -> Bool {
        guard let current, let place = places[current] else { return false }
        self.current = nil
        _ = place.land()
        return true
    }

    // MARK: A system carry

    func dropInteraction(_ interaction: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
        session.localDragSession != nil
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: any UIDropSession) -> UIDropProposal {
        guard let view = interaction.view else { return UIDropProposal(operation: .cancel) }
        let point = session.location(in: view)
        let key = place(at: point)
        if key != current { leave() }
        current = key
        guard let key, let place = places[key] else { return UIDropProposal(operation: .cancel) }
        place.hover(CGPoint(x: point.x - place.origin.x, y: point.y - place.origin.y))
        return UIDropProposal(operation: .move)
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: any UIDropSession) { leave() }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: any UIDropSession) {
        current = nil
        landing = nil
        ended()
    }

    func dropInteraction(_ interaction: UIDropInteraction, performDrop session: any UIDropSession) {
        guard let current, let place = places[current] else { return }
        landing = place.land().map { $0.offsetBy(dx: place.origin.x, dy: place.origin.y) }
        self.current = nil
    }

    /// The carried card settles into its place: into the gap, or onto the line's time.
    func dropInteraction(_ interaction: UIDropInteraction, previewForDropping item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
        guard let landing, let view = interaction.view else { return nil }
        let target = UIDragPreviewTarget(container: view, center: CGPoint(x: landing.midX, y: landing.midY))
        return defaultPreview.retargetedPreview(with: target)
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
    let touched: @MainActor () -> Void

    func makeUIView(context: Context) -> Probe { Probe(touched: touched) }

    func updateUIView(_ probe: Probe, context: Context) { probe.watch.touched = touched }

    final class Probe: UIView {
        let watch: Watch

        init(touched: @escaping @MainActor () -> Void) {
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
        var touched: @MainActor () -> Void

        init(touched: @escaping @MainActor () -> Void) {
            self.touched = touched
            super.init(target: nil, action: nil)
            cancelsTouchesInView = false
            delaysTouchesBegan = false
            delaysTouchesEnded = false
            delegate = self
        }

        override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
            touched()
            state = .failed
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }
}
