import SwiftUI
import UIKit

/// The plus beside the tab bar, as in the plugin: a tap opens a new task, a long press lifts the plus to carry, and
/// letting it go between cards or on the calendar writes the new task there. The tab bar's own round button stays the
/// look; this lies over it and takes its touches.
struct PlusButton: UIViewRepresentable {
    let open: () -> Void
    let accent: Color
    var onCarry: (Bool) -> Void = { _ in }

    /// Where iOS 26 puts the tab bar's trailing round button: its size, and its gap to the screen's edges.
    static let side: CGFloat = 62
    static let inset: CGFloat = 22

    func makeUIView(context: Context) -> PlusControl {
        let control = PlusControl()
        control.open = open
        control.accent = UIColor(accent)
        control.onCarry = onCarry
        return control
    }

    func updateUIView(_ control: PlusControl, context: Context) {
        control.open = open
        control.accent = UIColor(accent)
        control.onCarry = onCarry
    }
}

final class PlusControl: UIControl, UIDragInteractionDelegate {
    var open: () -> Void = {}
    var accent = UIColor.tintColor
    var onCarry: (Bool) -> Void = { _ in }

    init() {
        super.init(frame: .zero)
        backgroundColor = .clear
        accessibilityLabel = "New Task"
        accessibilityHint = "Hold and move to put the new task in a place"
        isAccessibilityElement = true
        accessibilityTraits = .button
        addAction(UIAction { [weak self] _ in
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            self?.open()
        }, for: .touchUpInside)
        let drag = UIDragInteraction(delegate: self)
        drag.isEnabled = true
        addInteraction(drag)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
        let item = UIDragItem(itemProvider: Carried.provider(Carried.plus))
        item.localObject = Carried.plus
        let accent = accent
        item.previewProvider = { UIDragPreview(view: Self.carried(accent)) }
        return [item]
    }

    func dragInteraction(_ interaction: UIDragInteraction, previewForLifting item: UIDragItem, session: UIDragSession) -> UITargetedDragPreview? {
        let parameters = UIDragPreviewParameters()
        parameters.visiblePath = UIBezierPath(ovalIn: bounds)
        let target = UIDragPreviewTarget(container: self, center: CGPoint(x: bounds.midX, y: bounds.midY))
        return UITargetedDragPreview(view: Self.carried(accent), parameters: parameters, target: target)
    }

    func dragInteraction(_ interaction: UIDragInteraction, sessionWillBegin session: UIDragSession) { onCarry(true) }

    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, didEndWith operation: UIDropOperation) { onCarry(false) }

    func dragInteraction(_ interaction: UIDragInteraction, sessionIsRestrictedToDraggingApplication session: UIDragSession) -> Bool { true }

    /// The plus under the finger: the accent's round button with the plus, as the plugin carries it.
    private static func carried(_ accent: UIColor) -> UIView {
        let side = PlusButton.side
        let view = UIView(frame: CGRect(x: 0, y: 0, width: side, height: side))
        view.backgroundColor = accent
        view.layer.cornerRadius = side / 2
        let plus = UIImageView(image: UIImage(systemName: "plus", withConfiguration: UIImage.SymbolConfiguration(pointSize: 24, weight: .semibold)))
        plus.tintColor = .white
        plus.center = CGPoint(x: side / 2, y: side / 2)
        view.addSubview(plus)
        return view
    }
}
