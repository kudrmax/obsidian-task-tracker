import Core
import SwiftUI
import UIKit

/// A section's header: a tap opens its menu (Rename, Remove Section, as the core offers). A long press lifts the section,
/// the list's own drag (`ListController`); its lifted look is the plugin's: the section's name and count on a card over
/// two layers.
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
        control.menuRows = menu
        control.accessibilityLabel = group.header
    }
}

final class HeaderControl: UIView {
    let content: UIView & UIContentView
    var menuRows: () -> [UIMenuElement] = { [] }
    private lazy var opener = MenuOpener { _ in }

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
        isAccessibilityElement = true
        accessibilityTraits = [.header, .button]
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func layoutSubviews() {
        super.layoutSubviews()
        opener.frame = bounds
    }

    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        let rows = menuRows()
        guard !rows.isEmpty else { return }
        UISelectionFeedbackGenerator().selectionChanged()
        // The header stays where it is under its menu, as a bar button's does: nothing is lifted over the menu.
        opener.present(UIMenu(children: rows), at: tap.location(in: opener)) { nil }
    }
}
