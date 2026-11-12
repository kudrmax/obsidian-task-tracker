import Core
import SwiftUI
import UIKit

/// A place of the board a carry may be let go on: a list, a column's title, the calendar, the all-day strip. The board's
/// drag (`DragController`) routes every move of the finger to one of them (`BoardRoute`), so a carry always has a target.
@MainActor
protocol BoardTarget: AnyObject {
    /// Where it stands, in the window; nil while it is off the screen.
    var area: CGRect? { get }
    /// Taken before the targets it overlaps: a column's title before the list whose first place it also is.
    var priority: Int { get }
    /// What scrolls under a carry held at its edge.
    var scrolls: UIScrollView? { get }
    /// A carry held at `point` of the window, inside the area: the plus (nil) or a card or section.
    func hover(at point: CGPoint, carrying payload: DragPayload?)
    func leave()
    /// Let go: where the field opens or the carried thing lands, in the window; nil: nothing taken, the copy flies home.
    func letGo(carrying payload: DragPayload?) -> CarryLanding?
    /// It takes this carry: a section only in its own list.
    func takes(_ payload: DragPayload?) -> Bool
    /// Where the carried copy rides over it: aside of the finger where its target is the row or line under the finger,
    /// which must stay seen.
    func ride(_ payload: DragPayload?) -> CopyRide
}

/// Where the carried copy stands against the finger.
enum CopyRide: Equatable {
    /// Where the finger took it.
    case held
    /// Above the finger: the row under it stays seen.
    case above
    /// Below the finger: the line under it and the row above the line stay seen.
    case below
}

extension BoardTarget {
    func takes(_ payload: DragPayload?) -> Bool { payload?.isSection != true && payload?.isProject != true }
    var priority: Int { 0 }
    var scrolls: UIScrollView? { nil }
    func ride(_ payload: DragPayload?) -> CopyRide { .held }
}

/// The one routing of the board's carries: the target the point is in, else the nearest target of the column under the
/// finger's `x`, with the point brought into its visible part (above it: its top; over the tab bar: its last visible
/// place).
@MainActor
final class BoardRoute {
    private struct Weak {
        weak var target: (any BoardTarget)?
    }

    private var targets: [Weak] = []
    private weak var current: (any BoardTarget)?
    /// The top of the tab bar, in the window: what stands under it is not seen.
    var floor: CGFloat = .infinity
    /// The window the carry is in, set as it lifts: looked up once per carry, not on every move.
    weak var window: UIWindow?

    func add(_ target: any BoardTarget) {
        targets.removeAll { $0.target == nil || $0.target === target }
        targets.append(Weak(target: target))
    }

    /// The target for `point` and the point brought into what shows of it. A section goes only to its own list.
    private func route(_ point: CGPoint, carrying payload: DragPayload?) -> (target: any BoardTarget, point: CGPoint)? {
        let shown = targets.compactMap { weak -> (any BoardTarget, CGRect)? in
            guard let target = weak.target, target.takes(payload), let area = target.area else { return nil }
            let visible = window.map { area.intersection($0.bounds) } ?? area
            return visible.isNull || visible.isEmpty ? nil : (target, visible)
        }.sorted { $0.0.priority > $1.0.priority }
        let seen = { (area: CGRect) in CGRect(x: area.minX, y: area.minY, width: area.width, height: max(1, min(area.maxY, self.floor) - area.minY)) }
        if let inside = shown.first(where: { seen($0.1).contains(point) }) { return (inside.0, point) }
        let column = shown.filter { $0.1.minX <= point.x && point.x < $0.1.maxX && $0.0.priority == 0 }
        guard let nearest = column.min(by: { distance(point.y, seen($0.1)) < distance(point.y, seen($1.1)) }) else { return nil }
        let area = seen(nearest.1)
        return (nearest.0, CGPoint(x: point.x, y: min(max(point.y, area.minY + 1), area.maxY - 1)))
    }

    private func distance(_ y: CGFloat, _ area: CGRect) -> CGFloat {
        y < area.minY ? area.minY - y : y > area.maxY ? y - area.maxY : 0
    }

    /// The carry held at `point`: the target under it shows where it would go. False where no place takes it.
    func hold(_ point: CGPoint, carrying payload: DragPayload?) -> Bool {
        let routed = route(point, carrying: payload)
        if routed?.target !== current { current?.leave() }
        current = routed?.target
        guard let routed else { return false }
        routed.target.hover(at: routed.point, carrying: payload)
        return true
    }

