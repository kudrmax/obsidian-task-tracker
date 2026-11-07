import Core
import SwiftUI
import UIKit

/// What a dragged card or the plus carries: a card by its id, or the plus, a task not written yet.
enum Carried {
    static let plus = "\u{0}plus"

    static func provider(_ id: String) -> NSItemProvider { NSItemProvider(object: id as NSString) }
}

/// A card as the design has it, behaving as Files and Podcasts' rows do: a long press lifts it and shows its menu, and
/// moving the finger while it is lifted turns the lift into the drag the lists and the calendar take. Both are UIKit's
/// own interactions on the card, so the lift, the haptics, the menu's growth and the drop's animations are the system's.
/// A tap only highlights it; the subtask counter is its own button, which folds.
struct CardButton: UIViewRepresentable {
    let card: BoardCard
    /// The card's menu; `later` holds a row that opens a sheet or a page until the menu has gone.
    let menu: (_ later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu?
    var ringed = false
    var height: CGFloat = CardMetrics.height
    var draggable = true
    /// The card stands in a carry: it hides once the carried copy has left it, until the carry ends.
    var carried = false
    var onTouch: () -> Void = {}
    /// The card was lifted to carry, the finger this far below its top.
    var onCarry: (CGFloat) -> Void = { _ in }
    /// The carry ended with no drop: on the cancel target, or over no place.
    var onCancel: () -> Void = {}
    /// The drag session ended, whatever came of it.
    var onEnd: () -> Void = {}
    /// A tap on the subtask counter, when the card offers it: its subtasks fold away or show again.
    var onFold: (() -> Void)?

    func makeUIView(context: Context) -> CardControl {
        let control = CardControl(content: configuration(control: nil).makeContentView())
        update(control)
        return control
    }

    private func configuration(control: CardControl?) -> UIHostingConfiguration<TaskCapsule, EmptyView> {
        UIHostingConfiguration {
            TaskCapsule(card: card, ringed: ringed, height: height) { [weak control] in control?.counterFrame = $0 }
        }
        .margins(.all, 0)
    }

    func updateUIView(_ control: CardControl, context: Context) {
        update(control)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: CardControl, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 200, height: max(height, CardMetrics.height))
    }

    private func update(_ control: CardControl) {
        control.id = card.id
        let look = CardControl.Look(card: card, ringed: ringed, height: height)
        if control.look != look {
            control.look = look
            control.content.configuration = configuration(control: control)
        }
        control.menuMaker = menu
        control.onTouch = onTouch
        control.onCarry = onCarry
        control.onCancel = onCancel
        control.onEnd = onEnd
        control.onFold = onFold
        control.draggable = draggable
        control.carried = carried
        control.accessibilityLabel = card.item.title
    }
}

