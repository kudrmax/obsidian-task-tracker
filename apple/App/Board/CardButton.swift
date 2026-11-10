import Core
import SwiftUI
import UIKit

/// What the plus carries: a task not written yet.
enum Carried {
    static let plus = "\u{0}plus"
}

/// A card as the design has it: a tap opens its menu, as the plugin's card; the subtask counter is its own button, which
/// folds. In a list the list's own long press lifts it; on the calendar the calendar's own long press does (`draggable`,
/// `CalendarDrop`), into the same board drag: a press on the scroll view outlives the day the block is drawn in.
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
    /// The card lifted: the carry begins, its token returned.
    var onCarry: () -> Int = { 0 }
    /// Where the calendar's press lifts it from.
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

final class CardControl: UIControl {
    var id = "" {
        didSet { Self.live.add(self) }
    }
    var menuMaker: (_ later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu? = { _ in nil }
    var onTouch: () -> Void = {}
    var onCarry: () -> Int = { 0 }
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
    /// The calendar's press may lift it.
    var draggable = false
    /// Gone from its place while carried: the board's copy is the card until the carry ends.
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
    /// What hides the card while it is carried: the content's holder, decided in `showsInPlace` alone. The content's own
    /// alpha is the system's (its lift), which sets it and gives it back on its own schedule: hiding the card through the
    /// same property was overwritten by it, or overwrote it.
    private let shown = UIView()
    /// Where the capsule draws its subtask counter: the fold button lies there.
    var counterFrame: CGRect? {
        didSet { setNeedsLayout() }
    }
    /// Where the capsule's title has its room: what the core measures a cut title against (`rules.wholeWidth`).
    var titleFrame: CGRect?
    /// Where the capsule draws the project's folder mark: its button lies there.
    var markFrame: CGRect? {
        didSet { setNeedsLayout() }
    }
    private let fold = UIButton(type: .custom)
    private let mark = UIButton(type: .custom)
    /// Shows the menu, anchored to the card, when a tap has ended.
    private lazy var opener = MenuOpener(ended: { [weak self] in self?.menuEnded($0) })
    /// A view nothing shows, animated within the menu's going so its end is heard when the preview is home.
    private let ticker = UIView()
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
        ticker.isUserInteractionEnabled = false
        ticker.alpha = 0
        addSubview(ticker)
        mark.isHidden = true
        mark.accessibilityLabel = "Project"
        mark.accessibilityHint = "Opens the project's note"
        mark.addAction(UIAction { [weak self] _ in self?.onProject?() }, for: .touchUpInside)
        addSubview(mark)
        addAction(UIAction { [weak self] _ in self?.onTouch() }, for: .touchUpInside)
        // A tap opens the menu once the finger is up, as the plugin's tap does; a long press lifts the card for the drag.
        addSubview(opener)
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
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
        // The folder is drawn as narrow as its glyph; its button keeps the 24 points and 3 on each side it had, centred on it.
        if let folder = markFrame {
            let width = Self.markTarget + Self.foldReach
            mark.frame = CGRect(x: folder.midX - width / 2, y: 0, width: width, height: min(bounds.height, CardMetrics.height))
        }
    }

    private static let foldReach: CGFloat = 6
    private static let markTarget: CGFloat = 24

    // MARK: The menu

    /// The card whose menu is up. A write from it that keeps it open (a label) draws the task as a new card, the line
    /// being another: the menu follows the task by its id.
    private static weak var menuOwner: CardControl?
    /// A card's menu is up.
    static var menuShowing: Bool { menuOwner?.opener.showing == true }

    /// Work waiting for the menu to be gone for good: its preview down and faded, nothing of it left on the screen.
    private static var whenGone: [@MainActor () -> Void] = []

    /// `work` runs once the open menu is gone for good.
    static func afterMenuGone(_ work: @escaping @MainActor () -> Void) { whenGone.append(work) }

