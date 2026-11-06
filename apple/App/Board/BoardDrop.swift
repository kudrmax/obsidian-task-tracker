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
    }

    func dropInteraction(_ interaction: UIDropInteraction, performDrop session: any UIDropSession) {
        guard let current, let place = places[current] else { return }
        landing = place.land().map { $0.offsetBy(dx: place.origin.x, dy: place.origin.y) }
        self.current = nil
    }

    func dropInteraction(_ interaction: UIDropInteraction, previewForDropping item: UIDragItem, withDefault defaultPreview: UITargetedPreview) -> UITargetedPreview? {
        guard let landing, let view = interaction.view else { return nil }
        let target = UIPreviewTarget(container: view, center: CGPoint(x: landing.midX, y: landing.midY))
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
