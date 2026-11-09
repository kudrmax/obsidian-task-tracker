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

/// A card as the design has it, behaving as Files and Podcasts' rows do: a long press lifts it and shows its menu, and
/// moving the finger while it is lifted turns the lift into the drag the lists and the calendar take. Both are UIKit's
/// own interactions on the card, so the lift, the haptics, the menu's growth and the drop's animations are the system's.
/// A touch draws nothing of its own, as the plugin's card: a tap opens the menu, a long press lifts the card. The subtask
/// counter is its own button, which folds.
struct CardButton: UIViewRepresentable {
    let card: BoardCard
    /// The task's new text while its rename is written: drawn instead of the text as read.
    var renamedText: String?
    /// The card's menu; `later` holds a row that opens a sheet or a page until the menu has gone.
    let menu: (_ later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu?
    var ringed = false
    var height: CGFloat = CardMetrics.height
    var draggable = true
    /// The card stands in a carry: it hides once the carried copy has left it, until the carry ends.
    var carried = false
    /// Where the carried copy came down, in the window, when this card's carry ended: it glides from there to its place.
    var arrival: CGRect?
    var onTouch: () -> Void = {}
    /// The card was lifted to carry, the finger this far below its top: the carry's token, which its end names.
    var onCarry: (CGFloat) -> Int = { _ in 0 }
    /// The carry ended with no drop: on the cancel target, or over no place.
    var onCancel: (Int) -> Void = { _ in }
    /// The drag session ended, whatever came of it.
    var onEnd: (Int) -> Void = { _ in }
    /// The drag session ended with a drop: the board's drop ends the carry, or, if nothing of the board took it, the board.
    var onDropped: (Int) -> Void = { _ in }
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
        control.onCancel = onCancel
        control.onEnd = onEnd
        control.onDropped = onDropped
        control.onFold = onFold
        control.onLink = onLink
        // The folder mark opens the note only where the note can open, and never while tasks are being picked.
        control.onProject = picking == nil && card.item.project?.mark == true && card.item.project?.canOpenNote == true ? onProject : nil
        control.picking = picking
        control.draggable = picking.map(\.picked) ?? draggable
        control.arrival = arrival
        control.carried = carried
        control.liftDelay = CardMetrics.press
        control.accessibilityLabel = card.item.title
    }
}

final class CardControl: UIControl, UIDragInteractionDelegate {
    var id = ""
    var menuMaker: (_ later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu? = { _ in nil }
    var onTouch: () -> Void = {}
    var onCarry: (CGFloat) -> Int = { _ in 0 }
    var onCancel: (Int) -> Void = { _ in }
    var onEnd: (Int) -> Void = { _ in }
    var onDropped: (Int) -> Void = { _ in }
    /// The carry this card's drag session is: what its end names.
    private var token = 0
    var onFold: (() -> Void)? {
        didSet { fold.isHidden = onFold == nil }
    }
    var onLink: ((TextPart) -> Void)?
    var arrival: CGRect?
    var onProject: (() -> Void)? {
        didSet { mark.isHidden = onProject == nil }
    }
    var picking: CardButton.Picking?
    /// Where the title's links are drawn.
    var links: [CardLink] = []
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
    /// cancelled carry home. A card the screen draws anew for the carried task (its new place) hides from the start.
    var carried = false {
        didSet {
            guard carried != oldValue else { return }
            // The carry is over (its copy landed and its drop drawn): the next carry starts from the card in its place.
            if !carried {
                left = false
                lifting = false
                home = false
                if let arrival { glide(from: arrival) }
            }
            showsInPlace()
        }
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
    /// Where the card stood when it was lifted, in the window: a cancelled carry flies back there.
    private var origin: CGPoint?
    /// The carried card has moved off its place: only then does the card hide, so the lift (from a long press or from the
    /// open menu) always has the capsule itself to lift, and no frame shows neither.
    private var left = false
    /// How far below the card's top the finger held it as the drag began.
    private var grab: CGFloat = 0
    /// This card was lifted: it shows until the carried copy leaves it.
    private var lifting = false
    /// A cancelled carry's copy has flown home into this card: it shows again.
    private var home = false
    /// A cancel's flight home is under way: the session's end waits for it.
    private var flyingHome = false
    private var endAfterFlight = false

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

    // MARK: The carry

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
        // Where the finger holds the card, read while the touch still stands on it: once the lift (or the menu's) has
        // begun, the session reports the point against the lifted preview, which is no longer where the card stands.
        grab = session.location(in: self).y
        // A new lift, whatever an earlier carry of this card still waits for (its copy settling, its flight home): this
        // session starts from the card as it stands, shown.
        left = false
        home = false
        flyingHome = false
        endAfterFlight = false
        lifting = true
        showsInPlace()
        let item = UIDragItem(itemProvider: Carried.provider(id))
        item.localObject = id
        return [item]
    }

    /// The capsule itself is lifted: from an open menu the system turns the menu's preview, this capsule, into the carried
    /// card, and only a lift of the same view lets the menu give way to the drag.
    func dragInteraction(_ interaction: UIDragInteraction, previewForLifting item: UIDragItem, session: UIDragSession) -> UITargetedDragPreview? {
        // Lifted from a menu that showed a grown copy instead: the capsule shows again to be carried.
        menuCopied = false
        if let stack = stackPreview() { return stack }
        let parameters = UIDragPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: content.bounds, cornerRadius: CardMetrics.radius)
        parameters.backgroundColor = .clear
        return UITargetedDragPreview(view: content, parameters: parameters)
    }

