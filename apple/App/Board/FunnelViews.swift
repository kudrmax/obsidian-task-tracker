import Core
import SwiftUI
import UIKit

/// The Rows view (board `projects-one-view/T3`): the funnel's lists stacked on the left, each under its small heading, the
/// calendar on the right behind the divider, which sets the list's width as at Today. The day turns by the arrows over
/// the calendar. Nothing here swipes: the screen stands still sideways.
struct RowsView: View {
    let snapshot: BoardSnapshot
    let lists: [BoardColumn]
    @Bindable var model: BoardModel

    var body: some View {
        SplitWithCalendar(snapshot: snapshot, model: model) {
            StackedLists(snapshot: snapshot, lists: lists, model: model)
        }
    }
}

/// The By project view (board `T7`): the filter's node's tasks in its subprojects' parts on the left (every task by its
/// top project with no filter), the calendar on the right behind the divider. Its list is read by `ProjectsBoard.follow`,
/// the one way it is read.
struct ByProjectView: View {
    let snapshot: BoardSnapshot
    @Bindable var model: BoardModel

    var body: some View {
        SplitWithCalendar(snapshot: snapshot, model: model) {
            ProjectTasks(model: model)
                .frame(maxHeight: .infinity, alignment: .top)
        }
    }
}

/// All columns (a wide screen's; the phone is never offered it): the funnel's columns side by side, sharing the list's
/// width, the calendar behind the divider.
struct AllColumnsView: View {
    let snapshot: BoardSnapshot
    let columns: [[BoardColumn]]
    @Bindable var model: BoardModel

