import Core
import SwiftUI
import UIKit

/// A place of the board a carry the board routes may be let go on: a list, the calendar, the all-day strip. The board
/// routes two carries itself: the plus, which moves at once with no hold, as the plugin's, and the system's drag of a card
/// where no list or calendar takes it (the top bar, the tab bar, the divider): there the place is the nearest one of the
/// column under the finger, so a carry always has a target.
@MainActor
protocol BoardTarget: AnyObject {
    /// Where it stands, in the window; nil while it is off the screen.
    var area: CGRect? { get }
    /// A carry held at `point` of the window, inside the area: the plus (nil) or a card.
    func hover(at point: CGPoint, carrying payload: DragPayload?)
    func leave()
    /// Let go: where the field opens or the card lands, in the window.
    func letGo(carrying payload: DragPayload?) -> CGRect?
    /// It takes this carry: a section only in its own list.
    func takes(_ payload: DragPayload?) -> Bool
}

extension BoardTarget {
    func takes(_ payload: DragPayload?) -> Bool { payload?.isSection != true }
}

/// The one routing of the board's own carries: the target the point is in, else the nearest target of the column under
/// the finger's `x`, with the point brought into its visible part (above it: its top; over the tab bar: its last visible
/// place).
@MainActor
final class BoardRoute: NSObject, UIDropInteractionDelegate {
    private struct Weak {
        weak var target: (any BoardTarget)?
    }

    private var targets: [Weak] = []
    private weak var current: (any BoardTarget)?
    /// The top of the tab bar, in the window: what stands under it is not seen.
    var floor: CGFloat = .infinity
    private(set) lazy var interaction = UIDropInteraction(delegate: self)

    func add(_ target: any BoardTarget) {
        targets.removeAll { $0.target == nil || $0.target === target }
        targets.append(Weak(target: target))
    }

    /// The target for `point` and the point brought into what shows of it. A section goes only to its own list.
    private func route(_ point: CGPoint, carrying payload: DragPayload?) -> (target: any BoardTarget, point: CGPoint)? {
        let shown = targets.compactMap { weak -> (any BoardTarget, CGRect)? in
            guard let target = weak.target, target.takes(payload), let area = target.area, let window = interaction.view?.window ?? UIApplication.shared.connectedScenes.lazy.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else { return nil }
            let visible = area.intersection(window.bounds)
            return visible.isNull || visible.isEmpty ? nil : (target, visible)
        }
        let seen = { (area: CGRect) in CGRect(x: area.minX, y: area.minY, width: area.width, height: max(1, min(area.maxY, self.floor) - area.minY)) }
        if let inside = shown.first(where: { seen($0.1).contains(point) }) { return (inside.0, point) }
        let column = shown.filter { $0.1.minX <= point.x && point.x < $0.1.maxX }
        guard let nearest = column.min(by: { distance(point.y, seen($0.1)) < distance(point.y, seen($1.1)) }) else { return nil }
        let area = seen(nearest.1)
        return (nearest.0, CGPoint(x: point.x, y: min(max(point.y, area.minY + 1), area.maxY - 1)))
    }

    private func distance(_ y: CGFloat, _ area: CGRect) -> CGFloat {
        y < area.minY ? area.minY - y : y > area.maxY ? y - area.maxY : 0
    }

    private func hold(_ point: CGPoint, carrying payload: DragPayload?) -> Bool {
        let routed = route(point, carrying: payload)
        if routed?.target !== current { current?.leave() }
        current = routed?.target
        guard let routed else { return false }
        routed.target.hover(at: routed.point, carrying: payload)
        return true
    }

    // MARK: The plus, carried by the finger itself

    func carry(at point: CGPoint) {
        _ = hold(point, carrying: nil)
    }

    /// The plus held over no place (its own cancel target).
    func carryOff() {
        current?.leave()
        current = nil
    }

    enum LetGo {
        case missed
        case taken(CGRect?)
    }

    func letGo() -> LetGo {
        guard let current else { return .missed }
        self.current = nil
        return .taken(current.letGo(carrying: nil))
    }

    // MARK: A card where no list or calendar takes it

    private var landing: CGRect?

