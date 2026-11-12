import SwiftUI
import UIKit

/// The system tab bar as iOS 26 lays it out with its trailing search button: a `UITabBarController` with the ribbon's
/// three places and a search-role tab whose round slot the plus stands on. Its tabs hold nothing: the one ribbon lies
/// under it, and every touch outside the bar's own controls passes through to it. A tab chosen moves the ribbon; the
/// search slot never becomes the selected tab.
struct PlaceTabs: UIViewControllerRepresentable {
    let place: RibbonPlace
    /// Room the bar leaves at its left for the view button.
    var leading: CGFloat = 0
    /// The tabs give way (a view with no ribbon to walk): only the search slot's place is still laid out, for the plus.
    var hidden = false
    let choose: (RibbonPlace) -> Void
    /// Where the search slot's round button stands on the screen, as the system laid it out.
    let slot: (CGRect) -> Void

    func makeUIViewController(context: Context) -> TabsHost {
        let host = TabsHost()
        update(host.tabs)
        return host
    }

    func updateUIViewController(_ host: TabsHost, context: Context) {
        host.leading = leading
        update(host.tabs)
    }

    private func update(_ controller: TabsController) {
        controller.choose = choose
        controller.slot = slot
        controller.show(place)
        controller.give(way: hidden)
    }
}

/// Holds the tab bar controller in a view that lets every touch outside the bar through to the ribbon under it.
final class TabsHost: UIViewController {
    let tabs = TabsController()
    var leading: CGFloat = 0 {
        didSet { if leading != oldValue { view.setNeedsLayout() } }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let frame = CGRect(x: leading, y: 0, width: view.bounds.width - leading, height: view.bounds.height)
        if tabs.view.frame != frame { tabs.view.frame = frame }
    }

    override func loadView() {
        view = PassThroughView()
        view.backgroundColor = .clear
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        addChild(tabs)
        tabs.view.frame = view.bounds
        view.addSubview(tabs.view)
        tabs.didMove(toParent: self)
    }
}

final class TabsController: UITabBarController, UITabBarControllerDelegate {
    var choose: (RibbonPlace) -> Void = { _ in }
    var slot: (CGRect) -> Void = { _ in }
    private let search = UISearchTab { _ in TabsController.empty() }
    private var reported: CGRect?

    static let plusTitle = String(localized: "New Task")

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        search.title = Self.plusTitle
        search.image = UIImage(systemName: "plus")
        tabs = RibbonPlace.allCases.map { place in
            UITab(title: place.name, image: UIImage(systemName: place.symbol), identifier: String(place.rawValue)) { _ in Self.empty() }
        } + [search]
        delegate = self
        tabBarMinimizeBehavior = .never
    }

    /// The tabs hidden and untouchable, or back: the bar stays laid out, so the plus keeps its slot.
    func give(way: Bool) {
        let alpha: CGFloat = way ? 0 : 1
        guard tabBar.alpha != alpha else { return }
        UIView.animate(withDuration: 0.25) { self.tabBar.alpha = alpha }
        tabBar.isUserInteractionEnabled = !way
    }

    func show(_ place: RibbonPlace) {
        guard let tab = tabs.first(where: { $0.identifier == String(place.rawValue) }), selectedTab !== tab else { return }
        selectedTab = tab
    }

    func tabBarController(_ tabBarController: UITabBarController, shouldSelectTab tab: UITab) -> Bool {
        if tab === search { return false }
        if let raw = Int(tab.identifier), let place = RibbonPlace(rawValue: raw) { choose(place) }
        return true
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        reportSlot()
        // The bar lays its own parts out after this pass (the view moved for the view button): told again once it has.
        DispatchQueue.main.async { [weak self] in
            self?.tabBar.layoutIfNeeded()
            self?.reportSlot()
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        reportSlot()
    }

    /// The search slot as laid out: the round view the bar stands beside its glass, the one square of the bar's own parts.
    private func reportSlot() {
        guard let window = view.window, let button = tabBar.subviews.first(where: { abs($0.bounds.width - $0.bounds.height) < 1 && $0.bounds.width >= 40 }) else { return }
        let frame = button.convert(button.bounds, to: window)
        guard frame.width > 0, frame != reported else { return }
        reported = frame
        slot(frame)
    }

    private static func empty() -> UIViewController {
        let controller = UIViewController()
        controller.view = PassThroughView()
        controller.view.backgroundColor = .clear
        return controller
    }
}

/// A view that takes no touch itself: the tabs' placeholders and the containers that fill the screen let every touch
/// through to the ribbon under them; only the bar's own small parts answer.
final class PassThroughView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let hit = super.hitTest(point, with: event), !(hit is PassThroughView) else { return nil }
        return hit.convert(hit.bounds, to: self).height < bounds.height / 2 ? hit : nil
    }
}