    private static func gone() {
        let run = whenGone
        whenGone = []
        for work in run { work() }
    }
    /// The card whose menu opened last and where it stood on the screen: Add Subtask on a calendar card lifts it there.
    static private(set) var lastLifted: (card: BoardCard, frame: CGRect)?

    /// A card drawn: when it is the task whose menu shows, the menu takes the new drawing.
    static func follow(card: BoardCard, look: Look, menu: @escaping (_ later: @escaping (@escaping @MainActor () -> Void) -> Void) -> UIMenu?, from control: CardControl) {
        guard let owner = menuOwner, owner.opener.showing, let shown = owner.look else { return }
        // A card of a screen under another (the main screen under a project's view) draws the same task as that screen
        // reads it: never the menu's, which follows the screen it was opened on.
        guard shown.card.item.id == card.item.id, owner === control || (shown != look && control.window != nil) else { return }
        owner.menuMaker = menu
        owner.redrawn(look)
    }

    /// The card drawn anew while its menu shows (a label set from the menu, which stays open): the menu ticks it, and the
    /// card takes the new colours.
    private func redrawn(_ look: Look) {
        if self.look != look {
            self.look = look
            content.configuration = UIHostingConfiguration { TaskCapsule(card: look.card, text: look.text, ringed: look.ringed, height: look.height) }.margins(.all, 0)
        }
        if let menu = menuMaker({ [weak self] run in self?.afterMenu = run }) { opener.refresh(menu) }
        if let shownWhole, let image = wholeTitle(look)?.image { shownWhole.show(image) }
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

    /// The system's menu over the card: the card itself lifts in place; a card whose title is cut shows its whole title in
    /// the menu's preview, the system morphing the card into it and back (`UIContextMenuConfiguration`'s preview).
    private func openMenu(at point: CGPoint) {
        guard let look, let window, let menu = menuMaker({ [weak self] run in self?.afterMenu = run }) else { return }
        Self.menuOwner = self
        Self.lastLifted = (look.card, convert(bounds, to: window))
        shownWhole = nil
        previewFrame = nil
        // Drawn as on the board: inside the menu the system's grounds are its raised level's, lighter, and the card took
        // the menu's own white.
        let whole = wholeTitle(look).map { image in
            { [weak self] () -> UIViewController in
                let preview = WholeTitle(copy: image, size: image.bounds.size)
                self?.shownWhole = preview
                return preview
            }
        }
        opener.present(menu, at: point, whole: whole) { [weak self] in self?.inPlace }
    }

    /// The card with its whole title as the menu's preview shows it, drawn as on the board; nil for a card that shows its
    /// whole title (the menu lifts the card itself).
    private func wholeTitle(_ look: Look) -> UIImageView? {
        guard let window, let (_, frame) = grownCopy(selectable: false, always: false) else { return nil }
        return FloatImage.view(TaskCapsule(card: look.card, text: look.text, whole: true).frame(width: frame.width, height: frame.height), like: self, in: window)
    }

    /// The menu's whole-title preview while it shows: a label set from the menu redraws it.
    private weak var shownWhole: WholeTitle?
    /// Where that preview stood as the menu began to go, in the window: Select Text lifts the title there.
    private var previewFrame: CGRect?

    /// The card itself where it stands: what the menu lifts and lands.
    private var inPlace: UITargetedPreview? {
        guard window != nil else { return nil }
        let parameters = UIPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: content.bounds, cornerRadius: CardMetrics.radius)
        parameters.backgroundColor = .clear
        return UITargetedPreview(view: content, parameters: parameters)
    }

