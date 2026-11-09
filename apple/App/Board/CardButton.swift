import Core
import SwiftUI
import UIKit

/// What a dragged card or the plus carries: a card by its id, or the plus, a task not written yet.
enum Carried {
    static let plus = "\u{0}plus"
    /// The type the carried thing is offered as, to this app's process only.
    static let type = "com.kudrmax.taskcalendar.carried"

    /// The carried thing for the system's drag: of a type only this app's process knows, so no field or other app takes
    /// it as text; the board's own drop reads what is carried from the carry, not from here.
    static func provider(_ id: String) -> NSItemProvider {
        let provider = NSItemProvider()
        provider.registerDataRepresentation(forTypeIdentifier: type, visibility: .ownProcess) { done in
            done(Data(id.utf8), nil)
            return nil
        }
        return provider
    }
}

/// A card as the design has it: a tap opens its menu, as the plugin's card; the subtask counter is its own button, which
/// folds. In a list the list's own collection lifts it; on the calendar, where no list holds it, the card's own drag
/// interaction does (`draggable`), with the same drag items the lists and the calendar take.
struct CardButton: UIViewRepresentable {
    let card: BoardCard
    /// The task's new text while its rename is written: drawn instead of the text as read.
    var renamedText: String?
    /// The card's menu; `later` holds a row that opens a sheet or a page until the menu has gone.
    let menu: (_ later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu?
    var ringed = false
    var height: CGFloat = CardMetrics.height
    var draggable = false
    /// The card is carried: its place is the gap it was lifted from, until the carry ends.
    var carried = false
    var onTouch: () -> Void = {}
    /// The card's own drag began: the carry's token, which its end names.
    var onCarry: () -> Int = { 0 }
    /// The card's own drag session ended, whatever came of it.
    var onEnd: (Int) -> Void = { _ in }
    /// Where the card's own drag lifts it from.
    var from = "timeline"
    /// A tap on the subtask counter, when the card offers it: its subtasks fold away or show again.
    var onFold: (() -> Void)?
    /// A tap on a link of the title: it opens, in place of the menu.
    var onLink: ((TextPart) -> Void)?
    /// A tap on the project's folder mark: the project's note opens, in place of the menu.
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
                card: card, text: renamedText, ringed: ringed, height: height,
                onCounter: { [weak control] in control?.counterFrame = $0 },
                onTitle: { [weak control] in control?.titleFrame = $0 },
                onLinks: { [weak control] in control?.links = $0 },
                onMark: { [weak control] in control?.markFrame = $0 })
        }
        .margins(.all, 0)
    }

    func updateUIView(_ control: CardControl, context: Context) {
        update(control)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: CardControl, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? uiView.bounds.width, height: max(height, CardMetrics.height))
    }

    private func update(_ control: CardControl) {
        control.id = card.id
        let look = CardControl.Look(card: card, text: renamedText, ringed: ringed, height: height)
        control.menuMaker = menu
        if control.look != look {
            control.look = look
            control.content.configuration = configuration(control: control)
        }
        CardControl.follow(card: card, look: look, menu: menu, from: control)
        control.onTouch = onTouch
        control.onCarry = onCarry
        control.onEnd = onEnd
        control.from = from
        control.onFold = onFold
        control.onLink = onLink
        // The folder mark opens the note only where the note can open, and never while tasks are being picked.
        control.onProject = picking == nil && card.item.project?.mark == true && card.item.project?.canOpenNote == true ? onProject : nil
        control.picking = picking
        control.draggable = draggable
        control.carried = carried
        control.accessibilityLabel = card.item.title
    }
}