final class CardControl: UIControl, UIDragInteractionDelegate {
    var id = ""
    var menuMaker: (_ later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu? = { _ in nil }
    var onTouch: () -> Void = {}
    var onCarry: (CGFloat) -> Void = { _ in }
    var onCancel: () -> Void = {}
    var onEnd: () -> Void = {}
    var onFold: (() -> Void)? {
        didSet { fold.isHidden = onFold == nil }
    }
    var draggable = true {
        didSet { drag.isEnabled = draggable }
    }
    /// Gone from its place while carried, once the carried card has left it; back in it once the system has flown a
    /// cancelled carry home.
    var carried = false {
        didSet {
            guard carried != oldValue else { return }
            // The carry is over (its drop drawn, or cancelled): the next carry starts from the card in its place.
            if !carried { left = false }
            guard !returning else { return }
            showsInPlace()
        }
    }
    /// What the card is drawn from: it is drawn anew only when this changes, not on every pass of the screen.
    struct Look: Equatable {
        let card: BoardCard
        let ringed: Bool
        let height: CGFloat
    }
    var look: Look?
    let content: UIView & UIContentView
    /// Where the capsule draws its subtask counter: the fold button lies there.
    var counterFrame: CGRect? {
        didSet { setNeedsLayout() }
    }
    private let fold = UIButton(type: .custom)
    /// Shows the menu, anchored to the card, when a tap has ended.
    private lazy var opener = MenuOpener { [weak self] in self?.menuEnded($0) }
    /// The press's highlight over the capsule, as a button's: outside the content, so a lifted preview never carries it.
    private let press = UIView()
    private var drag: UIDragInteraction!
    /// A menu row that opens a sheet or a page, run once the menu has begun to go.
    private var afterMenu: (@MainActor () -> Void)?
    /// Where the card stood when it was lifted, in the window: a cancelled carry flies back there.
    private var home: CGPoint?
    /// The carried card has moved off its place: only then does the card hide, so the lift (from a long press or from the
    /// open menu) always has the capsule itself to lift, and no frame shows neither.
    private var left = false
    /// How far below the card's top the finger held it as the drag began.
    private var grab: CGFloat = 0
    /// A cancelled carry is flying home: the card shows again once it lands.
    private var returning = false

    init(content: UIView & UIContentView) {
        self.content = content
        super.init(frame: .zero)
        content.isUserInteractionEnabled = false
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: leadingAnchor),
            content.trailingAnchor.constraint(equalTo: trailingAnchor),
            content.topAnchor.constraint(equalTo: topAnchor),
            content.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        press.isUserInteractionEnabled = false
        press.backgroundColor = .label.withAlphaComponent(0.12)
        press.alpha = 0
        press.layer.cornerRadius = CardMetrics.radius
        press.layer.cornerCurve = .continuous
        addSubview(press)
        fold.isHidden = true
        fold.accessibilityLabel = "Subtasks"
        fold.accessibilityHint = "Folds the subtasks away or shows them again"
        fold.addAction(UIAction { [weak self] _ in
            UISelectionFeedbackGenerator().selectionChanged()
            self?.onFold?()
        }, for: .touchUpInside)
        addSubview(fold)
        addAction(UIAction { [weak self] _ in self?.onTouch() }, for: .touchUpInside)
        // A tap opens the menu once the finger is up, as the plugin's tap does; a long press lifts the card for the drag.
        addSubview(opener)
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
        drag = UIDragInteraction(delegate: self)
        drag.isEnabled = true
        addInteraction(drag)
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func layoutSubviews() {
        super.layoutSubviews()
        press.frame = bounds
        opener.frame = bounds
        // The counter's own button, as tall as the card and a little wider than the digits, as the plugin's hit area.
        if let counter = counterFrame {
            fold.frame = CGRect(x: counter.minX - Self.foldReach, y: 0, width: counter.width + Self.foldReach * 2, height: min(bounds.height, CardMetrics.height))
        }
    }

    private static let foldReach: CGFloat = 6

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            UIView.animate(withDuration: isHighlighted ? 0 : 0.25, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
                self.press.alpha = self.isHighlighted ? 1 : 0
            }
        }
    }

    private var capsule: UIPreviewParameters {
        let parameters = UIPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: content.bounds, cornerRadius: CardMetrics.radius)
        parameters.backgroundColor = .clear
        return parameters
    }

    // MARK: The menu

    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        onTouch()
        openMenu(at: tap.location(in: opener))
    }

    private func openMenu(at point: CGPoint) {
        guard let menu = menuMaker({ [weak self] run in self?.afterMenu = run }) else { return }
        opener.present(menu, at: point) { [weak self] in
            guard let self else { return nil }
            return UITargetedPreview(view: self.content, parameters: self.capsule)
        }
    }

    /// A row that opens a sheet or a page runs once the menu has gone.
    private func menuEnded(_ animator: (any UIContextMenuInteractionAnimating)?) {
        guard let run = afterMenu else { return }
        afterMenu = nil
        // As the menu starts to go, not when its animation ends: the animator completes about a second later.
        DispatchQueue.main.async { run() }
    }

    // MARK: The carry

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
        // Where the finger holds the card, read while the touch still stands on it: once the lift (or the menu's) has
        // begun, the session reports the point against the lifted preview, which is no longer where the card stands.
        grab = session.location(in: self).y
        let item = UIDragItem(itemProvider: Carried.provider(id))
        item.localObject = id
        return [item]
    }

    /// The capsule itself is lifted: from an open menu the system turns the menu's preview, this capsule, into the carried
    /// card, and only a lift of the same view lets the menu give way to the drag.
    func dragInteraction(_ interaction: UIDragInteraction, previewForLifting item: UIDragItem, session: UIDragSession) -> UITargetedDragPreview? {
        let parameters = UIDragPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: content.bounds, cornerRadius: CardMetrics.radius)
        parameters.backgroundColor = .clear
        return UITargetedDragPreview(view: content, parameters: parameters)
    }

    func dragInteraction(_ interaction: UIDragInteraction, sessionDidMove session: UIDragSession) {
        guard !left else { return }
        left = true
        showsInPlace()
    }

    func dragInteraction(_ interaction: UIDragInteraction, sessionIsRestrictedToDraggingApplication session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionAllowsMoveOperation session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionWillBegin session: UIDragSession) {
        home = window.map { convert(CGPoint(x: bounds.midX, y: bounds.midY), to: $0) }
        onCarry(grab)
    }

    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, willEndWith operation: UIDropOperation) {
        guard operation == .cancel else { return }
        // The row takes its place back at once; the card itself shows when the system's preview has flown into it.
        returning = true
        onCancel()
    }

    func dragInteraction(_ interaction: UIDragInteraction, previewForCancelling item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
        guard let window, let home else { return defaultPreview }
        return defaultPreview.retargetedPreview(with: UIDragPreviewTarget(container: window, center: home))
    }

    func dragInteraction(_ interaction: UIDragInteraction, item: UIDragItem, willAnimateCancelWith animator: any UIDragAnimating) {
        animator.addCompletion { [weak self] _ in self?.landed() }
    }

    /// A drop keeps the card hidden while its write is drawn: it shows again only where the screen then draws it.
    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, didEndWith operation: UIDropOperation) {
        if !carried { left = false }
        if returning { landed() } else { showsInPlace() }
        onEnd()
    }

    private func showsInPlace() {
        alpha = carried && left ? 0 : 1
    }

    private func landed() {
        returning = false
        showsInPlace()
    }
}

