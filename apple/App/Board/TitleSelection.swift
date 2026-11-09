import Core
import SwiftUI
import UIKit

/// What Select Text opens: the card's copy over the dimmed screen, where its menu showed it, the whole title selected
/// with its handles and the edit menu over it, as a message in Messages after its Select. The finger moves the handles to
/// take a part. Copy, or a tap beside the card, puts it away.
@MainActor
final class TitleSelection: UIView {
    private static weak var shown: TitleSelection?
    /// The screen dimmed as the card's menu dims it.
    private let backdrop = UIView()
    private var copy: UIView?
    private let onClose: () -> Void

    /// `onClose`: heard as the copy begins to go, the card shown again under it.
    init(in window: UIWindow, onClose: @escaping () -> Void) {
        self.onClose = onClose
        super.init(frame: window.bounds)
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        backdrop.backgroundColor = UIColor { $0.userInterfaceStyle == .dark ? UIColor.black.withAlphaComponent(0.45) : UIColor.black.withAlphaComponent(0.18) }
        backdrop.alpha = 0
        backdrop.frame = bounds
        backdrop.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        backdrop.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tappedBeside)))
        addSubview(backdrop)
        Self.shown?.close()
        window.addSubview(self)
        Self.shown = self
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    func show(_ copy: UIView, at frame: CGRect) {
        self.copy = copy
        copy.frame = frame
        copy.alpha = 0
        copy.layer.shadowColor = UIColor.black.cgColor
        copy.layer.shadowOpacity = 0.12
        copy.layer.shadowRadius = 16
        copy.layer.shadowOffset = CGSize(width: 0, height: 4)
        copy.layer.shadowPath = UIBezierPath(roundedRect: CGRect(origin: .zero, size: frame.size), cornerRadius: CardMetrics.radius).cgPath
        addSubview(copy)
        UIView.animate(withDuration: 0.25) {
            self.backdrop.alpha = 1
            copy.alpha = 1
        }
    }

    @objc private func tappedBeside() {
        close()
    }

    func close() {
        endEditing(true)
        onClose()
        UIView.animate(withDuration: 0.2) {
            self.backdrop.alpha = 0
            self.copy?.alpha = 0
        } completion: { _ in
            self.removeFromSuperview()
        }
    }
}

/// The title of the copy Select Text lifts, as the card writes it (links in the accent, a closed task struck through):
/// text the finger selects, all of it selected once it shows.
struct SelectableTitle: UIViewRepresentable {
    let parts: [TextPart]
    let closed: Bool
    let onCopied: () -> Void
    @Environment(\.colorScheme) private var scheme

    func makeUIView(context: Context) -> TitleTextView {
        let view = TitleTextView()
        view.isEditable = false
        view.isSelectable = true
        view.isScrollEnabled = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }

    func updateUIView(_ view: TitleTextView, context: Context) {
        view.attributedText = text
        view.onCopied = onCopied
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: TitleTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? .greatestFiniteMagnitude
        let size = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: proposal.width ?? size.width, height: max(size.height, CardMetrics.titleLine))
    }

    private var text: NSAttributedString {
        let ink = closed ? UIColor(Palette.muted) : UIColor.label
        let accent = UIColor(Palette.accent(scheme))
        let text = NSMutableAttributedString()
        for part in parts {
            var attributes: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: CardMetrics.title), .foregroundColor: part.isLink ? accent : ink]
            if closed {
                attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
                attributes[.strikethroughColor] = UIColor(Palette.muted)
            }
            text.append(NSAttributedString(string: part.shown, attributes: attributes))
        }
        return text
    }
}

/// The selectable title's view: it selects all of itself once it is on the screen, the edit menu over the selection,
/// and hears its Copy.
final class TitleTextView: UITextView, @MainActor UIEditMenuInteractionDelegate {
    var onCopied: () -> Void = {}
    private var selectedOnce = false
    /// Offers what the selection offers (Copy first), as a tap on a selection does.
    private lazy var editMenu = UIEditMenuInteraction(delegate: self)

    init() {
        super.init(frame: .zero, textContainer: nil)
        addInteraction(editMenu)
    }

    /// Where the selection is drawn: the edit menu stands clear of it, over or under, as over any selection.
    private var selectionRect: CGRect? {
        guard let range = selectedTextRange else { return nil }
        let rect = selectionRects(for: range).map(\.rect).filter { !$0.isEmpty }.reduce(CGRect.null) { $0.union($1) }
        return rect.isNull ? nil : rect
    }

    func editMenuInteraction(_ interaction: UIEditMenuInteraction, targetRectFor configuration: UIEditMenuConfiguration) -> CGRect {
        selectionRect ?? .null
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, !selectedOnce else { return }
        selectedOnce = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.becomeFirstResponder()
            self.selectAll(nil)
            self.showEditMenu()
        }
    }

    private func showEditMenu() {
        guard let rect = selectionRect else { return }
        editMenu.presentEditMenu(with: UIEditMenuConfiguration(identifier: nil, sourcePoint: CGPoint(x: rect.midX, y: rect.minY)))
    }

    override func copy(_ sender: Any?) {
        super.copy(sender)
        onCopied()
    }
}
