import Core
import SwiftUI
import UIKit

/// The Rows view (board `projects-one-view/T3`): Inbox, Backlog, Soon and the day's list stacked on the left, each under
/// its small heading, the calendar on the right behind the divider, which sets the list's width as at Today. The day
/// turns by the arrows over the calendar.
struct RowsView: View {
    let snapshot: BoardSnapshot
    @Bindable var model: BoardModel

    var body: some View {
        SplitWithCalendar(snapshot: snapshot, model: model) {
            StackedLists(snapshot: snapshot, model: model)
        }
    }
}

/// The By project view (board `T7`): the filter's node's tasks in its subprojects' parts on the left, the calendar on
/// the right behind the divider.
struct ByProjectView: View {
    let snapshot: BoardSnapshot
    @Bindable var model: BoardModel

    var body: some View {
        SplitWithCalendar(snapshot: snapshot, model: model) {
            ProjectTasks(model: model)
                .frame(maxHeight: .infinity, alignment: .top)
        }
        .task(id: ReadKey(file: snapshot.tasksText, node: snapshot.filter)) { await model.projects.read() }
    }

    private struct ReadKey: Equatable {
        let file: String?
        let node: String?
    }
}

/// A list beside the calendar, the divider between them: the list's width is the day list's at Today, its handle drags
/// it as there.
private struct SplitWithCalendar<Lists: View>: View {
    let snapshot: BoardSnapshot
    @Bindable var model: BoardModel
    @ViewBuilder let lists: () -> Lists
    @AppStorage("listShare") private var listShare: Double = 0.5

    var body: some View {
        GeometryReader { box in
            let width = box.size.width
            let list = model.listWidths(share: listShare, viewWidth: width).map { CGFloat($0.width) } ?? width / 2
            HStack(alignment: .top, spacing: 0) {
                lists()
                    .frame(width: list)
                    .frame(maxHeight: .infinity, alignment: .top)
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
            .overlay(alignment: .leading) { ListDivider(model: model, width: width, share: $listShare).offset(x: list) }
        }
    }
}

/// The handle on the line between the list and the calendar: dragged, the list grows or narrows within the core's
/// bounds, holding to the middle as the core says (`rules.dividerAt`), a tap felt each time it holds.
struct ListDivider: View {
    let model: BoardModel
    let width: CGFloat
    @Binding var share: Double
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
                        guard let bounds = model.listWidths(share: share, viewWidth: width),
                              let stop = model.dividerAt(start + drag.translation.width, widths: bounds, speed: Double(abs(drag.velocity.width)) / 1000) else { return }
                        if stop.snapped, !snapped { snaps += 1 }
                        snapped = stop.snapped
                        share = model.listShare(of: CGFloat(stop.width), viewWidth: width) ?? share
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
        model.listWidths(share: share, viewWidth: width).map { CGFloat($0.width) } ?? width / 2
    }
}

/// The Rows view's lists one under another, in the core's order (`ViewChoice.rows`): each as tall as its rows while they
/// all fit, the long ones sharing the rest and scrolling within it (`rules.stackedRows`).
private struct StackedLists: View {
    let snapshot: BoardSnapshot
    @Bindable var model: BoardModel

    var body: some View {
        let columns = snapshot.funnel.view.rows.compactMap(BoardColumn.init(rawValue:))
        GeometryReader { box in
            let head = ColumnMetrics.groupHead + ColumnMetrics.headGap
            // While the plus is carried or a task is typed each list keeps a card's room more: the plus's room and the
            // field at a list's end stand inside it, never past its edge where the list would have to scroll to them.
            let typing = model.entry.isOpen || model.carried == Carried.plus ? CardMetrics.height + CardMetrics.gap : 0
            let wanted = columns.map { Double(head + (model.listRows[$0] ?? CardMetrics.height) + typing) }
            let gaps = ColumnMetrics.sectionGap * CGFloat(max(0, columns.count - 1))
            let heights: [Double] = model.ruleNow("rules.stackedRows", [.array(wanted.map(JSONValue.number)), .number(Double(box.size.height - gaps)), .number(Double(head + CardMetrics.height))]) ?? wanted
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(columns.enumerated()), id: \.element) { index, column in
                    if let list = snapshot.lists[column] {
                        ListColumn(list: list, model: model, compact: true)
                            .equatable()
                            .frame(height: CGFloat(heights[safe: index] ?? 0), alignment: .top)
                            .padding(.top, index == 0 ? 0 : ColumnMetrics.sectionGap)
                    }
                }
            }
            .animation(.snappy, value: heights)
        }
    }
}
