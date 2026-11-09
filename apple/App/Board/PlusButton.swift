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
    /// The board's drag the plus is carried in.
    var drag: DragController?
    var onCarry: () -> Int = { 0 }

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
        control.drag = drag
        drag?.cancelTarget = control
        control.cancelling = cancelling
    }
}

final class PlusControl: UIControl, CancelTarget {
    var open: () -> Void = {}
    weak var drag: DragController?
    var onCarry: () -> Int = { 0 }
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

    /// Where the finger came down, in the window.
    private var start: CGPoint = .zero
    /// The finger has gone further than a tap's tremble at some point of this carry.
    private var wandered = false
    /// This pan lifted the plus.
    private var carrying = false

    /// A finger that moved no further than this and let go is a tap that trembled, not a carry.
    private static let tapReach: CGFloat = 10

    /// The carried plus: the accent's fill and the plus in one solid piece, lifted by a shadow. A glass made at the lift
    /// would first materialize empty and grey, so the finger would pull a blob with no plus in it.
    private func copy() -> UIView {
        let piece = UIView(frame: bounds)
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

    /// Moving the finger lifts the plus at once into the board's drag; let go on a place, the field opens there and the copy
    /// becomes it; on the cancel target, over no place or as a trembled tap, the copy flies home (a tap opens a new task).
    @objc private func carry(_ pan: UIPanGestureRecognizer) {
        guard let drag else { return }
        let point = pan.firstFinger
        switch pan.state {
        case .began:
            guard let window, drag.mayLift else { return }
            let moved = pan.translation(in: nil)
            start = CGPoint(x: point.x - moved.x, y: point.y - moved.y)
            wandered = false
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            let lift = Lift(payload: nil, copy: copy(), frame: convert(bounds, to: window), rises: false, begin: onCarry) { [weak self] in
                self.flatMap { $0.window == nil ? nil : $0.convert($0.bounds, to: nil) }
            }
            carrying = drag.lift(lift, at: point, in: window)
        case .changed:
            guard carrying else { return }
            if hypot(point.x - start.x, point.y - start.y) >= Self.tapReach { wandered = true }
            drag.move(to: point)
        case .ended:
            guard carrying else { return }
            carrying = false
            let trembled = !wandered && hypot(point.x - start.x, point.y - start.y) < Self.tapReach
            if trembled {
                drag.cancel()
                open()
            } else {
                drag.letGo(at: point)
            }
        default:
            guard carrying else { return }
            carrying = false
            drag.cancel()
        }
    }

    /// The plus taken off the screen while carried (the bar hides): the copy goes home.
    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window == nil, carrying else { return }
        carrying = false
        let drag = drag
        DispatchQueue.main.async { drag?.cancel() }
    }

    // MARK: The cancel target

    var area: CGRect? {
        guard let window, !isHidden else { return nil }
        return convert(bounds, to: window)
    }

    func hold(_ held: Bool) { self.held = held }
}
