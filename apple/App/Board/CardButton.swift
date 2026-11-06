import Core
import SwiftUI
import UIKit

/// What a dragged card or the plus carries: a card by its id, or the plus, a task not written yet.
enum Carried {
    static let plus = "\u{0}plus"

    static func provider(_ id: String) -> NSItemProvider { NSItemProvider(object: id as NSString) }
}

/// A card as the design has it: a tap opens its menu, the system's menu growing from the card; a long press lifts it to
/// carry, the system's drag that the lists and the calendar take, as in the plugin. Both are UIKit's own, so the lift,
/// the haptics and the drop's animation are the system's.
struct CardButton: UIViewRepresentable {
    let card: BoardCard
    let menu: () -> UIMenu?
    var ringed = false
    var height: CGFloat = CardMetrics.height
    var over = false
    var onTouch: () -> Void = {}
    /// The card was lifted to carry (true), or the carry ended (false).
    var onCarry: (Bool) -> Void = { _ in }

    func makeUIView(context: Context) -> CardControl {
        let control = CardControl(content: configuration.makeContentView())
        update(control)
        return control
    }

    private var configuration: UIHostingConfiguration<TaskCapsule, EmptyView> {
        UIHostingConfiguration { TaskCapsule(card: card, ringed: ringed, height: height, over: over) }.margins(.all, 0)
    }

    func updateUIView(_ control: CardControl, context: Context) {
        update(control)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: CardControl, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 200, height: max(height, CardMetrics.height))
    }

    private func update(_ control: CardControl) {
        control.id = card.id
        control.content.configuration = configuration
        control.menuMaker = menu
        control.onTouch = onTouch
        control.onCarry = onCarry
        control.accessibilityLabel = card.item.title
    }
}

final class CardControl: UIView, UIDragInteractionDelegate {
    var id = ""
    var menuMaker: () -> UIMenu? = { nil }
    var onTouch: () -> Void = {}
    var onCarry: (Bool) -> Void = { _ in }
    let content: UIView & UIContentView
    /// Opens the menu on a tap: a menu button pressed in code, so the press of a finger stays free for the long press.
    private let tapMenu = UIButton()

    init(content: UIView & UIContentView) {
        self.content = content
        super.init(frame: .zero)
        for view in [content, tapMenu] as [UIView] {
            view.isUserInteractionEnabled = false
            view.translatesAutoresizingMaskIntoConstraints = false
            addSubview(view)
            NSLayoutConstraint.activate([
                view.leadingAnchor.constraint(equalTo: leadingAnchor),
                view.trailingAnchor.constraint(equalTo: trailingAnchor),
                view.topAnchor.constraint(equalTo: topAnchor),
                view.bottomAnchor.constraint(equalTo: bottomAnchor),
            ])
        }
        tapMenu.showsMenuAsPrimaryAction = true
        tapMenu.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in
            done(self?.menuMaker()?.children ?? [])
        }])
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
        let drag = UIDragInteraction(delegate: self)
        drag.isEnabled = true
        addInteraction(drag)
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    @objc private func tapped() {
        onTouch()
        tapMenu.performPrimaryAction()
    }

    override func accessibilityActivate() -> Bool {
        tapped()
        return true
    }

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
        let item = UIDragItem(itemProvider: Carried.provider(id))
        item.localObject = id
        return [item]
    }

    func dragInteraction(_ interaction: UIDragInteraction, previewForLifting item: UIDragItem, session: UIDragSession) -> UITargetedDragPreview? {
        let parameters = UIDragPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: content.bounds, cornerRadius: CardMetrics.radius)
        return UITargetedDragPreview(view: content, parameters: parameters)
    }

    func dragInteraction(_ interaction: UIDragInteraction, sessionIsRestrictedToDraggingApplication session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionAllowsMoveOperation session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionWillBegin session: UIDragSession) {
        onCarry(true)
    }

    func dragInteraction(_ interaction: UIDragInteraction, willAnimateLiftWith animator: UIDragAnimating, session: UIDragSession) {
        animator.addCompletion { [weak self] position in
            if position == .end { self?.alpha = 0.35 }
        }
    }

    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, didEndWith operation: UIDropOperation) {
        onCarry(false)
        UIView.animate(withDuration: 0.2) { self.alpha = 1 }
    }
}