    /// Where the place held now has the carried copy ride.
    func ride(_ payload: DragPayload?) -> CopyRide { current?.ride(payload) ?? .held }

    /// What scrolls under the finger at `point`: the place held now, when the finger is over it or its column.
    func scrolled(at point: CGPoint) -> UIScrollView? {
        current?.scrolls
    }

    /// The carry held over no place (the cancel target).
    func carryOff() {
        current?.leave()
        current = nil
    }

    /// Let go on the place held: where it lands; nil where nothing takes it.
    func letGo(carrying payload: DragPayload?) -> CarryLanding? {
        guard let current else { return nil }
        self.current = nil
        return current.letGo(carrying: payload)
    }
}

/// A column's title as a place: a card carried onto it lights it, and let go there goes into the list keeping its
/// project, as the plugin's (`ScreenView.titleDrops`). The plus is never put on a title: over it, the list's first place
/// takes it.
struct TitleDrop<Title: View>: UIViewRepresentable {
    let column: BoardColumn
    let model: BoardModel
    /// Room over the title that takes a carry too.
    var top: CGFloat = 0
    /// The title's own height: a column's, or a stage's small heading in the Rows view.
    var row: CGFloat = ColumnMetrics.titleRow
    @ViewBuilder let title: () -> Title

    func makeUIView(context: Context) -> TitleTarget {
        let view = TitleTarget(column: column, model: model)
        let content = UIHostingConfiguration { title() }.margins(.all, 0).makeContentView()
        content.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(content)
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            content.topAnchor.constraint(equalTo: view.topAnchor),
            content.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        view.content = content
        model.route.add(view)
        return view
    }

    func updateUIView(_ view: TitleTarget, context: Context) {
        view.column = column
        view.model = model
        view.content?.configuration = UIHostingConfiguration { title() }.margins(.all, 0)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: TitleTarget, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? uiView.bounds.width, height: top + row + ColumnMetrics.headGap)
    }
}

@MainActor
final class TitleTarget: UIView, BoardTarget {
    var column: BoardColumn
    weak var model: BoardModel?
    var content: (UIView & UIContentView)?

    init(column: BoardColumn, model: BoardModel) {
        self.column = column
        self.model = model
        super.init(frame: .zero)
        backgroundColor = .clear
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    var area: CGRect? {
        guard let window, bounds.height > 0 else { return nil }
        return convert(bounds, to: window)
    }

    var priority: Int { 1 }

    /// A card, where a drop on the title means something; the plus and a section go to the list.
    func takes(_ payload: DragPayload?) -> Bool {
        guard let payload, !payload.isSection else { return false }
        return model?.titleTakes(column) == true
    }

    func hover(at point: CGPoint, carrying payload: DragPayload?) {
        model?.drag.hideLine()
        if model?.hoverTitle(column) == true { DropLog.target("title \(column.rawValue)") }
    }

    func leave() { model?.leaveTitle(column) }

    /// The copy flies into the card's row where the list now draws it.
    func letGo(carrying payload: DragPayload?) -> CarryLanding? {
        model?.leaveTitle(column)
        guard let model, case .landed(let landed) = model.dropOnTitle(column) else { return nil }
        return model.landingOnScreen(landed, from: column)
    }
}

/// A place a carried card held over for a moment activates, as the system's spring loading (Files' folders, Mail's
/// mailboxes): the day arrows turn the day under a carry, and the carry goes on in the day that came in.
struct SpringLoaded: UIViewRepresentable {
    let model: BoardModel
    let activate: () -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        model.drag.springs.add(view, activate: activate)
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        model.drag.springs.add(view, activate: activate)
    }
}

/// The calendar as a place: a card held over it shows the line at the minute it would start, on the grid's step; let
/// go, the copy flies to the block the core makes. The plus is routed here too. The content's probe finds the scroll view
/// and reads minutes from where the content stands; the press that lifts a block lives on that scroll view, as a list's
/// lives on its collection, so a carry outlives the day its block was lifted from (a day arrow turning the day under it).
struct CanvasProbe: UIViewRepresentable {
    let model: BoardModel

