import Core
import SwiftUI
import UIKit

/// What a dragged card or the plus carries: a card by its id, or the plus, a task not written yet.
enum Carried {
    static let plus = "\u{0}plus"

    /// The carried thing for the system's drag: of a type only this app's process knows, so no field or other app takes
    /// it as text; the board's own drop reads what is carried from the carry, not from here.
    static func provider(_ id: String) -> NSItemProvider {
        let provider = NSItemProvider()
        provider.registerDataRepresentation(forTypeIdentifier: "com.kudrmax.taskcalendar.carried", visibility: .ownProcess) { done in
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
        CGSize(width: proposal.width ?? 200, height: max(height, CardMetrics.height))
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
    /// What hides the card, for a carry or for the menu's grown copy: the content's holder, decided in `showsInPlace` alone.
    /// The content's own alpha is the system's (its lift, its menu), which set it and give it back on their own schedule:
    /// hiding the card through the same property was overwritten by them, or overwrote them.
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
    private lazy var opener = MenuOpener { [weak self] in self?.menuEnded($0) }
    private var drag: UIDragInteraction!
    /// The carry this card's own drag session is: what its end names.
    private var token: Int?
    /// While its menu is open and its preview flies home inside it, the card draws over the cards after it in the list:
    /// SwiftUI stacks the wrappers of the cards' views in the order of the list and keeps no `zIndex` for them, so the
    /// card's own wrapper, the first of its holders that has siblings, is raised.
    private var raised = false {
        didSet {
            guard raised != oldValue else { return }
            if raised {
                var holder: UIView? = self
                while let view = holder, let parent = view.superview, parent.subviews.count == 1 { holder = parent }
                lifted = holder
                lifted?.layer.zPosition = 1
            } else {
                lifted?.layer.zPosition = 0
                lifted = nil
            }
        }
    }
    private weak var lifted: UIView?
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

    private var capsule: UIPreviewParameters {
        let parameters = UIPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: content.bounds, cornerRadius: CardMetrics.radius)
        parameters.backgroundColor = .clear
        return parameters
    }

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
        if let copy = wholeCopy {
            copy.configuration = UIHostingConfiguration { TaskCapsule(card: look.card, text: look.text, height: look.height, whole: true) }.margins(.all, 0)
        }
        if let menu = menuMaker({ [weak self] run in self?.afterMenu = run }) { opener.refresh(menu) }
    }

    /// The grown copy the open menu lifts, while it shows.
    private var wholeCopy: (UIView & UIContentView)?
    /// Counts the menus opened from this card: a menu's end that comes after the next menu opened is no longer its.
    private var menuRound = 0
    /// The menu's grown copy stands in for the card: the card is hidden while that menu shows, until it starts to go.
    private var menuCopied = false {
        didSet { if menuCopied != oldValue { showsInPlace() } }
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

    private func openMenu(at point: CGPoint) {
        guard let menu = menuMaker({ [weak self] run in self?.afterMenu = run }) else { return }
        menuRound += 1
        Self.menuOwner = self
        if let look, let window { Self.lastLifted = (look.card, convert(bounds, to: window)) }
        raised = true
        opener.present(menu, at: point) { [weak self] in
            // A card drawn anew while its menu showed has left the screen: the menu goes without a preview.
            guard let self, self.window != nil else { return nil }
            if let whole = self.wholePreview() {
                // The grown copy stands in for the card: the card itself is not seen beside it under the backdrop.
                self.menuCopied = true
                return whole
            }
            return self.inPlace()
        } home: { [weak self] in
            // The menu's copy flies home into the card as it stands, its title cut again on the way: once it lands it is
            // the card, and nothing of the grown copy stays over the list while the menu's animation runs out.
            guard let self, self.window != nil else { return nil }
            return self.inPlace()
        }
    }

    /// The card itself, where it stands.
    private func inPlace() -> UITargetedPreview {
        let home = UIPreviewTarget(container: self, center: CGPoint(x: bounds.midX, y: bounds.midY))
        return UITargetedPreview(view: content, parameters: capsule, target: home)
    }

    /// The copy the menu lifts when the card cuts its title, as the plugin's: as wide as the core says (`rules.wholeWidth`),
    /// and where the title still doesn't fit, wrapped onto more lines with the copy grown down. It stands where the core
    /// places it (`rules.grownStart`). A card that shows its whole title is lifted itself.
    private func wholePreview() -> UITargetedPreview? {
        guard let window, let (copy, frame) = grownCopy(selectable: false, always: false) else { return nil }
        wholeCopy = copy
        let parameters = UIPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: copy.bounds, cornerRadius: CardMetrics.radius)
        parameters.backgroundColor = .clear
        return UITargetedPreview(view: copy, parameters: parameters, target: UIPreviewTarget(container: window, center: CGPoint(x: frame.midX, y: frame.midY)))
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

    /// A row that opens a sheet or a page runs once the menu has gone. The card flies home as itself (`home`), so it is
    /// no longer hidden for a copy; it stays over its neighbours until it has landed.
    private func menuEnded(_ animator: (any UIContextMenuInteractionAnimating)?) {
        wholeCopy = nil
        menuCopied = false
        let round = menuRound
        let landed = { [weak self] in
            // The card was tapped again while it flew home: the new menu owns the card now.
            guard let self, self.menuRound == round else { return }
            self.raised = false
        }
        if let animator { animator.addCompletion(landed) } else { landed() }
        guard let run = afterMenu else { return }
        afterMenu = nil
        // As the menu starts to go, not when its animation ends: the animator completes about a second later.
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
        // Lifted from a menu that showed a grown copy instead: the capsule shows again to be carried.
        menuCopied = false
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
        shown.alpha = menuCopied || carried ? 0 : 1
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
    /// What the menu's preview flies home into as the menu goes; the preview itself when none is given.
    private var home: (() -> UITargetedPreview?)?
    private lazy var interaction = UIContextMenuInteraction(delegate: self)

    init(ended: @escaping ((any UIContextMenuInteractionAnimating)?) -> Void) {
        self.ended = ended
        super.init(frame: .zero)
        addInteraction(interaction)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool { false }

    func present(_ menu: UIMenu, at point: CGPoint, preview: @escaping () -> UITargetedPreview?, home: (() -> UITargetedPreview?)? = nil) {
        self.menu = menu
        self.preview = preview
        self.home = home
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
        (home ?? preview)?()
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willEndFor configuration: UIContextMenuConfiguration, animator: (any UIContextMenuInteractionAnimating)?) {
        showing = false
        ended(animator)
    }
}