final class CardControl: UIControl, UIDragInteractionDelegate {
    var id = ""
    var menuMaker: (_ later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu? = { _ in nil }
    var onTouch: () -> Void = {}
    var onCarry: () -> Int = { 0 }
    var onEnd: (Int) -> Void = { _ in }
    var from = "timeline"
    var onFold: (() -> Void)? {
        didSet { fold.isHidden = onFold == nil }
    }
    var onLink: ((TextPart) -> Void)?
    var onProject: (() -> Void)? {
        didSet { mark.isHidden = onProject == nil }
    }
    var picking: CardButton.Picking?
    /// Where the title's links are drawn.
    var links: [CardLink] = []
    var draggable = false {
        didSet { drag.isEnabled = draggable }
    }
    /// Gone from its place while carried: the system's copy is the card until the carry ends.
    var carried = false {
        didSet { if carried != oldValue { showsInPlace() } }
    }
    /// What the card is drawn from: it is drawn anew only when this changes, not on every pass of the screen.
    struct Look: Equatable {
        let card: BoardCard
        let text: String?
        let ringed: Bool
        let height: CGFloat
    }
    var look: Look?
    let content: UIView & UIContentView
    /// What hides the card while it is carried or its menu's copy stands for it: the content's holder, decided in `showsInPlace` alone. The content's own
    /// alpha is the system's (its lift), which sets it and gives it back on its own schedule: hiding the card through the
    /// same property was overwritten by it, or overwrote it.
    private let shown = UIView()
    /// Where the capsule draws its subtask counter: the fold button lies there.
    var counterFrame: CGRect? {
        didSet { setNeedsLayout() }
    }
    /// Where the capsule's title has its room: the menu's copy grows by what the title lacks of it.
    var titleFrame: CGRect?
    /// Where the capsule draws the project's folder mark: its button lies there.
    var markFrame: CGRect? {
        didSet { setNeedsLayout() }
    }
    private let fold = UIButton(type: .custom)
    private let mark = UIButton(type: .custom)
    /// Shows the menu, anchored to the card, when a tap has ended.
    private lazy var opener = MenuOpener(shown: { [weak self] in self?.menuShown($0) }, ended: { [weak self] in self?.menuEnded($0) })
    private var drag: UIDragInteraction!
    /// The carry this card's own drag session is: what its end names.
    private var token: Int?
    /// A menu row that opens a sheet or a page, run once the menu has begun to go.
    private var afterMenu: (@MainActor () -> Void)?
    init(content: UIView & UIContentView) {
        self.content = content
        super.init(frame: .zero)
        content.isUserInteractionEnabled = false
        content.translatesAutoresizingMaskIntoConstraints = false
        shown.isUserInteractionEnabled = false
        shown.translatesAutoresizingMaskIntoConstraints = false
        addSubview(shown)
        shown.addSubview(content)
        NSLayoutConstraint.activate([
            shown.leadingAnchor.constraint(equalTo: leadingAnchor),
            shown.trailingAnchor.constraint(equalTo: trailingAnchor),
            shown.topAnchor.constraint(equalTo: topAnchor),
            shown.bottomAnchor.constraint(equalTo: bottomAnchor),
            content.leadingAnchor.constraint(equalTo: shown.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: shown.trailingAnchor),
            content.topAnchor.constraint(equalTo: shown.topAnchor),
            content.bottomAnchor.constraint(equalTo: shown.bottomAnchor),
        ])
        fold.isHidden = true
        fold.accessibilityLabel = "Subtasks"
        fold.accessibilityHint = "Folds the subtasks away or shows them again"
        fold.addAction(UIAction { [weak self] _ in
            UISelectionFeedbackGenerator().selectionChanged()
            self?.onFold?()
        }, for: .touchUpInside)
        addSubview(fold)
        mark.isHidden = true
        mark.accessibilityLabel = "Project"
        mark.accessibilityHint = "Opens the project's note"
        mark.addAction(UIAction { [weak self] _ in self?.onProject?() }, for: .touchUpInside)
        addSubview(mark)
        addAction(UIAction { [weak self] _ in self?.onTouch() }, for: .touchUpInside)
        // A tap opens the menu once the finger is up, as the plugin's tap does; a long press lifts the card for the drag.
        addSubview(opener)
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
        drag = UIDragInteraction(delegate: self)
        drag.isEnabled = false
        addInteraction(drag)
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func layoutSubviews() {
        super.layoutSubviews()
        opener.frame = bounds
        // The counter's own button, as tall as the card and a little wider than the digits, as the plugin's hit area.
        if let counter = counterFrame {
            fold.frame = CGRect(x: counter.minX - Self.foldReach, y: 0, width: counter.width + Self.foldReach * 2, height: min(bounds.height, CardMetrics.height))
        }
        if let folder = markFrame {
            mark.frame = CGRect(x: folder.minX - Self.foldReach / 2, y: 0, width: folder.width + Self.foldReach, height: min(bounds.height, CardMetrics.height))
        }
    }

    private static let foldReach: CGFloat = 6

    // MARK: The menu

    /// The card whose menu is up. A write from it that keeps it open (a label) draws the task as a new card, the line
    /// being another: the menu follows the task by its id.
    private static weak var menuOwner: CardControl?
    /// A card's menu is up.
    static var menuShowing: Bool { menuOwner?.opener.showing == true }
    /// The card whose menu opened last and where it stood on the screen: Add Subtask on a calendar card lifts it there.
    static private(set) var lastLifted: (card: BoardCard, frame: CGRect)?

    /// A card drawn: when it is the task whose menu shows, the menu and the copy over it take the new drawing.
    static func follow(card: BoardCard, look: Look, menu: @escaping (_ later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu?, from control: CardControl) {
        guard let owner = menuOwner, owner.opener.showing, let shown = owner.look else { return }
        guard shown.card.item.id == card.item.id, shown != look || owner === control else { return }
        owner.menuMaker = menu
        owner.redrawn(look)
    }

    /// The card drawn anew while its menu shows (a label set from the menu, which stays open): the menu ticks it, and the
    /// copy over it takes the new colours, as the plugin's card over its menu does.
    private func redrawn(_ look: Look) {
        if self.look != look {
            self.look = look
            content.configuration = UIHostingConfiguration { TaskCapsule(card: look.card, text: look.text, ringed: look.ringed, height: look.height) }.margins(.all, 0)
        }
        copy?.restyle(look)
        if let menu = menuMaker({ [weak self] run in self?.afterMenu = run }) { opener.refresh(menu) }
    }

    /// The card as its open menu shows it, from the menu's first frame to its last (`MenuCopy`).
    private var copy: MenuCopy?
    /// The menu's copy stands for the card, from its lift to its landing: the card is not drawn beside it, where the
    /// menu's lift moves the copy a little off the card.
    private var copied = false {
        didSet { if copied != oldValue { showsInPlace() } }
    }

    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        onTouch()
        if let picking {
            UISelectionFeedbackGenerator().selectionChanged()
            picking.toggle()
            return
        }
        let point = tap.location(in: self)
        // A link opens, as the plugin's card: only within the title's room, where the link is seen. The folder mark is its
        // own button.
        if let onLink, let link = links.first(where: { $0.frame.insetBy(dx: -2, dy: -8).contains(point) && (titleFrame?.contains(CGPoint(x: point.x, y: titleFrame?.midY ?? 0)) ?? true) }) {
            onLink(link.part)
            return
        }
        openMenu(at: tap.location(in: opener))
    }

    /// The menu opens over one copy of the card that stands exactly over it, and grows with the menu into the copy with
    /// the whole title; as the menu goes, the same copy shrinks back into the card (`MenuCopy`) and gives way to it in
    /// the frame it lands, the two drawn alike.
    private func openMenu(at point: CGPoint) {
        guard let look, let window, let menu = menuMaker({ [weak self] run in self?.afterMenu = run }),
              let (whole, grown) = grownCopy(selectable: false, always: true) else { return }
        let card = convert(bounds, to: window)
        let made = MenuCopy(look: look, style: traitCollection.userInterfaceStyle, card: card, whole: whole, grown: grown)
        // In the window, over the card and its own look: the menu lifts it from there and lands it back there, as it
        // lifts and lands any view of the screen.
        window.addSubview(made)
        copy = made
        copied = true
        Self.menuOwner = self
        Self.lastLifted = (look.card, card)
        opener.present(menu, at: point) { [weak made] in made?.preview }
    }

    /// The menu's copy shrinking back into the card as the menu flies it home.
    private static let menuShrink: TimeInterval = 0.32
    private static let menuFade: TimeInterval = 0.2

    /// The menu shows: its copy grows from the card with it, in the menu's own motion.
    private func menuShown(_ animator: (any UIContextMenuInteractionAnimating)?) {
        guard let copy else { return }
        if let animator { animator.addAnimations { copy.grow() } } else { copy.grow() }
    }

    /// The card's copy with its whole title, sized and placed in the window as the menu lifts it. `always`: a card that
    /// shows its whole title gets a copy too, at its own width, where the menu lifts the card itself.
    private func grownCopy(selectable: Bool, always: Bool, onCopied: @escaping () -> Void = {}) -> (UIView & UIContentView, CGRect)? {
        guard let look, let window, let room = titleFrame else { return nil }
        let board = AppServices.shared.board
        // The title as the card draws it: each piece's words, a link by its label, as the plugin measures its drawn title.
        let drawn = (look.text ?? look.card.parts.map(\.shown).joined()) as NSString
        let natural = drawn.size(withAttributes: [.font: UIFont.systemFont(ofSize: CardMetrics.title)]).width
        let margin = Double(CardMetrics.wholeMargin)
        let fit = TitleFit(width: Double(bounds.width), titleWidth: Double(room.width), textWidth: Double(natural), fade: Double(CardMetrics.fade))
        let grown = (try? board.wholeWidth(card: fit, room: Double(window.bounds.width), margin: margin)) ?? nil
        guard grown != nil || always else { return nil }
        let width = grown.map { CGFloat($0.width) } ?? bounds.width
        let copy = UIHostingConfiguration {
            TaskCapsule(card: look.card, text: look.text, height: look.height, whole: true, selectable: selectable, onCopied: onCopied)
        }
        .margins(.all, 0)
        .makeContentView()
        copy.overrideUserInterfaceStyle = traitCollection.userInterfaceStyle
        let height = max(bounds.height, copy.systemLayoutSizeFitting(CGSize(width: width, height: UIView.layoutFittingCompressedSize.height), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height.rounded(.up))
        copy.frame = CGRect(x: 0, y: 0, width: width, height: height)
        let card = convert(bounds, to: window)
        guard let left = try? board.grownStart(Double(card.minX), size: Double(card.width), grown: Double(width), room: Double(window.bounds.width), margin: margin),
              let top = try? board.grownStart(Double(card.minY), size: Double(card.height), grown: Double(height), room: Double(window.bounds.height), margin: margin)
        else { return nil }
        return (copy, CGRect(x: CGFloat(left), y: CGFloat(top), width: width, height: height))
    }

    /// Select Text in the menu of the card that opened it: its copy is lifted where the menu showed it, the whole
    /// title selected, as a message in Messages after its Select.
    static func selectMenuTitle() {
        guard let owner = menuOwner, let window = owner.window else { return }
        // The copy stands in for the card, as the menu's does: the card itself, ring and all, is not seen beside it.
        let selection = TitleSelection(in: window) { [weak owner] in owner?.content.isHidden = false }
        guard let (copy, frame) = owner.grownCopy(selectable: true, always: true, onCopied: { [weak selection] in selection?.close() }) else { return selection.close() }
        owner.content.isHidden = true
        selection.show(copy, at: frame)
    }

    /// The menu goes: its copy shrinks back into the card in the menu's own motion, and the lists keep the screen they show
    /// until it has landed (`MenuHold`), so a row the menu's choice removes (Done, Won't Do, Delete) closes only once the
    /// card is home. A row that opens a sheet or a page runs as the menu starts to go: the animator completes later.
    private func menuEnded(_ animator: (any UIContextMenuInteractionAnimating)?) {
        if let copy {
            self.copy = nil
            MenuHold.begin()
            // The copy shrinks back to the card's size on its own spring while the menu flies it home, and lands when
            // that spring is done: the card shows in its place, the copy fades into the row, the lists go on. The menu's
            // animator tells of its end most of a second after the copy has visibly landed.
            let land = { [weak self] in
                self?.copied = false
                UIView.animate(withDuration: Self.menuFade, delay: 0, options: [.allowUserInteraction]) {
                    copy.alpha = 0
                } completion: { _ in
                    copy.removeFromSuperview()
                    MenuHold.end()
                }
            }
            guard animator != nil else { return land() }
            UIView.animate(springDuration: Self.menuShrink, bounce: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
                copy.shrink()
            } completion: { _ in land() }
        }
        guard let run = afterMenu else { return }
        afterMenu = nil
        DispatchQueue.main.async { run() }
    }

    // MARK: The card's own drag (on the calendar)

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
        guard let card = look?.card else { return [] }
        let item = UIDragItem(itemProvider: Carried.provider(id))
        let payload = DragPayload(.card(card), from: from)
        payload.grab = session.location(in: self).y
        payload.home = window.map { convert(bounds, to: $0) }
        item.localObject = payload
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

    func dragInteraction(_ interaction: UIDragInteraction, sessionIsRestrictedToDraggingApplication session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionAllowsMoveOperation session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionWillBegin session: UIDragSession) {
        let token = onCarry()
        self.token = token
        (session.items.first?.localObject as? DragPayload)?.token = token
    }

    /// Let go on no place, the copy flies home into the card, in the card's space so it goes with a sliding day.
    func dragInteraction(_ interaction: UIDragInteraction, previewForCancelling item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
        guard window != nil else { return defaultPreview }
        return defaultPreview.retargetedPreview(with: UIDragPreviewTarget(container: self, center: CGPoint(x: bounds.midX, y: bounds.midY)))
    }

    /// The session's end, the carry's one end, whatever came of it.
    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, didEndWith operation: UIDropOperation) {
        guard let token else { return }
        self.token = nil
        onEnd(token)
    }

    /// Only what the card draws hides, never the card: a hidden card still takes the finger.
    private func showsInPlace() {
        shown.alpha = carried || copied ? 0 : 1
    }
}

/// The card's menu, opened by the card once a tap ends rather than on the touch, so a long press stays the drag's. It
/// takes no touches itself; the system's context menu is shown at the tap's point.
final class MenuOpener: UIView, UIContextMenuInteractionDelegate {
    private let shown: ((any UIContextMenuInteractionAnimating)?) -> Void
    private let ended: ((any UIContextMenuInteractionAnimating)?) -> Void
    private var menu: UIMenu?
    /// The menu is up.
    private(set) var showing = false
    /// What the menu lifts as it opens and lands as it goes: one and the same view, so it shrinks back into what grew.
    private var preview: (() -> UITargetedPreview?)?
    private lazy var interaction = UIContextMenuInteraction(delegate: self)

    init(shown: @escaping ((any UIContextMenuInteractionAnimating)?) -> Void = { _ in }, ended: @escaping ((any UIContextMenuInteractionAnimating)?) -> Void) {
        self.shown = shown
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

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willDisplayMenuFor configuration: UIContextMenuConfiguration, animator: (any UIContextMenuInteractionAnimating)?) {
        shown(animator)
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willEndFor configuration: UIContextMenuConfiguration, animator: (any UIContextMenuInteractionAnimating)?) {
        showing = false
        ended(animator)
    }
}

/// The card as its open menu shows it: one view from the menu's first frame to its last, so the card grows out of itself
/// and shrinks back into itself, never a copy of another size fading over it. It is as large as the copy with the whole
/// title the core places (`rules.wholeWidth`, `rules.grownStart`); within it the card's shape stands first exactly over the
/// card, its own look, then grows with the menu to the whole copy, the card's look giving way to the whole title as it
/// grows, and shrinks back the same way as the menu goes. A card that shows its whole title keeps its own size and look.
final class MenuCopy: UIView {
    private let shape = UIView()
    private let own: UIView & UIContentView
    private let whole: UIView & UIContentView
    /// The card, in this view's space.
    private let card: CGRect
    private let grows: Bool

    init(look: CardControl.Look, style: UIUserInterfaceStyle, card: CGRect, whole: UIView & UIContentView, grown: CGRect) {
        own = UIHostingConfiguration { TaskCapsule(card: look.card, text: look.text, height: look.height) }.margins(.all, 0).makeContentView()
        self.whole = whole
        self.card = CGRect(origin: CGPoint(x: card.minX - grown.minX, y: card.minY - grown.minY), size: card.size)
        grows = grown.size != card.size
        super.init(frame: grown)
        overrideUserInterfaceStyle = style
        isUserInteractionEnabled = false
        shape.clipsToBounds = true
        shape.layer.cornerRadius = CardMetrics.radius
        shape.layer.cornerCurve = .continuous
        addSubview(shape)
        whole.frame = CGRect(origin: .zero, size: grown.size)
        own.frame = CGRect(origin: .zero, size: card.size)
        shape.addSubview(whole)
        shape.addSubview(own)
        shrink()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    /// The whole copy, as the open menu shows it.
    func grow() {
        shape.frame = bounds
        guard grows else { return }
        own.alpha = 0
        whole.alpha = 1
    }

    /// The card, where it stands.
    func shrink() {
        shape.frame = card
        own.alpha = 1
        whole.alpha = 0
    }

    /// The card drawn anew while its menu shows (a label set from it): both looks take the new colours.
    func restyle(_ look: CardControl.Look) {
        own.configuration = UIHostingConfiguration { TaskCapsule(card: look.card, text: look.text, height: look.height) }.margins(.all, 0)
        whole.configuration = UIHostingConfiguration { TaskCapsule(card: look.card, text: look.text, height: look.height, whole: true) }.margins(.all, 0)
    }

    /// What the menu lifts and lands: this view where it stands, with nothing of its own round it. Its rect has no ground
    /// and no shadow; the card's shape inside it draws the card.
    var preview: UITargetedPreview? {
        guard window != nil else { return nil }
        let parameters = UIPreviewParameters()
        parameters.visiblePath = UIBezierPath(rect: bounds)
        parameters.backgroundColor = .clear
        parameters.shadowPath = UIBezierPath()
        return UITargetedPreview(view: self, parameters: parameters)
    }
}

/// The lists keep the screen they show while a card's menu goes and its copy flies home: a row the menu's choice removes
/// closes once the card has landed in it, never under the copy still flying there.
@MainActor
enum MenuHold {
    private static var holds = 0
    private static var waiting: [ObjectIdentifier: () -> Void] = [:]

    static var holding: Bool { holds > 0 }

    static func begin() { holds += 1 }

    static func end() {
        holds = max(0, holds - 1)
        guard holds == 0 else { return }
        let run = waiting.values
        waiting = [:]
        for work in run { work() }
    }

    /// `work` runs once the hold ends: one waiting work per owner, the last asked.
    static func after(_ owner: AnyObject, _ work: @escaping () -> Void) {
        waiting[ObjectIdentifier(owner)] = work
    }
}