    /// Several picked tasks lifted: the card on two layers with their number, as the plugin's carried stack.
    private func stackPreview() -> UITargetedDragPreview? {
        guard let picking, picking.count > 1, let look, let window else { return nil }
        guard let stack = FloatImage.view(StackFloat(card: look.card, count: picking.count, width: bounds.width), like: self, in: window) else { return nil }
        let size = stack.bounds.size
        let parameters = UIDragPreviewParameters()
        parameters.backgroundColor = .clear
        parameters.visiblePath = StackFloat.outline(width: bounds.width, count: picking.count)
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
        origin = window.map { convert(CGPoint(x: bounds.midX, y: bounds.midY), to: $0) }
        token = onCarry(grab)
    }

    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, willEndWith operation: UIDropOperation) {
        guard operation == .cancel else { return }
        // The line and the marks go now; the card's place is released once the copy is home.
        onCancel(token)
    }

    func dragInteraction(_ interaction: UIDragInteraction, previewForCancelling item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
        // Home is the card's own place: in the card's space, so the copy goes with the card if its day slides meanwhile.
        guard window != nil else { return defaultPreview }
        return defaultPreview.retargetedPreview(with: UIDragPreviewTarget(container: self, center: CGPoint(x: bounds.midX, y: bounds.midY)))
    }

    func dragInteraction(_ interaction: UIDragInteraction, item: UIDragItem, willAnimateCancelWith animator: any UIDragAnimating) {
        flyingHome = true
        let mine = token
        animator.addCompletion { [weak self] _ in
            // A later lift of this card took over meanwhile: this flight's end is only its carry's.
            guard let self, self.token == mine else { return }
            self.cameHome()
        }
    }

    /// The session's end: the carry ends once anything still flying has landed. A drop keeps the card hidden until the
    /// screen draws it where it was dropped.
    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, didEndWith operation: UIDropOperation) {
        guard !flyingHome else {
            endAfterFlight = true
            return
        }
        showsInPlace()
        // A drop's copy is still in the air when the session ends here: the drop's own animation ends the carry.
        guard operation == .cancel || operation == .forbidden else { return onDropped(token) }
        onEnd(token)
    }

    /// Only what the card draws hides, never the card: a hidden card still takes the finger, so it can be lifted again the
    /// moment it shows, whatever the system's drop still animates over it (a view at alpha 0 takes no touches).
    private func showsInPlace() {
        shown.alpha = menuCopied || (carried && !home && (left || !lifting)) ? 0 : 1
    }

    /// The cancelled copy is home: the card shows in the same frame the copy goes, then the carry ends.
    private func cameHome() {
        flyingHome = false
        home = true
        showsInPlace()
        onEnd(token)
        endAfterFlight = false
    }

    /// The copy came down elsewhere than the screen drew the card (a stack, the past under now): the card glides from
    /// there to its place with the system's spring.
    private func glide(from rect: CGRect) {
        arrival = nil
        guard let window else { return }
        let here = convert(bounds, to: window)
        let dx = rect.midX - here.midX
        let dy = rect.midY - here.midY
        guard hypot(dx, dy) > 2 else { return }
        transform = CGAffineTransform(translationX: dx, y: dy)
        UIView.animate(springDuration: 0.35, bounce: 0, options: [.allowUserInteraction]) {
            self.transform = .identity
        }
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
