import SwiftUI
import UIKit

/// The system tab bar as iOS 26 lays it out with its trailing search button: a `UITabBarController` with the ribbon's
/// three places and a search-role tab whose round slot the plus stands on. Its tabs hold nothing: the one ribbon lies
/// under it, and every touch outside the bar's own controls passes through to it. A tab chosen moves the ribbon; the
/// search slot never becomes the selected tab.
struct PlaceTabs: UIViewControllerRepresentable {
    let place: RibbonPlace
    let choose: (RibbonPlace) -> Void
    /// Where the search slot's round button stands on the screen, as the system laid it out.
    let slot: (CGRect) -> Void

    func makeUIViewController(context: Context) -> TabsHost {
        let host = TabsHost()
        update(host.tabs)
        return host
    }

    func updateUIViewController(_ host: TabsHost, context: Context) {
        update(host.tabs)
    }

    private func update(_ controller: TabsController) {
        controller.choose = choose
        controller.slot = slot
        controller.show(place)
    }
}

/// Holds the tab bar controller in a view that lets every touch outside the bar through to the ribbon under it.
final class TabsHost: UIViewController {
    let tabs = TabsController()

    override func loadView() {
        view = PassThroughView()
        view.backgroundColor = .clear
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        addChild(tabs)
        tabs.view.frame = view.bounds
        tabs.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
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