    /// The card's copy with its whole title, sized and placed in the window as the core places it (`rules.wholeWidth`,
    /// `rules.grownStart`). `always`: a card that shows its whole title gets a copy too, at its own width.
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
        // Laid out by its title, as a card: a tall calendar block's copy is its title, not a tall box with the title on top.
        let copy = UIHostingConfiguration {
            TaskCapsule(card: look.card, text: look.text, whole: true, selectable: selectable, onCopied: onCopied)
        }
        .margins(.all, 0)
        .makeContentView()
        copy.overrideUserInterfaceStyle = traitCollection.userInterfaceStyle
        let height = max(CardMetrics.height, copy.systemLayoutSizeFitting(CGSize(width: width, height: UIView.layoutFittingCompressedSize.height), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height.rounded(.up))
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
        // Where the menu's whole-title preview stood, as iOS placed it: the selection takes the title from there.
        let shown = owner.previewFrame.map { CGRect(x: $0.minX, y: $0.minY, width: frame.width, height: frame.height) }
        selection.show(copy, at: shown ?? frame)
    }

    /// The menu goes: the system flies its preview back into the card; the lists keep the screen they show until it is
    /// home (`MenuHold`), so a row the menu's choice removes (Done, Won't Do, Delete) closes only once the card is back. A
    /// row that opens a sheet or a page runs as the menu starts to go.
    private func menuEnded(_ animator: (any UIContextMenuInteractionAnimating)?) {
        previewFrame = shownWhole?.viewIfLoaded.flatMap { view in view.window.map { view.convert(view.bounds, to: $0) } }
        MenuHold.begin()
        var home = false
        let landed = {
            guard !home else { return }
            home = true
            MenuHold.end()
        }
        if let animator {
            // The animator tells of its end most of a second after the preview is home: the flight's own end is heard from
            // an animation of the app's run inside it, as long as it.
            let mark = ticker
            animator.addAnimations {
                UIView.animate(withDuration: UIView.inheritedAnimationDuration, delay: 0, options: [.overrideInheritedDuration, .overrideInheritedCurve, .allowUserInteraction]) {
                    mark.alpha = mark.alpha == 0 ? 0.01 : 0
                } completion: { _ in landed() }
            }
            animator.addCompletion {
                landed()
                Self.gone()
            }
        } else {
            landed()
            Self.gone()
        }
        guard let run = afterMenu else { return }
        afterMenu = nil
        DispatchQueue.main.async { run() }
    }

    // MARK: Lifted from the calendar

    /// What the calendar's press lifts from this card, the finger at `point` of `window`: the card as it is drawn. Its home
    /// is the card drawn for the task now (after a day's turn, wherever the screen draws it, else where it stood).
    func lift(finger point: CGPoint, in window: UIWindow) -> Lift? {
        guard let card = look?.card, self.window === window else { return nil }
        let payload = DragPayload(.card(card), from: from)
        let frame = convert(bounds, to: window)
        payload.grab = point.y - frame.minY
        payload.home = frame
        let copy = ListController.image(of: content, in: content.bounds)
        return Lift(payload: payload, copy: copy, frame: frame, card: true, begin: onCarry) {
            Self.drawn(card.id).map { $0.convert($0.bounds, to: nil) } ?? payload.home
        }
    }

    /// The card of task `id` on the screen now.
    private static func drawn(_ id: String) -> CardControl? {
        live.allObjects.first { $0.id == id && $0.window != nil && $0.draggable }
    }

    /// Only what the card draws hides, never the card: a hidden card still takes the finger.
    private func showsInPlace() {
        shown.alpha = carried ? 0 : 1
    }

    /// Every card on the screen, by its task's id: a copy that lands shows the card it lands as in that same frame.
    private static let live = NSHashTable<CardControl>.weakObjects()

    /// The cards `ids` shown at once, the copy over them going in this frame.
    static func reveal(_ ids: Set<String>) {
        for control in live.allObjects where ids.contains(control.id) && control.window != nil { control.carried = false }
    }
}

/// The whole title as the menu's preview: the card's copy laid out with its whole title, the size the core gives it.
final class WholeTitle: UIViewController {
    private let copy: UIImageView