    func makeUIView(context: Context) -> Probe {
        let view = Probe()
        view.isUserInteractionEnabled = false
        view.target.model = model
        model.calendarCanvas = view
        model.route.add(view.target)
        return view
    }

    func updateUIView(_ view: Probe, context: Context) {
        view.target.model = model
        model.calendarCanvas = view
    }

    final class Probe: UIView {
        let target = CalendarDrop()

        override func didMoveToWindow() {
            super.didMoveToWindow()
            var view = superview
            while let next = view, !(next is UIScrollView) { view = next.superview }
            target.attach(to: view as? UIScrollView)
        }
    }
}

@MainActor
final class CalendarDrop: NSObject, BoardTarget, UIGestureRecognizerDelegate {
    weak var model: BoardModel?
    private(set) weak var scroll: UIScrollView?
    /// The long press that lifts a block, on the calendar's scroll view.
    private let press = UILongPressGestureRecognizer()
    /// The block the press is on, found as it began.
    private weak var pressed: CardControl?

    override init() {
        super.init()
        press.addTarget(self, action: #selector(pressed(_:)))
        press.delegate = self
        press.minimumPressDuration = CarryMotion.liftDelay
    }

    func attach(to scroll: UIScrollView?) {
        guard scroll !== self.scroll else { return }
        self.scroll?.removeGestureRecognizer(press)
        self.scroll = scroll
        scroll?.addGestureRecognizer(press)
    }

    /// The block under the finger, when it may lift now (the board's one rule, `BoardModel.mayLift`).
    func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        guard recognizer === press else { return true }
        pressed = nil
        guard let scroll, let model else { return false }
        var view = scroll.hitTest(press.location(in: scroll), with: nil)
        while let next = view, !(next is CardControl), next !== scroll { view = next.superview }
        guard let control = view as? CardControl, control.draggable, let card = control.look?.card, model.mayLift(card, from: control.from) else { return false }
        pressed = control
        return true
    }

    @objc private func pressed(_ press: UILongPressGestureRecognizer) {
        guard let drag = model?.drag else { return }
        let point = press.firstFinger
        switch press.state {
        case .began:
            guard let control = pressed, let window = scroll?.window, let lift = control.lift(finger: point, in: window) else { return }
            drag.lift(lift, at: point, in: window)
        case .changed:
            drag.move(to: point)
        case .ended:
            drag.letGo(at: point)
        case .cancelled, .failed:
            drag.cancel()
        default:
            break
        }
    }

    /// The minute of the grid under a point of the window, `grab` points above it: the carried card's top edge, where the
    /// line shows above the card rather than under it.
    private func minute(at point: CGPoint, grab: CGFloat = 0) -> Double? {
        guard let model, let canvas = model.calendarCanvas else { return nil }
        let local = canvas.convert(point, from: nil)
        return Double(max(0, local.y - grab - TimelineGeometry.labelLift) / model.calendarHour * 60)
    }

    var area: CGRect? { scroll.flatMap { view in view.window.map { view.convert(view.bounds, to: $0).intersection($0.bounds) } } }

    var scrolls: UIScrollView? { scroll }

    func hover(at point: CGPoint, carrying payload: DragPayload?) {
        model?.drag.hideLine()
        guard let minute = minute(at: point, grab: payload?.grab ?? 0) else { return }
        model?.hoverCalendar(minute: minute)
    }

    func leave() {
        model?.leaveCalendar()
    }

    func letGo(carrying payload: DragPayload?) -> CarryLanding? {
        guard let canvas = model?.calendarCanvas else { return nil }
        guard let rect = payload == nil ? model?.plusOnCalendar() : model?.dropOnCalendar() else { return nil }
        return CarryLanding(rect: canvas.convert(rect, to: nil), opens: payload == nil, onCalendar: true)
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
        model.route.add(view)
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
                model.drag.hideLine()
                _ = model.hoverTitle(.day)
                DropLog.target("all-day: the day's title")
            }
        }

        func leave() {
            model?.leaveTitle(.day)
            model?.listController(.day)?.leave()
        }

        func letGo(carrying payload: DragPayload?) -> CarryLanding? {
            guard let model else { return nil }
            guard payload != nil else { return model.listController(.day)?.letGo(carrying: nil) }
            model.leaveTitle(.day)
            guard case .landed(let landed) = model.dropOnTitle(.day) else { return nil }
            return model.landingOnScreen(landed, from: .day)
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