    func dropInteraction(_ interaction: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
        DragPayload.of(session) != nil
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: any UIDropSession) -> UIDropProposal {
        guard let window = interaction.view else { return UIDropProposal(operation: .cancel) }
        return hold(session.location(in: window), carrying: DragPayload.of(session)) ? UIDropProposal(operation: .move) : UIDropProposal(operation: .cancel)
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: any UIDropSession) { carryOff() }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: any UIDropSession) {
        carryOff()
        model?.endCarry(of: session)
    }

    weak var model: BoardModel?

    func dropInteraction(_ interaction: UIDropInteraction, performDrop session: any UIDropSession) {
        let payload = DragPayload.of(session)
        landing = current?.letGo(carrying: payload) ?? payload?.home
        current = nil
    }

    func dropInteraction(_ interaction: UIDropInteraction, previewForDropping item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
        guard let landing, let window = interaction.view else { return nil }
        self.landing = nil
        return defaultPreview.retargetedPreview(with: UIDragPreviewTarget(container: window, center: CGPoint(x: landing.midX, y: landing.midY)))
    }

    func dropInteraction(_ interaction: UIDropInteraction, item: UIDragItem, willAnimateDropWith animator: any UIDragAnimating) {
        model?.hideUntilLanded(item, animator)
    }
}

/// Puts the board's route on the window: a card held where nothing else takes it is routed there.
struct BoardRouteAnchor: UIViewRepresentable {
    let route: BoardRoute

    func makeUIView(context: Context) -> Anchor {
        let view = Anchor()
        view.route = route
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: Anchor, context: Context) {}

    final class Anchor: UIView {
        var route: BoardRoute?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard let route, let window, route.interaction.view !== window else { return }
            window.addInteraction(route.interaction)
        }
    }
}

/// A column's title as a drop target: a card carried onto it lights it, and let go there goes into the list keeping its
/// project, as the plugin's (`ScreenView.titleDrops`). The title is drawn inside the view that holds the drop interaction,
/// so a drop over any of it, its words and buttons included, finds it.
struct TitleDrop<Title: View>: UIViewRepresentable {
    let column: BoardColumn
    let model: BoardModel
    /// Room over the title that takes a carry too.
    var top: CGFloat = 0
    @ViewBuilder let title: () -> Title

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        let content = UIHostingConfiguration { title() }.margins(.all, 0).makeContentView()
        content.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(content)
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            content.topAnchor.constraint(equalTo: view.topAnchor),
            content.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        context.coordinator.content = content
        view.addInteraction(UIDropInteraction(delegate: context.coordinator))
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.column = column
        context.coordinator.model = model
        context.coordinator.content?.configuration = UIHostingConfiguration { title() }.margins(.all, 0)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIView, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? uiView.bounds.width, height: top + ColumnMetrics.titleRow + ColumnMetrics.headGap)
    }

    func makeCoordinator() -> Delegate { Delegate(column: column, model: model) }

    @MainActor
    final class Delegate: NSObject, UIDropInteractionDelegate {
        var column: BoardColumn
        weak var model: BoardModel?
        var content: (UIView & UIContentView)?
        private var landing: DropLanding?

        init(column: BoardColumn, model: BoardModel) {
            self.column = column
            self.model = model
        }

        func dropInteraction(_ interaction: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
            guard let payload = DragPayload.of(session) else { return false }
            return !payload.isSection
        }

        func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: any UIDropSession) -> UIDropProposal {
            guard model?.hoverTitle(column) == true else { return UIDropProposal(operation: .forbidden) }
            DropLog.target("title \(column.rawValue)")
            return UIDropProposal(operation: .move)
        }

        func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: any UIDropSession) { model?.leaveTitle(column) }

        func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: any UIDropSession) {
            model?.leaveTitle(column)
            model?.endCarry(of: session)
        }

        func dropInteraction(_ interaction: UIDropInteraction, item: UIDragItem, willAnimateDropWith animator: any UIDragAnimating) {
            model?.hideUntilLanded(item, animator)
        }

        func dropInteraction(_ interaction: UIDropInteraction, performDrop session: any UIDropSession) {
            landing = nil
            if case .landed(let landed) = model?.dropOnTitle(column) { landing = landed }
        }

        /// The copy flies into the card's row where the list now draws it.
        func dropInteraction(_ interaction: UIDropInteraction, previewForDropping item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
            guard let window = interaction.view?.window, let id = landing?.id, let list = model?.listController(column) else { return nil }
            list.collection.layoutIfNeeded()
            guard let frame = list.capsule(of: id) else { return nil }
            return defaultPreview.retargetedPreview(with: UIDragPreviewTarget(container: window, center: CGPoint(x: frame.midX, y: frame.midY)))
        }
    }
}

