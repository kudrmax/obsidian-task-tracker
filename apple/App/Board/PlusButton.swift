import SwiftUI
import UIKit

/// The plus beside the tab bar, as in the design: the accent's glass circle with a plus. A tap opens a new task; a long
/// press lifts the plus itself to carry, and letting it go between cards or on the calendar puts the new task there.
/// While anything is carried it is the cancel target: a glass circle with a cross that fills and grows under the finger,
/// and a carry let go on it flies back where it was taken from.
struct PlusButton: UIViewRepresentable {
    let open: () -> Void
    let accent: Color
    /// Something is carried: the plus stands as the cancel target.
    let cancelling: Bool
    var onCarry: () -> Void = {}
    var onCancel: () -> Void = {}
    var onEnd: () -> Void = {}

    /// The design's size of the round button beside the tab bar, and its gap to the screen's edges.
    static let side: CGFloat = 62
    static let inset: CGFloat = 16
    static let bottom: CGFloat = 21

    func makeUIView(context: Context) -> PlusControl {
        let control = PlusControl()
        updateUIView(control, context: context)
        return control
    }

    func updateUIView(_ control: PlusControl, context: Context) {
        control.open = open
        control.accent = UIColor(accent)
        control.onCarry = onCarry
        control.onCancel = onCancel
        control.onEnd = onEnd
        control.cancelling = cancelling
    }
}

final class PlusControl: UIControl, UIDragInteractionDelegate, UIDropInteractionDelegate {
    var open: () -> Void = {}
    var onCarry: () -> Void = {}
    var onCancel: () -> Void = {}
    var onEnd: () -> Void = {}
    var accent = UIColor.tintColor {
        didSet { if accent != oldValue { look() } }
    }
    var cancelling = false {
        didSet {
            guard cancelling != oldValue else { return }
            if !cancelling { held = false }
            look()
        }
    }
    /// A carry held over the cancel target.
    private var held = false {
        didSet {
            guard held != oldValue else { return }
            if held { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
            look()
        }
    }

    private let glass = UIVisualEffectView(effect: nil)
    private let solid = UIView()
    private let symbol = UIImageView()

    init() {
        super.init(frame: CGRect(x: 0, y: 0, width: PlusButton.side, height: PlusButton.side))
        for view in [glass, solid, symbol] as [UIView] {
            view.isUserInteractionEnabled = false
            view.translatesAutoresizingMaskIntoConstraints = false
            addSubview(view)
        }
        NSLayoutConstraint.activate([
            glass.leadingAnchor.constraint(equalTo: leadingAnchor), glass.trailingAnchor.constraint(equalTo: trailingAnchor),
            glass.topAnchor.constraint(equalTo: topAnchor), glass.bottomAnchor.constraint(equalTo: bottomAnchor),
            solid.leadingAnchor.constraint(equalTo: leadingAnchor), solid.trailingAnchor.constraint(equalTo: trailingAnchor),
            solid.topAnchor.constraint(equalTo: topAnchor), solid.bottomAnchor.constraint(equalTo: bottomAnchor),
            symbol.centerXAnchor.constraint(equalTo: centerXAnchor), symbol.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        glass.cornerConfiguration = .capsule()
        glass.clipsToBounds = true
        solid.layer.cornerRadius = PlusButton.side / 2
        symbol.contentMode = .center
        accessibilityLabel = "New Task"
        accessibilityHint = "Hold and move to put the new task in a place"
        isAccessibilityElement = true
        accessibilityTraits = .button
        addAction(UIAction { [weak self] _ in
            guard let self, !self.cancelling else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            self.open()
        }, for: .touchUpInside)
        let drag = UIDragInteraction(delegate: self)
        drag.isEnabled = true
        addInteraction(drag)
        addInteraction(UIDropInteraction(delegate: self))
        look()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override var intrinsicContentSize: CGSize { CGSize(width: PlusButton.side, height: PlusButton.side) }

    /// The plus, the cancel target, or the cancel target held: each change one system spring.
    private func look() {
        let glassEffect = UIGlassEffect(style: .regular)
        glassEffect.isInteractive = !cancelling
        if !cancelling { glassEffect.tintColor = accent }
        let image = UIImage(systemName: cancelling ? "xmark" : "plus", withConfiguration: UIImage.SymbolConfiguration(pointSize: cancelling ? 21 : 24, weight: .semibold))
        UIView.animate(springDuration: 0.35, bounce: 0.2, options: [.beginFromCurrentState, .allowUserInteraction]) {
            glass.effect = glassEffect
            solid.backgroundColor = .label
            solid.alpha = held ? 1 : 0
            symbol.image = image
            symbol.tintColor = held ? .systemBackground : (cancelling ? .label : .white)
            transform = held ? CGAffineTransform(scaleX: 1.18, y: 1.18) : .identity
        }
        accessibilityLabel = cancelling ? "Cancel" : "New Task"
    }

    // MARK: The plus carried

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
        guard !cancelling else { return [] }
        let item = UIDragItem(itemProvider: Carried.provider(Carried.plus))
        item.localObject = Carried.plus
        return [item]
    }

    func dragInteraction(_ interaction: UIDragInteraction, previewForLifting item: UIDragItem, session: UIDragSession) -> UITargetedDragPreview? {
        let parameters = UIDragPreviewParameters()
        parameters.visiblePath = UIBezierPath(ovalIn: bounds)
        parameters.backgroundColor = .clear
        return UITargetedDragPreview(view: self, parameters: parameters)
    }

    func dragInteraction(_ interaction: UIDragInteraction, sessionWillBegin session: UIDragSession) { onCarry() }

    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, willEndWith operation: UIDropOperation) {
        if operation == .cancel { onCancel() }
    }

    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, didEndWith operation: UIDropOperation) { onEnd() }

    func dragInteraction(_ interaction: UIDragInteraction, sessionIsRestrictedToDraggingApplication session: UIDragSession) -> Bool { true }

    // MARK: The cancel target

    func dropInteraction(_ interaction: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
        session.localDragSession != nil
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnter session: any UIDropSession) { held = true }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: any UIDropSession) -> UIDropProposal {
        UIDropProposal(operation: .cancel)
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: any UIDropSession) { held = false }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: any UIDropSession) { held = false }
}
