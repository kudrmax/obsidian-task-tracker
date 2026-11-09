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
    var drop: BoardRoute?
    var onCarry: () -> Int = { 0 }
    var onEnd: (Int) -> Void = { _ in }

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
        control.onEnd = onEnd
        control.drop = drop
        control.cancelling = cancelling
    }
}

final class PlusControl: UIControl, UIDropInteractionDelegate {
    var open: () -> Void = {}
    weak var drop: BoardRoute?
    var onCarry: () -> Int = { 0 }
    var onEnd: (Int) -> Void = { _ in }
    /// The carry the plus's copy is: what its end names.
    private var token = 0
    var accent = UIColor.tintColor {
        didSet { if accent != oldValue { tinted.effect = Self.glass(tint: accent) } }
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

    /// The cancel target's glass, and over it the plus's, tinted in the accent: each glass is made once and never
    /// changed, the plus's shown or not by its opacity. A glass whose effect a spring changed and the next change cut
    /// off kept the untinted look whatever effect it was given next: the plus stayed grey after a drop and a new lift.
    private let glass = UIVisualEffectView(effect: PlusControl.glass(tint: nil))
    private let tinted = UIVisualEffectView(effect: nil)
    private let solid = UIView()
    private let symbol = UIImageView()

    init() {
        super.init(frame: CGRect(x: 0, y: 0, width: PlusButton.side, height: PlusButton.side))
        for view in [glass, tinted, solid, symbol] as [UIView] {
            view.isUserInteractionEnabled = false
            view.translatesAutoresizingMaskIntoConstraints = false
            addSubview(view)
        }
        NSLayoutConstraint.activate([
            glass.leadingAnchor.constraint(equalTo: leadingAnchor), glass.trailingAnchor.constraint(equalTo: trailingAnchor),
            glass.topAnchor.constraint(equalTo: topAnchor), glass.bottomAnchor.constraint(equalTo: bottomAnchor),
            tinted.leadingAnchor.constraint(equalTo: leadingAnchor), tinted.trailingAnchor.constraint(equalTo: trailingAnchor),
            tinted.topAnchor.constraint(equalTo: topAnchor), tinted.bottomAnchor.constraint(equalTo: bottomAnchor),
            solid.leadingAnchor.constraint(equalTo: leadingAnchor), solid.trailingAnchor.constraint(equalTo: trailingAnchor),
            solid.topAnchor.constraint(equalTo: topAnchor), solid.bottomAnchor.constraint(equalTo: bottomAnchor),
            symbol.centerXAnchor.constraint(equalTo: centerXAnchor), symbol.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        for view in [glass, tinted] {
            view.cornerConfiguration = .capsule()
            view.clipsToBounds = true
        }
        tinted.effect = Self.glass(tint: accent)
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

    /// What the plus shows: a function of its state alone.
    private struct Look: Equatable {
        let cancelling: Bool
        let held: Bool
    }

    /// The look last asked for.
    private var shown: Look?

    /// The plus, the cancel target, or the cancel target held: each change one system spring. The look is a function of
    /// the state, applied again whole once each spring settles: a spring the next change cut off (a drop, then at once a
    /// new lift) never leaves the glass at a look between the two, the plus grey and untinted.
    private func look() {
        let look = Look(cancelling: cancelling, held: held)
        guard look != shown else { return }
        shown = look
        let image = UIImage(systemName: look.cancelling ? "xmark" : "plus", withConfiguration: UIImage.SymbolConfiguration(pointSize: look.cancelling ? 21 : 24, weight: .semibold))
        // One motion per thing: the symbol by the system's own replace, the rest on the system's default spring.
        if let image, symbol.image != nil { symbol.setSymbolImage(image, contentTransition: .replace) } else { symbol.image = image }
        UIView.animate(springDuration: 0.35, bounce: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.apply(look)
        } completion: { [weak self] _ in
            guard let self, self.shown == look else { return }
            UIView.performWithoutAnimation { self.apply(look) }
        }
        accessibilityLabel = look.cancelling ? "Cancel" : "New Task"
    }

    private static func glass(tint: UIColor?) -> UIGlassEffect {
        let glass = UIGlassEffect(style: .regular)
        // Not the interactive glass: it would stretch after the finger while the plus itself is carried.
        glass.isInteractive = false
        glass.tintColor = tint
        return glass
    }

    private func apply(_ look: Look) {
        tinted.alpha = look.cancelling ? 0 : 1
        solid.backgroundColor = .label
        solid.alpha = look.held ? 1 : 0
        symbol.tintColor = look.held ? .systemBackground : (look.cancelling ? .label : .white)
        transform = look.held ? CGAffineTransform(scaleX: 1.18, y: 1.18) : .identity
    }

    // MARK: The plus carried

    /// The plus as the finger carries it: a live copy over the window, the same glass and symbol, while the slot stands as
    /// the cancel target, touchable all the while: a finger that comes down on it while the copy flies home catches the copy. No shadow or scale of its own: the glass is the plus's look wherever it is.
    private var lifted: UIView?
    /// The copy flying back into the slot.
    private var homing: UIView?
    /// Where the finger came down, in the window.
    private var start: CGPoint = .zero
    /// The finger has gone further than a tap's tremble at some point of this carry.
    private var wandered = false

    /// A finger that moved no further than this and let go is a tap that trembled, not a carry.
    private static let tapReach: CGFloat = 10

    /// The carried plus: the accent's fill and the plus in one solid piece, lifted by a shadow. A glass made at the lift
    /// would first materialize empty and grey, so the finger would pull a blob with no plus in it.
    private func copy(in window: UIWindow) -> UIView {
        let piece = UIView(frame: convert(bounds, to: window))
        piece.backgroundColor = accent
        piece.layer.cornerRadius = piece.bounds.height / 2
        piece.layer.shadowColor = UIColor.black.cgColor
        piece.layer.shadowOpacity = traitCollection.userInterfaceStyle == .dark ? 0.7 : 0.18
        piece.layer.shadowRadius = 16
        piece.layer.shadowOffset = CGSize(width: 0, height: 14)
        piece.isUserInteractionEnabled = false
        let symbol = UIImageView(image: UIImage(systemName: "plus", withConfiguration: UIImage.SymbolConfiguration(pointSize: 24, weight: .semibold)))
        symbol.tintColor = .white
        symbol.contentMode = .center
        symbol.frame = piece.bounds
        symbol.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        piece.addSubview(symbol)
        return piece
    }

    /// Where the finger holds the carried plus, from its middle: it moves with the finger from the first point, no jump.
    private var grip: CGPoint = .zero

    @objc private func carry(_ pan: UIPanGestureRecognizer) {
        switch pan.state {
        case .began:
            guard let window, !cancelling else { return }
            let point = pan.location(in: window)
            let moved = pan.translation(in: window)
            start = CGPoint(x: point.x - moved.x, y: point.y - moved.y)
            wandered = false
            lifted = catchHoming() ?? {
                let made = copy(in: window)
                window.addSubview(made)
                return made
            }()
            if let lifted { grip = CGPoint(x: point.x - lifted.center.x, y: point.y - lifted.center.y) }
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            token = onCarry()
        case .changed:
            guard let lifted, let space = lifted.superview else { return }
            let point = pan.location(in: space)
            lifted.center = CGPoint(x: point.x - grip.x, y: point.y - grip.y)
            if hypot(point.x - start.x, point.y - start.y) >= Self.tapReach { wandered = true }
            if convert(bounds, to: space).contains(point) {
                held = true
                drop?.carryOff()
            } else {
                held = false
                drop?.carry(at: point)
            }
        case .ended:
            guard let lifted, let space = lifted.superview else { return }
            let point = pan.location(in: space)
            let trembled = !wandered && hypot(point.x - start.x, point.y - start.y) < Self.tapReach
            let onTarget = convert(bounds, to: space).contains(point)
            // Taken by a place, the field opens there and the copy becomes its place; otherwise it flies home, and the
            // carry ends once it is there.
            if !trembled, !onTarget, case .taken(let field) = drop?.letGo() ?? .missed {
                if let field {
                    become(field)
                    onEnd(token)
                } else {
                    flyHome()
                }
                return
            }
            drop?.carryOff()
            flyHome()
            if trembled { open() }
        default:
            guard lifted != nil else { return }
            drop?.carryOff()
            flyHome()
        }
    }

    /// The copy flying home, stopped where it shows now and handed to the finger.
    private func catchHoming() -> UIView? {
        guard let homing else { return nil }
        self.homing = nil
        let shown = homing.layer.presentation()?.position ?? homing.center
        homing.layer.removeAllAnimations()
        homing.center = shown
        return homing
    }

    /// Let go: the plus flies back into its slot as one piece and stands there again, as the system returns a cancelled
    /// drag; the carry ends once it is there (the slot turns from the cancel target back into the plus then, not while the
    /// copy flies). A finger that comes down on the plus before it lands takes it again from where it flies.
    private func flyHome() {
        guard let lifted else { return onEnd(token) }
        self.lifted = nil
        guard let space = lifted.superview, window != nil else {
            settle(lifted)
            return onEnd(token)
        }
        homing = lifted
        UIView.animate(springDuration: 0.4, bounce: 0.15, options: [.allowUserInteraction]) {
            lifted.center = self.convert(CGPoint(x: self.bounds.midX, y: self.bounds.midY), to: space)
        } completion: { _ in
            guard self.homing === lifted else { return }
            self.settle(lifted)
            self.onEnd(self.token)
        }
    }

    /// Taken by a place: the copy grows into the field's place there (`field`, in the window) and gives way to the field
    /// that opens in it, never flying back over the bar.
    private func become(_ field: CGRect) {
        guard let lifted else { return }
        self.lifted = nil
        guard let space = lifted.superview else { return settle(lifted) }
        let target = space.convert(field, from: nil)
        UIView.animate(springDuration: 0.35, bounce: 0, options: [.allowUserInteraction]) {
            lifted.bounds = CGRect(origin: .zero, size: target.size)
            lifted.center = CGPoint(x: target.midX, y: target.midY)
            lifted.layer.cornerRadius = CardMetrics.radius
            lifted.layer.shadowOpacity = 0
            lifted.alpha = 0
        } completion: { _ in
            lifted.removeFromSuperview()
        }
    }

    /// The copy gone and the plus in its slot again.
    private func settle(_ copy: UIView) {
        copy.removeFromSuperview()
        if homing === copy { homing = nil }
    }

    /// The plus taken off the screen while carried or flying home (the bar hides): the carry ends and no copy is left.
    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window == nil else { return }
        if lifted == nil, homing != nil {
            let (onEnd, token) = (onEnd, token)
            DispatchQueue.main.async { onEnd(token) }
        }
        if lifted != nil {
            let (drop, onEnd, token) = (drop, onEnd, token)
            // Out of the screen's update that took the plus away.
            DispatchQueue.main.async {
                drop?.carryOff()
                onEnd(token)
            }
        }
        for copy in [lifted, homing].compactMap({ $0 }) { settle(copy) }
        lifted = nil
    }

    // MARK: The cancel target

    func dropInteraction(_ interaction: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
        session.localDragSession != nil
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnter session: any UIDropSession) { held = true }

    /// Let go on the cancel target, the carry is a drop that flies its copy home: it ends when the copy is down.
    func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: any UIDropSession) -> UIDropProposal {
        UIDropProposal(operation: .move)
    }

    func dropInteraction(_ interaction: UIDropInteraction, performDrop session: any UIDropSession) {
        drop?.sendHome(session)
    }

    func dropInteraction(_ interaction: UIDropInteraction, previewForDropping item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
        drop?.preview(defaultPreview, item: item)
    }

    func dropInteraction(_ interaction: UIDropInteraction, item: UIDragItem, willAnimateDropWith animator: any UIDragAnimating) {
        drop?.model?.landing(item, animator)
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: any UIDropSession) { held = false }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: any UIDropSession) {
        held = false
        drop?.model?.endCarry(of: session)
    }
}
