import Core
import SwiftUI
import UIKit

/// A section's header with the card's mechanism (`CardControl`): a tap opens its menu (Rename, Remove Section, as the core
/// offers), a long press lifts the section, the drag being UIKit's own on the header, so the system tells when the carry
/// ends, whatever came of it. Its lifted look is the plugin's: the section's name and count on a card over two layers.
struct SectionHeaderControl<Label: View>: UIViewRepresentable {
    let group: BoardGroup
    let column: BoardColumn
    let model: BoardModel
    /// The rows of the header's menu; empty for a header with none (No section).
    let menu: () -> [UIMenuElement]
    @ViewBuilder let label: () -> Label

    func makeUIView(context: Context) -> HeaderControl {
        let control = HeaderControl(content: UIHostingConfiguration { label() }.margins(.all, 0).makeContentView())
        update(control)
        return control
    }

    func updateUIView(_ control: HeaderControl, context: Context) {
        control.content.configuration = UIHostingConfiguration { label() }.margins(.all, 0)
        update(control)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: HeaderControl, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 200, height: ColumnMetrics.groupHead)
    }

    private func update(_ control: HeaderControl) {
        let model = model, column = column, group = group
        control.menuRows = menu
        control.liftable = group.reorder
        control.liftDelay = CardMetrics.press
        control.float = { SectionFloat(name: group.header ?? "", count: group.cards.filter { $0.level == 0 }.count) }
        control.onLift = { model.startSectionCarry(column, group) }
        control.onEnd = { model.carryEnded($0) }
        control.accessibilityLabel = group.header
    }
}

final class HeaderControl: UIView, UIDragInteractionDelegate {
    let content: UIView & UIContentView
    var menuRows: () -> [UIMenuElement] = { [] }
    var float: () -> SectionFloat = { SectionFloat(name: "", count: 0) }
    /// The section lifted: the carry's token, which its end names (none when the lift was refused).
    var onLift: () -> Int? = { nil }
    var onEnd: (Int) -> Void = { _ in }
    private var token: Int?
    var liftable = false {
        didSet { drag.isEnabled = liftable }
    }
    var liftDelay: TimeInterval = CardMetrics.press {
        didSet { if liftDelay != oldValue { holdLift() } }
    }
    private lazy var opener = MenuOpener { _ in }
    private var drag: UIDragInteraction!

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
        addSubview(opener)
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
        drag = UIDragInteraction(delegate: self)
        drag.isEnabled = false
        addInteraction(drag)
        holdLift()
        isAccessibilityElement = true
        accessibilityTraits = [.header, .button]
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func layoutSubviews() {
        super.layoutSubviews()
        opener.frame = bounds
    }

    private func holdLift() {
        for press in gestureRecognizers ?? [] where press is UILongPressGestureRecognizer {
            (press as? UILongPressGestureRecognizer)?.minimumPressDuration = liftDelay
        }
    }

    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        let rows = menuRows()
        guard !rows.isEmpty else { return }
        UISelectionFeedbackGenerator().selectionChanged()
        // The header stays where it is under its menu, as a bar button's does: nothing is lifted over the menu.
        opener.present(UIMenu(children: rows), at: tap.location(in: opener)) { nil }
    }

    // MARK: The lift

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
        let item = UIDragItem(itemProvider: NSItemProvider(object: "section" as NSString))
        item.localObject = "section"
        return [item]
    }

    /// The section under the finger as the plugin's floating section: its name and count on a card over two layers.
    func dragInteraction(_ interaction: UIDragInteraction, previewForLifting item: UIDragItem, session: UIDragSession) -> UITargetedDragPreview? {
        guard let window, let view = FloatImage.view(float(), like: self, in: window) else { return nil }
        let size = view.bounds.size
        let parameters = UIDragPreviewParameters()
        parameters.backgroundColor = .clear
        parameters.visiblePath = SectionFloat.outline
        let origin = convert(CGPoint(x: 0, y: bounds.height - size.height), to: window)
        return UITargetedDragPreview(view: view, parameters: parameters, target: UIDragPreviewTarget(container: window, center: CGPoint(x: origin.x + size.width / 2, y: origin.y + size.height / 2)))
    }

    func dragInteraction(_ interaction: UIDragInteraction, sessionIsRestrictedToDraggingApplication session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionAllowsMoveOperation session: UIDragSession) -> Bool { true }

    func dragInteraction(_ interaction: UIDragInteraction, sessionWillBegin session: UIDragSession) {
        token = onLift()
    }

    /// The carry ends with the session, whatever came of it: a drop is written first, anything else lets the section go.
    func dragInteraction(_ interaction: UIDragInteraction, session: UIDragSession, didEndWith operation: UIDropOperation) {
        if let token { onEnd(token) }
    }
}