/// The card's menu, opened by the card once a tap ends rather than on the touch, so a long press stays the drag's. It
/// takes no touches itself; the system's context menu is shown at the tap's point.
final class MenuOpener: UIView, UIContextMenuInteractionDelegate {
    private let ended: ((any UIContextMenuInteractionAnimating)?) -> Void
    private var menu: UIMenu?
    private var preview: (() -> UITargetedPreview?)?
    private lazy var interaction = UIContextMenuInteraction(delegate: self)

    init(ended: @escaping ((any UIContextMenuInteractionAnimating)?) -> Void) {
        self.ended = ended
        super.init(frame: .zero)
        addInteraction(interaction)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool { false }

    func present(_ menu: UIMenu, at point: CGPoint, preview: @escaping () -> UITargetedPreview?) {
        self.menu = menu
        self.preview = preview
        let selector = NSSelectorFromString("_presentMenuAtLocation:")
        guard interaction.responds(to: selector), let method = interaction.method(for: selector) else { return }
        typealias Present = @convention(c) (AnyObject, Selector, CGPoint) -> Void
        unsafeBitCast(method, to: Present.self)(interaction, selector, point)
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
        guard let menu else { return nil }
        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { _ in menu }
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configuration: UIContextMenuConfiguration, highlightPreviewForItemWithIdentifier identifier: any NSCopying) -> UITargetedPreview? {
        preview?()
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configuration: UIContextMenuConfiguration, dismissalPreviewForItemWithIdentifier identifier: any NSCopying) -> UITargetedPreview? {
        preview?()
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willEndFor configuration: UIContextMenuConfiguration, animator: (any UIContextMenuInteractionAnimating)?) {
        ended(animator)
    }
}
