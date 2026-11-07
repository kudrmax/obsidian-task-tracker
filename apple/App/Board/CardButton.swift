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
    var over = false
    var draggable = true
    /// The card stands in a carry: it gives its place up until the carry ends.
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
            TaskCapsule(card: card, ringed: ringed, height: height, over: over) { [weak control] in control?.counterFrame = $0 }
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
        let look = CardControl.Look(card: card, ringed: ringed, height: height, over: over)
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
    /// Gone from its place while carried; back in it once the system has flown a cancelled carry home.
    var carried = false {
        didSet {
            guard carried != oldValue, !returning else { return }
            alpha = carried ? 0 : 1
        }
    }
    /// What the card is drawn from: it is drawn anew only when this changes, not on every pass of the screen.
    struct Look: Equatable {
        let card: BoardCard
        let ringed: Bool
        let height: CGFloat
        let over: Bool
    }
    var look: Look?
    let content: UIView & UIContentView
    /// Where the capsule draws its subtask counter: the fold button lies there.
    var counterFrame: CGRect? {
        didSet { setNeedsLayout() }
    }
    private let fold = UIButton(type: .custom)
    /// The press's highlight over the capsule, as a button's: outside the content, so a lifted preview never carries it.
    private let press = UIView()
    private var drag: UIDragInteraction!
    /// A menu row that opens a sheet or a page, run once the menu has gone.
    private var afterMenu: (@MainActor () -> Void)?
    /// Where the card stood when it was lifted, in the window: a cancelled carry flies back there.
    private var home: CGPoint?
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
        // The menu on a long press, the card its lifted preview; the drag on the same view takes over once the finger moves.
        addInteraction(UIContextMenuInteraction(delegate: self))
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

    override func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
        onTouch()
        return UIContextMenuConfiguration(identifier: id as NSString, previewProvider: nil) { [weak self] _ in
            self?.menuMaker { run in self?.afterMenu = run }
        }
    }

    override func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configuration: UIContextMenuConfiguration, highlightPreviewForItemWithIdentifier identifier: any NSCopying) -> UITargetedPreview? {
        UITargetedPreview(view: content, parameters: capsule)
    }

    override func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configuration: UIContextMenuConfiguration, dismissalPreviewForItemWithIdentifier identifier: any NSCopying) -> UITargetedPreview? {
        UITargetedPreview(view: content, parameters: capsule)
    }

    override func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willEndFor configuration: UIContextMenuConfiguration, animator: (any UIContextMenuInteractionAnimating)?) {
        guard let run = afterMenu else { return }
        afterMenu = nil
        if let animator { animator.addCompletion { run() } } else { run() }
    }

    // MARK: The carry

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
        let item = UIDragItem(itemProvider: Carried.provider(id))
        item.localObject = id
        return [item]
    }

    /// The lifted card is a still copy of the capsule standing where it stands, not the card itself: the system would show
    /// the card through its preview, and the card giving its place up as the carry begins would blank the preview too.
    func dragInteraction(_ interaction: UIDragInteraction, previewForLifting item: UIDragItem, session: UIDragSession) -> UITargetedDragPreview? {
        let parameters = UIDragPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: content.bounds, cornerRadius: CardMetrics.radius)
        parameters.backgroundColor = .clear
        guard let copy = content.snapshotView(afterScreenUpdates: false) else { return UITargetedDragPreview(view: content, parameters: parameters) }
        copy.bounds = content.bounds
        let target = UIDragPreviewTarget(container: self, center: CGPoint(x: content.frame.midX, y: content.frame.midY))
        return UITargetedDragPreview(view: copy, parameters: parameters, target: target)
    }

    func dragInteraction(_ interaction: UIDragInteraction, sessionIsRestrictedToDraggingApplication session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionAllowsMoveOperation session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionWillBegin session: UIDragSession) {
        home = window.map { convert(CGPoint(x: bounds.midX, y: bounds.midY), to: $0) }
        onCarry(session.location(in: self).y)
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

    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, didEndWith operation: UIDropOperation) {
        if returning { landed() }
        onEnd()
    }

    private func landed() {
        returning = false
        alpha = carried ? 0 : 1
    }
}
