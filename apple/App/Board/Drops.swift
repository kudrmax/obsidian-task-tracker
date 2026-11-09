import Core
import SwiftUI
import UIKit

/// A place the plus carried by the finger may be let go on: a list, or the calendar. The plus starts its carry at once,
/// with no hold, as the plugin's; the system's drag only lifts after a long press, so the plus is routed by hand to the
/// view under it, read from where the views stand now.
@MainActor
protocol PlusTarget: AnyObject {
    /// Where it takes the plus, in the window; nil while it is off the screen.
    var plusArea: CGRect? { get }
    func plusHover(at point: CGPoint)
    func plusLeave()
    /// Let go: where the field opens, in the window; nil when it opens nowhere.
    func plusLetGo() -> CGRect?
}

/// The plus carried over the board: the target under the finger shows where the new task would stand.
@MainActor
final class PlusRoute {
    private struct Weak {
        weak var target: (any PlusTarget)?
    }

    private var targets: [Weak] = []
    private weak var current: (any PlusTarget)?

    func add(_ target: any PlusTarget) {
        targets.removeAll { $0.target == nil || $0.target === target }
        targets.append(Weak(target: target))
    }

    private func target(at point: CGPoint) -> (any PlusTarget)? {
        targets.compactMap(\.target).first { $0.plusArea?.contains(point) == true }
    }

    /// The plus held at `point` of the window.
    func carry(at point: CGPoint) {
        let next = target(at: point)
        if next !== current { current?.plusLeave() }
        current = next
        next?.plusHover(at: point)
    }

    /// The plus held over no place (the cancel target, the bars).
    func carryOff() {
        current?.plusLeave()
        current = nil
    }

    /// What came of the plus let go: no place under it, or a place took it, with where its field opens in the window.
    enum LetGo {
        case missed
        case taken(CGRect?)
    }

    func letGo() -> LetGo {
        guard let current else { return .missed }
        self.current = nil
        return .taken(current.plusLetGo())
    }
}

/// A column's title as a drop target: a card carried onto it lights it, and let go there goes into the list keeping its
/// project, as the plugin's (`ScreenView.titleDrops`).
struct TitleDrop: UIViewRepresentable {
    let column: BoardColumn
    let model: BoardModel

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.addInteraction(UIDropInteraction(delegate: context.coordinator))
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.column = column
        context.coordinator.model = model
    }

    func makeCoordinator() -> Delegate { Delegate(column: column, model: model) }

    @MainActor
    final class Delegate: NSObject, UIDropInteractionDelegate {
        var column: BoardColumn
        weak var model: BoardModel?
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

        func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: any UIDropSession) { model?.leaveTitle(column) }

        func dropInteraction(_ interaction: UIDropInteraction, performDrop session: any UIDropSession) {
            landing = nil
            if case .landed(let landed) = model?.dropOnTitle(column) { landing = landed }
        }

        /// The copy flies into the card's row where the list now draws it.
        func dropInteraction(_ interaction: UIDropInteraction, previewForDropping item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
            guard let window = interaction.view?.window, let id = landing?.id, let list = model?.listController(column), let frame = list.capsule(of: id) else { return nil }
            list.collection.layoutIfNeeded()
            return defaultPreview.retargetedPreview(with: UIDragPreviewTarget(container: window, center: CGPoint(x: frame.midX, y: frame.midY)))
        }
    }
}

/// The calendar as a drop target, over the whole column, the all-day strip included: a card held over it shows the line
/// at the minute it would start, on the grid's step; let go, the copy flies to the block the core makes. The plus is
/// routed here too.
struct TimelineDrop: UIViewRepresentable {
    let model: BoardModel

    func makeUIView(context: Context) -> DropView {
        let view = DropView()
        view.model = model
        view.addInteraction(UIDropInteraction(delegate: view))
        model.plus.add(view)
        return view
    }

    func updateUIView(_ view: DropView, context: Context) {
        view.model = model
    }

    @MainActor
    final class DropView: UIView, UIDropInteractionDelegate, PlusTarget {
        weak var model: BoardModel?
        private var spot: CGRect?

        /// The minute of the grid under a point of the window.
        private func minute(at point: CGPoint) -> Double? {
            guard let model, let canvas = model.calendarCanvas else { return nil }
            let local = canvas.convert(point, from: window)
            return Double(max(0, local.y - TimelineGeometry.labelLift) / model.calendarHour * 60)
        }

        func dropInteraction(_ interaction: UIDropInteraction, canHandle session: any UIDropSession) -> Bool {
            guard let payload = DragPayload.of(session) else { return false }
            return !payload.isSection
        }

        func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: any UIDropSession) -> UIDropProposal {
            guard let minute = minute(at: convert(session.location(in: self), to: window)) else { return UIDropProposal(operation: .cancel) }
            model?.hoverCalendar(minute: minute)
            return UIDropProposal(operation: .move)
        }

        func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: any UIDropSession) { model?.leaveCalendar() }

        func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: any UIDropSession) { model?.leaveCalendar() }

        func dropInteraction(_ interaction: UIDropInteraction, performDrop session: any UIDropSession) {
            spot = model?.dropOnCalendar()
        }

        func dropInteraction(_ interaction: UIDropInteraction, previewForDropping item: UIDragItem, withDefault defaultPreview: UITargetedDragPreview) -> UITargetedDragPreview? {
            guard let spot, let canvas = model?.calendarCanvas, canvas.window != nil else { return nil }
            let size = defaultPreview.size
            let scale = size.width > 0 && size.height > 0 ? CGAffineTransform(scaleX: spot.width / size.width, y: spot.height / size.height) : .identity
            return defaultPreview.retargetedPreview(with: UIDragPreviewTarget(container: canvas, center: CGPoint(x: spot.midX, y: spot.midY), transform: scale))
        }

        // MARK: The plus

        var plusArea: CGRect? { window.map { convert(bounds, to: $0) } }

        func plusHover(at point: CGPoint) {
            if let minute = minute(at: point) { model?.hoverCalendar(minute: minute) }
        }

        func plusLeave() { model?.leaveCalendar() }

        func plusLetGo() -> CGRect? {
            guard let canvas = model?.calendarCanvas, let rect = model?.plusOnCalendar() else { return nil }
            return canvas.convert(rect, to: nil)
        }
    }
}

/// The calendar's content as a view: a carry over the calendar reads its minute from where the content stands.
struct CanvasProbe: UIViewRepresentable {
    let model: BoardModel

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        model.calendarCanvas = view
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        model.calendarCanvas = view
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