/// A place a carried card held over for a moment activates, the system's spring loading (Files' folders, Mail's
/// mailboxes): the day arrows turn the day under a carry, and the carry goes on in the day that came in.
struct SpringLoaded: UIViewRepresentable {
    let activate: () -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        let coordinator = context.coordinator
        view.addInteraction(UISpringLoadedInteraction { _, _ in coordinator.activate() })
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.activate = activate
    }

    func makeCoordinator() -> Coordinator { Coordinator(activate: activate) }

    @MainActor
    final class Coordinator {
        var activate: () -> Void
        init(activate: @escaping () -> Void) { self.activate = activate }
    }
}

/// The calendar as a drop target, its own scroll view holding the drop interaction: a card held over it shows the line at
/// the minute it would start, on the grid's step; let go, the copy flies to the block the core makes. The plus is routed
/// here too. The content's probe finds the scroll view and reads minutes from where the content stands.
struct CanvasProbe: UIViewRepresentable {
    let model: BoardModel

    func makeUIView(context: Context) -> Probe {
        let view = Probe()
        view.isUserInteractionEnabled = false
        view.target.model = model
        model.calendarCanvas = view
        model.plus.add(view.target)
        return view
    }

    func updateUIView(_ view: Probe, context: Context) {
        view.target.model = model
        model.calendarCanvas = view
    }

    final class Probe: UIView {
        let target = CalendarDrop()
        private lazy var interaction = UIDropInteraction(delegate: target)

        override func didMoveToWindow() {
            super.didMoveToWindow()
            var view = superview
            while let next = view, !(next is UIScrollView) { view = next.superview }
            guard let scroll = view, interaction.view !== scroll else { return }
            interaction.view?.removeInteraction(interaction)
            scroll.addInteraction(interaction)
            target.scroll = scroll
        }
    }
}

@MainActor
final class CalendarDrop: NSObject, UIDropInteractionDelegate, BoardTarget {
    weak var model: BoardModel?
    weak var scroll: UIView?
    private var spot: CGRect?

    /// The minute of the grid under a point of the window, `grab` points above it: the carried card's top edge, where the
    /// line shows above the card rather than under it.
    private func minute(at point: CGPoint, grab: CGFloat = 0) -> Double? {
        guard let model, let canvas = model.calendarCanvas else { return nil }
        let local = canvas.convert(point, from: nil)
        return Double(max(0, local.y - grab - TimelineGeometry.labelLift) / model.calendarHour * 60)
    }

    func dropInteraction(_ interaction: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
        guard let payload = DragPayload.of(session) else { return false }
        return !payload.isSection
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: any UIDropSession) -> UIDropProposal {
        let grab = DragPayload.of(session)?.grab ?? 0
        guard let view = interaction.view, let window = view.window, let minute = minute(at: view.convert(session.location(in: view), to: window), grab: grab) else { return UIDropProposal(operation: .cancel) }
        model?.hoverCalendar(minute: minute)
        return UIDropProposal(operation: .move)
    }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: any UIDropSession) { model?.leaveCalendar() }

    func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: any UIDropSession) {
        model?.leaveCalendar()
        model?.endCarry(of: session)
    }

    func dropInteraction(_ interaction: UIDropInteraction, item: UIDragItem, willAnimateDropWith animator: any UIDragAnimating) {
        model?.hideUntilLanded(item, animator)
    }

    func dropInteraction(_ interaction: UIDropInteraction, performDrop session: any UIDropSession) {
        spot = model?.dropOnCalendar()
    }

    func dropInteraction(_ interaction: UIDropInteraction, previewForDropping item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
        guard let spot, let canvas = model?.calendarCanvas, canvas.window != nil else { return nil }
        let size = defaultPreview.size
        let scale = size.width > 0 && size.height > 0 ? CGAffineTransform(scaleX: spot.width / size.width, y: spot.height / size.height) : .identity
        return defaultPreview.retargetedPreview(with: UIDragPreviewTarget(container: canvas, center: CGPoint(x: spot.midX, y: spot.midY), transform: scale))
    }

    // MARK: A carry the board routes here

    var area: CGRect? { scroll.flatMap { view in view.window.map { view.convert(view.bounds, to: $0) } } }

    func hover(at point: CGPoint, carrying payload: DragPayload?) {
        if let minute = minute(at: point, grab: payload?.grab ?? 0) { model?.hoverCalendar(minute: minute) }
    }

    func leave() { model?.leaveCalendar() }

    func letGo(carrying payload: DragPayload?) -> CGRect? {
        guard let canvas = model?.calendarCanvas else { return nil }
        let rect = payload == nil ? model?.plusOnCalendar() : model?.dropOnCalendar()
        return rect.map { canvas.convert($0, to: nil) }
    }
}