    init(copy: UIImageView, size: CGSize) {
        self.copy = copy
        super.init(nibName: nil, bundle: nil)
        preferredContentSize = size
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    /// The card drawn anew (a label set from the open menu): the preview takes its new look in place, at its size.
    func show(_ image: UIImage) {
        UIView.transition(with: copy, duration: 0.2, options: [.transitionCrossDissolve, .allowUserInteraction]) { self.copy.image = image }
    }

    override func loadView() {
        let view = UIView(frame: CGRect(origin: .zero, size: preferredContentSize))
        view.backgroundColor = .clear
        copy.frame = CGRect(origin: .zero, size: preferredContentSize)
        copy.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(copy)
        self.view = view
    }
}

/// The card's menu, opened by the card once a tap ends rather than on the touch, so a long press stays the drag's. It
/// takes no touches itself; the system's context menu is shown at the tap's point.
final class MenuOpener: UIView, UIContextMenuInteractionDelegate {
    private let ended: ((any UIContextMenuInteractionAnimating)?) -> Void
    private var menu: UIMenu?
    /// The menu is up.
    private(set) var showing = false
    /// What the menu lifts as it opens and lands as it goes: the card itself.
    private var preview: (() -> UITargetedPreview?)?
    /// The preview the menu shows over itself instead of the card: the card with its whole title.
    private var whole: (() -> UIViewController)?
    private lazy var interaction = UIContextMenuInteraction(delegate: self)

    init(ended: @escaping ((any UIContextMenuInteractionAnimating)?) -> Void) {
        self.ended = ended
        super.init(frame: .zero)
        addInteraction(interaction)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool { false }

    func present(_ menu: UIMenu, at point: CGPoint, whole: (() -> UIViewController)? = nil, preview: @escaping () -> UITargetedPreview?) {
        self.menu = menu
        self.whole = whole
        self.preview = preview
        let selector = NSSelectorFromString("_presentMenuAtLocation:")
        guard interaction.responds(to: selector), let method = interaction.method(for: selector) else { return }
        showing = true
        typealias Present = @convention(c) (AnyObject, Selector, CGPoint) -> Void
        unsafeBitCast(method, to: Present.self)(interaction, selector, point)
    }

    /// The open menu drawn from `menu`, in place: its rows ticked anew without closing it.
    /// The menu drawn anew while it is up (the screen under it read again, a label set from it). A menu that shows the same
    /// rows is left as it is; one that changed is put up on the page the person is on, never on its first page: the
    /// system hands the update the page that is showing, a submenu as well as the menu itself.
    func refresh(_ menu: UIMenu) {
        let shown = self.menu.map(Self.shape)
        self.menu = menu
        let next = Self.shape(menu)
        guard MenuShape.needsUpdate(shown: shown, next: next) else { return }
        interaction.updateVisibleMenu { visible in
            guard let path = MenuShape.path(toPage: visible.title, in: next) else { return visible }
            return Self.page(at: path, in: menu) ?? visible
        }
    }

    private static func shape(_ element: UIMenuElement) -> MenuShape {
        switch element {
        case let menu as UIMenu:
            return .page(title: menu.title, detail: "\(menu.subtitle ?? "")|\(menu.options.rawValue)", children: menu.children.map(shape))
        case let action as UIAction:
            return .row("\(action.title)|\(action.subtitle ?? "")|\(action.state.rawValue)|\(action.attributes.rawValue)")
        default:
            return .row(String(describing: type(of: element)))
        }
    }

    private static func page(at path: [Int], in menu: UIMenu) -> UIMenu? {
        var page = menu
        for index in path {
            guard index < page.children.count, let child = page.children[index] as? UIMenu else { return nil }
            page = child
        }
        return page
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
        guard let menu else { return nil }
        return UIContextMenuConfiguration(identifier: nil, previewProvider: whole) { _ in menu }
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

/// The lists keep the screen they show while a card's menu goes and its preview flies home: a row the menu's choice
/// removes closes once the card is back in it, never under the preview still flying there.
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


