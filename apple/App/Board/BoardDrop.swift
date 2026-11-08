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
    /// Told when a carry's drag session ends, whatever came of it, once its drop has flown, and whether a place took the
    /// drop: the screen's way to end a carry whose card is gone.
    var ended: (_ performed: Bool) -> Void = { _ in }
    /// Told when a drop's copy has come down, with where it came down in the window (nil: the system's own place).
    var landed: (CGRect?) -> Void = { _ in }
    /// A drop's copy is flying: the session's end waits for it.
    private var flying = false
    private var endAfterFlight = false
    /// A place took the session's drop.
    private var performed = false
    /// The carry's copy folds shut onto the top of its place as it flies there (a section's, which lands on the room the
    /// section opens rather than on a card that looks like it): nothing of it is left while the system keeps it there.
    var foldsOnDrop: () -> Bool = { false }
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

    /// Where a place's content origin stands, in the window.
    func origin(of key: String) -> CGPoint? { places[key]?.origin }

    func remove(_ key: String) {
        if current == key { leave() }
        places[key] = nil
    }

    private func place(at point: CGPoint) -> String? {
        // By key, so a point two places share always goes to the same one.
        places.keys.sorted().first { places[$0]?.visible.contains(point) == true }
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

    /// What came of the plus let go: no place under it, or a place took it, with where its field opens in the window.
    enum LetGo {
        case missed
        case taken(CGRect?)
    }

    func letGo() -> LetGo {
        guard let current, let place = places[current] else { return .missed }
        self.current = nil
        return .taken(place.land().map { $0.offsetBy(dx: place.origin.x, dy: place.origin.y) })
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
        guard !flying else {
            endAfterFlight = true
            return
        }
        landing = nil
        ended(performed)
        performed = false
    }

    func dropInteraction(_ interaction: UIDropInteraction, performDrop session: any UIDropSession) {
        performed = true
        guard let current, let place = places[current] else { return }
        landing = place.land().map { $0.offsetBy(dx: place.origin.x, dy: place.origin.y) }
        self.current = nil
    }

    /// The drop's own animation: the carry ends once it is done, never while the copy is still in the air.
    func dropInteraction(_ interaction: UIDropInteraction, item: UIDragItem, willAnimateDropWith animator: any UIDragAnimating) {
        flying = true
        let target = landing
        animator.addCompletion { [weak self] _ in
            guard let self else { return }
            self.flying = false
            self.landed(target)
            if self.endAfterFlight {
                self.endAfterFlight = false
                self.landing = nil
                self.ended(self.performed)
                self.performed = false
            }
        }
    }

    /// The carried card settles into its place: into the gap, or onto the line's time.
    func dropInteraction(_ interaction: UIDropInteraction, previewForDropping item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
        guard let landing, let view = interaction.view else { return nil }
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