/// The all-day strip over the calendar as a place: a card let go there goes to the day itself with no time, as on the day
/// list's title (`ScreenView.titleDrops.day`), which lights for it; the plus opens its field at the top of the day list.
struct AllDayDrop: UIViewRepresentable {
    let model: BoardModel

    func makeUIView(context: Context) -> Probe {
        let view = Probe()
        view.isUserInteractionEnabled = false
        view.model = model
        model.plus.add(view)
        return view
    }

    func updateUIView(_ view: Probe, context: Context) {
        view.model = model
    }

    @MainActor
    final class Probe: UIView, BoardTarget {
        weak var model: BoardModel?

        var area: CGRect? {
            guard let window, bounds.height > 0 else { return nil }
            return convert(bounds, to: window)
        }

        func hover(at point: CGPoint, carrying payload: DragPayload?) {
            guard let model else { return }
            if payload == nil {
                model.listController(.day)?.hover(at: model.listController(.day)?.area.map { CGPoint(x: $0.midX, y: $0.minY + 1) } ?? point, carrying: nil)
            } else {
                _ = model.hoverTitle(.day)
                DropLog.target("all-day: the day's title")
            }
        }

        func leave() {
            model?.leaveTitle(.day)
            model?.listController(.day)?.leave()
        }

        func letGo(carrying payload: DragPayload?) -> CGRect? {
            guard let model else { return nil }
            guard payload != nil else { return model.listController(.day)?.letGo(carrying: nil) }
            guard case .landed(let landed) = model.dropOnTitle(.day), let id = landed?.id, let list = model.listController(.day) else { return nil }
            list.collection.layoutIfNeeded()
            return list.capsule(of: id)
        }
    }
}

/// Tells of every touch that begins anywhere in the window, taking none: the found card's ring goes at the next touch, as
/// the plugin's (`FoundCard`).
struct TouchWatch: UIViewRepresentable {
    /// Where the touch began, in the window.
    let touched: @MainActor (CGPoint) -> Void

    func makeUIView(context: Context) -> Probe { Probe(touched: touched) }

    func updateUIView(_ probe: Probe, context: Context) { probe.watch.touched = touched }

    final class Probe: UIView {
        let watch: Watch

        init(touched: @escaping @MainActor (CGPoint) -> Void) {
            watch = Watch(touched: touched)
            super.init(frame: .zero)
            isUserInteractionEnabled = false
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError("not from a storyboard") }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            if let window, watch.view !== window { window.addGestureRecognizer(watch) }
        }
    }

    /// Fails at once on every touch, after telling of it: no other gesture ever waits for it or loses its touches.
    final class Watch: UIGestureRecognizer, UIGestureRecognizerDelegate {
        var touched: @MainActor (CGPoint) -> Void

        init(touched: @escaping @MainActor (CGPoint) -> Void) {
            self.touched = touched
            super.init(target: nil, action: nil)
            cancelsTouchesInView = false
            delaysTouchesBegan = false
            delaysTouchesEnded = false
            delegate = self
        }

        override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
            touched(touches.first?.location(in: nil) ?? .zero)
            state = .failed
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }
}
