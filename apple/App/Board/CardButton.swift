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
    /// A tap on a link of the title: it opens, in place of the menu.
    var onLink: ((TextPart) -> Void)?
    /// A tap on the project's folder mark, when its note can open: the note opens, in place of the menu.
    var onProject: (() -> Void)?
    /// Select Tasks: a tap picks the card or lets it go, and a picked card lifted carries every picked task as a stack.
    var picking: Picking?

    struct Picking {
        let picked: Bool
        /// How many tasks are picked: the stack a lift carries.
        let count: Int
        let toggle: () -> Void
    }

    func makeUIView(context: Context) -> CardControl {
        let control = CardControl(content: configuration(control: nil).makeContentView())
        update(control)
        return control
    }

    private func configuration(control: CardControl?) -> UIHostingConfiguration<TaskCapsule, EmptyView> {
        UIHostingConfiguration {
            TaskCapsule(
                card: card, ringed: ringed, height: height,
                onCounter: { [weak control] in control?.counterFrame = $0 },
                onTitle: { [weak control] in control?.titleFrame = $0 },
                onLinks: { [weak control] in control?.links = $0 },
                onFolder: { [weak control] in control?.folderFrame = $0 })
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
        control.menuMaker = menu
        if control.look != look {
            control.look = look
            control.content.configuration = configuration(control: control)
        }
        CardControl.follow(card: card, look: look, menu: menu, from: control)
        control.onTouch = onTouch
        control.onCarry = onCarry
        control.onCancel = onCancel
        control.onEnd = onEnd
        control.onFold = onFold
        control.onLink = onLink
        control.onProject = onProject
        control.picking = picking
        control.draggable = picking.map(\.picked) ?? draggable
        control.carried = carried
        control.liftDelay = CardMetrics.press
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
    var onLink: ((TextPart) -> Void)?
    var onProject: (() -> Void)?
    var picking: CardButton.Picking?
    /// Where the title's links are drawn, and the project's folder mark.
    var links: [CardLink] = []
    var folderFrame: CGRect?
    var draggable = true {
        didSet { drag.isEnabled = draggable }
    }
    /// How long a press waits before it lifts the card: the shared settings' long press, as the plugin's.
    var liftDelay: TimeInterval = CardMetrics.press {
        didSet { if liftDelay != oldValue { holdLift() } }
    }

    /// The drag interaction lifts by its own long press: it waits the settings' delay, not the system's.
    private func holdLift() {
        for press in gestureRecognizers ?? [] where press is UILongPressGestureRecognizer {
            (press as? UILongPressGestureRecognizer)?.minimumPressDuration = liftDelay
        }
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
    /// Where the capsule's title has its room: the menu's copy grows by what the title lacks of it.
    var titleFrame: CGRect?
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
        holdLift()
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

    /// The card whose menu is up. A write from it that keeps it open (a label) draws the task as a new card, the line
    /// being another: the menu follows the task by its place in the file.
    private static weak var menuOwner: CardControl?
    /// A card's menu is up.
    static var menuShowing: Bool { menuOwner?.opener.showing == true }
    /// The card whose menu opened last and where it stood on the screen: Add Subtask on a calendar card lifts it there.
    static private(set) var lastLifted: (card: BoardCard, frame: CGRect)?

    /// A card drawn: when it is the task whose menu shows, the menu and the copy over it take the new drawing.
    static func follow(card: BoardCard, look: Look, menu: @escaping (_ later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu?, from control: CardControl) {
        guard let owner = menuOwner, owner.opener.showing, let shown = owner.look else { return }
        let same = shown.card.item.key.section == card.item.key.section && shown.card.item.key.index == card.item.key.index && shown.card.item.key.path == card.item.key.path
        guard same, shown != look || owner === control else { return }
        owner.menuMaker = menu
        owner.redrawn(look)
    }

    /// The card drawn anew while its menu shows (a label set from the menu, which stays open): the menu ticks it, and the
    /// copy over it takes the new colours, as the plugin's card over its menu does.
    private func redrawn(_ look: Look) {
        if self.look != look {
            self.look = look
            content.configuration = UIHostingConfiguration { TaskCapsule(card: look.card, ringed: look.ringed, height: look.height) }.margins(.all, 0)
        }
        if let copy = wholeCopy {
            copy.configuration = UIHostingConfiguration { TaskCapsule(card: look.card, height: look.height, whole: true) }.margins(.all, 0)
        }
        if let menu = menuMaker({ [weak self] run in self?.afterMenu = run }) { opener.refresh(menu) }
    }

    /// The grown copy the open menu lifts, while it shows.
    private var wholeCopy: (UIView & UIContentView)?

    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        onTouch()
        if let picking {
            UISelectionFeedbackGenerator().selectionChanged()
            picking.toggle()
            return
        }
        let point = tap.location(in: self)
        // A link opens and the folder mark opens the project's note, as the plugin's card: only within the title's room,
        // where the link is seen.
        if let onLink, let link = links.first(where: { $0.frame.insetBy(dx: -2, dy: -8).contains(point) && (titleFrame?.contains(CGPoint(x: point.x, y: titleFrame?.midY ?? 0)) ?? true) }) {
            onLink(link.part)
            return
        }
        if let onProject, let folder = folderFrame, folder.insetBy(dx: -4, dy: -8).contains(point) {
            onProject()
            return
        }
        openMenu(at: tap.location(in: opener))
    }

    private func openMenu(at point: CGPoint) {
        guard let menu = menuMaker({ [weak self] run in self?.afterMenu = run }) else { return }
        Self.menuOwner = self
        if let look, let window { Self.lastLifted = (look.card, convert(bounds, to: window)) }
        opener.present(menu, at: point) { [weak self] in
            // A card drawn anew while its menu showed has left the screen: the menu goes without a preview.
            guard let self, self.window != nil else { return nil }
            if let whole = self.wholePreview() {
                // The grown copy stands in for the card: the card itself is not seen beside it under the backdrop.
                self.content.alpha = 0
                return whole
            }
            return UITargetedPreview(view: self.content, parameters: self.capsule)
        }
    }

    /// The copy the menu lifts when the card cuts its title, as the plugin's: as wide as the core says (`rules.wholeWidth`),
    /// and where the title still doesn't fit, wrapped onto more lines with the copy grown down. It stands where the core
    /// places it (`rules.grownStart`). A card that shows its whole title is lifted itself.
    private func wholePreview() -> UITargetedPreview? {
        guard let look, let window, let room = titleFrame else { return nil }
        let board = AppServices.shared.board
        let text = look.card.item.text as NSString
        let natural = text.size(withAttributes: [.font: UIFont.systemFont(ofSize: CardMetrics.title)]).width
        let margin = Double(CardMetrics.wholeMargin)
        let fit = TitleFit(width: Double(bounds.width), titleWidth: Double(room.width), textWidth: Double(natural), fade: Double(CardMetrics.fade))
        guard let grown = try? board.wholeWidth(card: fit, room: Double(window.bounds.width), margin: margin) else { return nil }
        let width = CGFloat(grown.width)
        let copy = UIHostingConfiguration {
            TaskCapsule(card: look.card, height: look.height, whole: true)
        }
        .margins(.all, 0)
        .makeContentView()
        copy.overrideUserInterfaceStyle = traitCollection.userInterfaceStyle
        let height = max(bounds.height, copy.systemLayoutSizeFitting(CGSize(width: width, height: UIView.layoutFittingCompressedSize.height), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height.rounded(.up))
        copy.frame = CGRect(x: 0, y: 0, width: width, height: height)
        wholeCopy = copy
        let card = convert(bounds, to: window)
        guard let left = try? board.grownStart(Double(card.minX), size: Double(card.width), grown: grown.width, room: Double(window.bounds.width), margin: margin),
              let top = try? board.grownStart(Double(card.minY), size: Double(card.height), grown: Double(height), room: Double(window.bounds.height), margin: margin)
        else { return nil }
        let parameters = UIPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: copy.bounds, cornerRadius: CardMetrics.radius)
        parameters.backgroundColor = .clear
        return UITargetedPreview(view: copy, parameters: parameters, target: UIPreviewTarget(container: window, center: CGPoint(x: CGFloat(left) + width / 2, y: CGFloat(top) + height / 2)))
    }

    /// A row that opens a sheet or a page runs once the menu has gone.
    private func menuEnded(_ animator: (any UIContextMenuInteractionAnimating)?) {
        wholeCopy = nil
        if let animator { animator.addCompletion { [weak self] in self?.content.alpha = 1 } } else { content.alpha = 1 }
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
        if let stack = stackPreview() { return stack }
        // Lifted from a menu that showed a grown copy instead: the capsule shows again to be carried.
        content.alpha = 1
        let parameters = UIDragPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: content.bounds, cornerRadius: CardMetrics.radius)
        parameters.backgroundColor = .clear
        return UITargetedDragPreview(view: content, parameters: parameters)
    }

    /// Several picked tasks lifted: the card on two layers with their number, as the plugin's carried stack.
    private func stackPreview() -> UITargetedDragPreview? {
        guard let picking, picking.count > 1, let look, let window else { return nil }
        let stack = UIHostingConfiguration { StackFloat(card: look.card, count: picking.count, width: bounds.width) }.margins(.all, 0).makeContentView()
        stack.overrideUserInterfaceStyle = traitCollection.userInterfaceStyle
        stack.backgroundColor = .clear
        let size = stack.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
        stack.frame = CGRect(origin: .zero, size: size)
        let parameters = UIDragPreviewParameters()
        parameters.backgroundColor = .clear
        parameters.visiblePath = UIBezierPath(rect: stack.bounds)
        let origin = convert(CGPoint(x: -StackFloat.room, y: -StackFloat.room), to: window)
        let center = CGPoint(x: origin.x + size.width / 2, y: origin.y + size.height / 2)
        return UITargetedDragPreview(view: stack, parameters: parameters, target: UIDragPreviewTarget(container: window, center: center))
    }

    func dragInteraction(_ interaction: UIDragInteraction, sessionDidMove session: UIDragSession) {
        guard !left else { return }
        left = true
        showsInPlace()
    }

    func dragInteraction(_ interaction: UIDragInteraction, sessionIsRestrictedToDraggingApplication session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionAllowsMoveOperation session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionWillBegin session: UIDragSession) {
        content.alpha = 1
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
    /// The menu is up.
    private(set) var showing = false
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
        showing = true
        let selector = NSSelectorFromString("_presentMenuAtLocation:")
        guard interaction.responds(to: selector), let method = interaction.method(for: selector) else { return }
        typealias Present = @convention(c) (AnyObject, Selector, CGPoint) -> Void
        unsafeBitCast(method, to: Present.self)(interaction, selector, point)
    }

    /// The open menu drawn from `menu`, in place: its rows ticked anew without closing it.
    func refresh(_ menu: UIMenu) {
        self.menu = menu
        interaction.updateVisibleMenu { _ in menu }
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
        showing = false
        ended(animator)
    }
}
