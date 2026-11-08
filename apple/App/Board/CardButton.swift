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
/// A tap only highlights it; the subtask counter is its own button, which folds.
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
    /// Select Tasks: a tap picks the card instead of opening its menu.
    var onPick: (() -> Void)?
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
    /// A tap on the project's folder mark: the project's note opens.
    var onProject: (() -> Void)?

    func makeUIView(context: Context) -> CardControl {
        let control = CardControl(content: configuration(control: nil).makeContentView())
        update(control)
        return control
    }

    private func configuration(control: CardControl?) -> UIHostingConfiguration<TaskCapsule, EmptyView> {
        UIHostingConfiguration {
            TaskCapsule(card: card, text: renamedText, ringed: ringed, height: height, onCounter: { [weak control] in control?.counterFrame = $0 }, onMark: { [weak control] in control?.markFrame = $0 })
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
        if control.look != look {
            control.look = look
            control.content.configuration = configuration(control: control)
        }
        control.menuMaker = menu
        control.onTouch = onTouch
        control.onCarry = onCarry
        control.onCancel = onCancel
        control.onEnd = onEnd
        control.onDropped = onDropped
        control.onFold = onFold
        control.onPick = onPick
        control.onProject = card.item.project?.mark == true && card.item.project?.canOpenNote == true ? onProject : nil
        control.draggable = draggable
        control.arrival = arrival
        control.carried = carried
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
    var onPick: (() -> Void)?
    var onFold: (() -> Void)? {
        didSet { fold.isHidden = onFold == nil }
    }
    var arrival: CGRect?
    var onProject: (() -> Void)? {
        didSet { mark.isHidden = onProject == nil }
    }
    var draggable = true {
        didSet { drag.isEnabled = draggable }
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
    /// Where the capsule draws its subtask counter: the fold button lies there.
    var counterFrame: CGRect? {
        didSet { setNeedsLayout() }
    }
    /// Where the capsule draws the project's folder mark: its button lies there.
    var markFrame: CGRect? {
        didSet { setNeedsLayout() }
    }
    private let fold = UIButton(type: .custom)
    private let mark = UIButton(type: .custom)
    /// Shows the menu, anchored to the card, when a tap has ended.
    private lazy var opener = MenuOpener { [weak self] in self?.menuEnded($0) }
    /// The press's highlight over the capsule, as a button's: outside the content, so a lifted preview never carries it.
    private let press = UIView()
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
        if let folder = markFrame {
            mark.frame = CGRect(x: folder.minX - Self.foldReach / 2, y: 0, width: folder.width + Self.foldReach, height: min(bounds.height, CardMetrics.height))
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
        if let onPick { return onPick() }
        onTouch()
        openMenu(at: tap.location(in: opener))
    }

    private func openMenu(at point: CGPoint) {
        guard let menu = menuMaker({ [weak self] run in self?.afterMenu = run }) else { return }
        raised = true
        opener.present(menu, at: point) { [weak self] in
            guard let self else { return nil }
            let home = UIPreviewTarget(container: self, center: CGPoint(x: self.bounds.midX, y: self.bounds.midY))
            return UITargetedPreview(view: self.content, parameters: self.capsule, target: home)
        }
    }

    /// A row that opens a sheet or a page runs once the menu has gone. The card stays over its neighbours until its
    /// preview, which flies home inside the card, has landed.
    private func menuEnded(_ animator: (any UIContextMenuInteractionAnimating)?) {
        if let animator {
            animator.addCompletion { [weak self] in self?.raised = false }
        } else {
            raised = false
        }
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
        origin = window.map { convert(CGPoint(x: bounds.midX, y: bounds.midY), to: $0) }
        token = onCarry(grab)
    }

    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, willEndWith operation: UIDropOperation) {
        guard operation == .cancel else { return }
        // The line and the marks go now; the card's place is released once the copy is home.
        onCancel(token)
    }

    func dragInteraction(_ interaction: UIDragInteraction, previewForCancelling item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
        guard let window, let origin else { return defaultPreview }
        return defaultPreview.retargetedPreview(with: UIDragPreviewTarget(container: window, center: origin))
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
        content.alpha = carried && !home && (left || !lifting) ? 0 : 1
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
