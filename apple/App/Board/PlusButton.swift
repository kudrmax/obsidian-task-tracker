import SwiftUI
import UIKit

/// The plus beside the tab bar, as in the design: the accent's glass circle with a plus. A tap opens a new task; moving
/// the finger lifts the plus at once, with no hold, as the plugin's plus, and letting it go between cards or on the
/// calendar puts the new task there. While anything is carried it is the cancel target: a glass circle with a cross that
/// fills and grows under the finger; a carry let go on it, or over no place, flies back where it was taken from.
struct PlusButton: UIViewRepresentable {
    let open: () -> Void
    let accent: Color
    /// Something is carried: the plus stands as the cancel target.
    let cancelling: Bool
    /// The places a carried plus is let go on.
    var drop: BoardDrop?
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
        control.drop = drop
        control.cancelling = cancelling
    }
}

final class PlusControl: UIControl, UIDropInteractionDelegate {
    var open: () -> Void = {}
    weak var drop: BoardDrop?
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
        addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(carry(_:))))
        addInteraction(UIDropInteraction(delegate: self))
        look()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func layoutSubviews() {
        super.layoutSubviews()
        solid.layer.cornerRadius = bounds.height / 2
    }

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

    /// The plus as the finger carries it: a lifted copy over the window, while the slot stands as the cancel target.
    private var lifted: UIView?

    @objc private func carry(_ pan: UIPanGestureRecognizer) {
        guard let window else { return }
        let point = pan.location(in: window)
        switch pan.state {
        case .began:
            guard !cancelling, let copy = snapshotView(afterScreenUpdates: false) else { return }
            copy.frame = convert(bounds, to: window)
            copy.layer.shadowColor = UIColor.black.cgColor
            copy.layer.shadowOpacity = 0.25
            copy.layer.shadowRadius = 12
            copy.layer.shadowOffset = CGSize(width: 0, height: 6)
            copy.isUserInteractionEnabled = false
            window.addSubview(copy)
            lifted = copy
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            onCarry()
            UIView.animate(springDuration: 0.3, bounce: 0.15, options: [.allowUserInteraction, .beginFromCurrentState]) {
                copy.center = point
                copy.transform = CGAffineTransform(scaleX: 1.12, y: 1.12)
            }
        case .changed:
            guard let lifted else { return }
            lifted.center = point
            if convert(bounds, to: window).contains(point) {
                held = true
                drop?.carryOff()
            } else {
                held = false
                drop?.carry(at: point)
            }
        case .ended:
            guard lifted != nil else { return }
            let onTarget = convert(bounds, to: window).contains(point)
            // Taken by a place, the field opens there and the plus goes back to its slot under the bar all the same.
            if onTarget || drop?.letGo() != true {
                drop?.carryOff()
                onCancel()
            }
            flyHome()
            onEnd()
        default:
            guard lifted != nil else { return }
            drop?.carryOff()
            onCancel()
            flyHome()
            onEnd()
        }
    }

    /// Let go: the plus flies back into its slot as one piece and stands there
    /// again, as the system returns a cancelled drag.
    private func flyHome() {
        guard let lifted, let window else { return }
        self.lifted = nil
        alpha = 0
        UIView.animate(springDuration: 0.4, bounce: 0.15, options: [.allowUserInteraction]) {
            lifted.transform = .identity
            lifted.center = self.convert(CGPoint(x: self.bounds.midX, y: self.bounds.midY), to: window)
            lifted.layer.shadowOpacity = 0
        } completion: { _ in
            self.alpha = 1
            lifted.removeFromSuperview()
        }
    }

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