    var body: some View {
        SplitWithCalendar(snapshot: snapshot, model: model) {
            HStack(alignment: .top, spacing: 0) {
                ForEach(Array(columns.enumerated()), id: \.offset) { _, lists in
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(lists, id: \.self) { column in
                            if let list = snapshot.lists[column] {
                                ListColumn(list: list, model: model).equatable()
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                }
            }
        }
    }
}

/// A list beside the calendar, the divider between them: the list's width is the day list's at Today (one share for
/// both), its handle drags it as there.
private struct SplitWithCalendar<Lists: View>: View {
    let snapshot: BoardSnapshot
    @Bindable var model: BoardModel
    @ViewBuilder let lists: () -> Lists

    var body: some View {
        GeometryReader { box in
            let width = box.size.width
            let list = model.listWidths(share: model.listShare, viewWidth: width).map { CGFloat($0.width) } ?? width / 2
            HStack(alignment: .top, spacing: 0) {
                lists()
                    .frame(width: list)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .clipped()
                VStack(alignment: .leading, spacing: 0) {
                    ColumnTitle(title: model.titleSnapshot?.lists[.day]?.title ?? snapshot.dayTitle, dayArrows: true, model: model)
                        .padding(.bottom, ColumnMetrics.headGap)
                    TimelineColumn(timeline: snapshot.timeline, model: model)
                        .equatable()
                        .frame(maxHeight: .infinity, alignment: .top)
                }
                .frame(width: width - list)
                .frame(maxHeight: .infinity, alignment: .top)
            }
            .overlay(alignment: .leading) { ListDivider(model: model, width: width).offset(x: list) }
        }
    }
}

/// The handle on the line between the list and the calendar: dragged, the list grows or narrows within the core's
/// bounds, holding to the middle as the core says (`rules.dividerAt`), a tap felt each time it holds. The share is the
/// device's one (`BoardModel.listShare`), the ribbon's at Today too.
struct ListDivider: View {
    let model: BoardModel
    let width: CGFloat
    var shown: CGFloat = 1
    @State private var dragStart: CGFloat?
    @State private var snapped = false
    @State private var snaps = 0

    var body: some View {
        Capsule()
            .fill(Color(.tertiaryLabel))
            .frame(width: 5, height: 36)
            .frame(width: 28)
            .frame(maxHeight: .infinity)
            .contentShape(.rect)
            .offset(x: -14)
            .opacity(shown)
            .allowsHitTesting(shown > 0.99)
            .gesture(
                DragGesture(minimumDistance: 2, coordinateSpace: .global)
                    .onChanged { drag in
                        let start = dragStart ?? listWidth
                        if dragStart == nil { dragStart = start }
                        guard let bounds = model.listWidths(share: model.listShare, viewWidth: width),
                              let stop = model.dividerAt(start + drag.translation.width, widths: bounds, speed: Double(abs(drag.velocity.width)) / 1000) else { return }
                        if stop.snapped, !snapped { snaps += 1 }
                        snapped = stop.snapped
                        // The finger's width at once, no spring: the list and the calendar follow the finger.
                        var still = Transaction()
                        still.disablesAnimations = true
                        withTransaction(still) { model.listShare = model.listShare(of: CGFloat(stop.width), viewWidth: width) ?? model.listShare }
                    }
                    .onEnded { _ in
                        dragStart = nil
                        snapped = false
                    }
            )
            .sensoryFeedback(.selection, trigger: dragStart == nil)
            .sensoryFeedback(.impact(weight: .light), trigger: snaps)
            .accessibilityLabel("Divider")
            .accessibilityHint("Drag to make the list wider or narrower")
    }

    private var listWidth: CGFloat {
        model.listWidths(share: model.listShare, viewWidth: width).map { CGFloat($0.width) } ?? width / 2
    }
}

/// The Rows view's lists one under another, in the core's order: each as tall as the core shares the room
/// (`StackedRowsLayout`, `rules.stackedLists`), measured from the rows read (`ListMetrics`), never from what a list draws.
/// The stack ends above the tab bar's row; while a task is typed in a list the keyboard would cover, the stack rises just
/// enough to keep that list over the keyboard, its own height unchanged.
private struct StackedLists: View {
    let snapshot: BoardSnapshot
    let lists: [BoardColumn]
    @Bindable var model: BoardModel
    @State private var frames: [BoardColumn: CGRect] = [:]
    @State private var area: CGRect = .zero

    var body: some View {
        let measured = lists.map { model.metrics.lists[$0] ?? StackedList(wanted: Double(ListMetrics.head + CardMetrics.height), stops: []) }
        StackedRowsLayout(lists: measured, gap: ColumnMetrics.sectionGap, share: { [model] lists, room in MainActor.assumeIsolated { model.stackedHeights(lists, room: room) } }) {
            ForEach(lists, id: \.self) { column in
                Group {
                    if let list = snapshot.lists[column] {
                        ListColumn(list: list, model: model, compact: true).equatable()
                    } else {
                        Color.clear
                    }
                }
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { frames[column] = $0 }
            }
        }
        .coordinateSpace(.named(Self.space))
        .padding(.bottom, bottomRoom)
        .offset(y: -lift)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background { Color.clear.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { area = $0 } }
    }

    /// What of the stack's room the tab bar's row covers: the stack ends above it.
    private var bottomRoom: CGFloat {
        guard area.height > 0, model.barTop.isFinite else { return 0 }
        return max(0, area.maxY - model.barTop + ColumnMetrics.headGap)
    }

    /// How far the stack rises over the keyboard: the typed-in list's bottom brought to the keyboard's top, its top never
    /// above the stack's.
    private var lift: CGFloat {
        let top = KeyboardRise.shared.top
        guard top.isFinite, let typed = lists.first(where: { model.entry.lists[$0.rawValue] != nil }), let frame = frames[typed] else { return 0 }
        // The list where it stands unrisen, on the screen: the stack's frames are its own, never moved by the rise.
        let resting = frame.offsetBy(dx: 0, dy: area.minY)
        return max(0, min(resting.maxY - top, resting.minY - area.minY))
    }

    nonisolated private static let space = "stack"
}
