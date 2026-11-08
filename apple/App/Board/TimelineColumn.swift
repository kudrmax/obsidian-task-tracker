import Core
import SwiftUI

/// The calendar beside the day list, as the plugin's: the hours of the day from its start with finer marks as it zooms,
/// the events in their calendars' colours (grey once over), each with its title only, the tasks on a time as the same
/// capsules stacked by the core, and the red now line. A pinch zooms it, keeping the minute under the fingers in place.
struct TimelineColumn: View {
    let timeline: BoardTimeline
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?
    @State private var position = ScrollPosition(y: 0)
    @State private var opened = false
    /// The hour's height drawn now; nil until the column knows its height.
    @State private var hour: CGFloat?
    @State private var visible: CGFloat = 0
    @State private var pinch: Pinch?
    /// The hour heights a pinch moves between at this column's height, asked once per height.
    @State private var range: [Double] = []
    @State private var scroll = ScrollSpot()
    /// The column's width: another day slides through it.
    @State private var columnWidth: CGFloat = 0
    /// The zoom a pinch last settled on, kept on the device: `wholeDay`, or the hour's height.
    @AppStorage("timelineZoom") private var savedZoom: String = ""

    @Environment(\.colorScheme) private var scheme

    /// The plugin's measures of the timeline (`styles.css`, `.tc-hour-label`, `.tc-items`, `.tc-item`).
    private enum Measure {
        static let labelWidth: CGFloat = 22
        static let labelLift = TimelineGeometry.labelLift
        static let minorLift: CGFloat = 4
        static let lineLeft: CGFloat = 26
        static let itemsLeft = TimelineGeometry.itemsLeft
        static let itemsRight = TimelineGeometry.itemsRight
        static let itemInset: CGFloat = 1
        static let itemGap: CGFloat = 2
        static let nowHeight: CGFloat = 16
        static let nowWidth: CGFloat = 34
        static let allDayHeight: CGFloat = 22
        static let allDayGap: CGFloat = 4
        /// A selected card's dots (`--tc-grip`, `--tc-grip-start-right`, `--tc-grip-hit`).
        static let grip: CGFloat = 10
        static let gripInset: CGFloat = 14
        static let gripHit: CGFloat = 17
        static let grid = GridMeasures(divisions: [5, 15, 30], labelGap: 40, tickMinutes: 5, tickGap: 16)
    }

    private struct Pinch {
        let hour: CGFloat
        let minute: Double
        let screenY: CGFloat
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Measure.allDayGap) {
            DayLane(model: model, width: columnWidth, shown: allDay(timeline)) { peek in allDay(peek.timeline) }
                .clipped()
            GeometryReader { box in
                let hour = hour ?? CGFloat(timeline.zoomLevels.first ?? 56)
                ScrollView {
                    canvas(hour: hour, width: box.size.width)
                }
                .scrollPosition($position)
                .scrollIndicators(.hidden)
                .softEdges()
                .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { _, y in scroll.y = y }
                .onScrollGeometryChange(for: ScrollSpot.Reach.self) { ScrollSpot.Reach($0) } action: { _, reach in scroll.reach = reach }
                .onScrollGeometryChange(for: CGFloat.self) { $0.containerSize.height - $0.contentInsets.top - $0.contentInsets.bottom } action: { _, height in
                    visible = height
                    settleZoom()
                    open()
                    reveal(hour)
                }
                .onChange(of: model.entry.moved) { reveal(hour) }
                .onChange(of: model.found) { showFound(hour) }
                .onChange(of: model.dayMoved) {
                    opened = false
                    open()
                }
                .simultaneousGesture(zoom)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.dropping.move(Self.key, visible: $0) }
            }
        }
        .overlay(alignment: .leading) {
            Rectangle().fill(Color(.separator)).frame(width: 1).padding(.top, -8)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { columnWidth = $0 }
        .onAppear {
            model.registerCalendar()
            let spot = scroll, position = $position
            model.dropping.scrolls(Self.key) { dy in spot.scroll(by: dy) { position.wrappedValue.scrollTo(y: $0) } }
        }
        .onDisappear { model.dropping.remove(Self.key) }
    }

    private func canvas(hour: CGFloat, width: CGFloat) -> some View {
        let slots = model.stacked(timeline, hour: hour)
        let height = max(y(24 * 60, hour) + Measure.labelLift, slots.map { y(0, hour) + CGFloat($0.box.top + $0.box.height) }.max() ?? 0)
        return ZStack(alignment: .topLeading) {
            Color.clear
                .frame(width: width, height: height)
                .contentShape(.rect)
                .gesture(newSlot(hour: hour))
            grid(hour: hour)
            // The day itself, as the plugin's day layers: its events and cards slide within the items' place, its now
            // line within its own; the hours and the grid stand.
            DayLane(model: model, width: width, shown: ZStack(alignment: .topLeading) {
                events(timeline, hour: hour)
                ForEach(slots.filter { $0.card.item.id != model.entry.state?.renaming?.id }) { slot in
                    let stretched = model.stretched.flatMap { $0.id == slot.id ? $0 : nil }
                    let top = stretched.map { y($0.start, hour) + Measure.itemInset } ?? y(0, hour) + CGFloat(slot.box.top)
                    let tall = stretched.map { max(CardMetrics.height, CGFloat($0.end - $0.start) / 60 * hour - Measure.itemGap) }
                    slotCard(slot, tall: tall)
                        .overlay { if model.selectedSlot == slot.id { grips(slot, hour: hour) } }
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { if model.selectedSlot == slot.id { model.selectedFrame = $0 } }
                        .padding(.leading, Measure.itemsLeft + CGFloat(slot.box.left))
                        .padding(.trailing, Measure.itemsRight + Measure.itemInset)
                        .offset(y: top)
                        .zIndex(model.selectedSlot == slot.id ? 1 : 0)
                }
            }) { peek in
                ZStack(alignment: .topLeading) {
                    events(peek.timeline, hour: hour)
                    ForEach(model.slidingSlots(peek.timeline, hour: hour)) { slot in
                        TaskCapsule(card: slot.card, height: CGFloat(slot.box.height))
                            .frame(height: max(CGFloat(slot.box.height), CardMetrics.height))
                            .padding(.leading, Measure.itemsLeft + CGFloat(slot.box.left))
                            .padding(.trailing, Measure.itemsRight + Measure.itemInset)
                            .offset(y: y(0, hour) + CGFloat(slot.box.top))
                    }
                }
            }
            .frame(width: width, height: height, alignment: .topLeading)
            .mask(alignment: .topLeading) { Rectangle().padding(.leading, Measure.itemsLeft) }
            DayLane(model: model, width: width, shown: nowLayer(timeline, hour: hour)) { peek in nowLayer(peek.timeline, hour: hour) }
                .frame(width: width, height: height, alignment: .topLeading)
                .clipped()
            // The quick entry's field at its time, a renamed card's over its own place.
            if let minute = model.entry.slotMinute {
                EntryCapsule(host: model.entry)
                    .padding(.leading, Measure.itemsLeft)
                    .padding(.trailing, Measure.itemsRight + Measure.itemInset)
                    .offset(y: y(minute, hour) + Measure.itemInset)
            }
            if let minute = model.landing { landingLine(minute, hour: hour) }
        }
        .frame(width: width, height: height, alignment: .topLeading)
        .coordinateSpace(.named(Self.canvasSpace))
        .onGeometryChange(for: CGPoint.self) { $0.frame(in: .global).origin } action: { model.dropping.move(Self.key, origin: $0) }
        .onChange(of: hour, initial: true) { model.calendarHour = hour }
        .onChange(of: width, initial: true) { model.calendarWidth = width }
    }

    private static let key = "timeline"

    private func allDay(_ timeline: BoardTimeline) -> some View {
        VStack(alignment: .leading, spacing: Measure.allDayGap) {
            ForEach(timeline.allDay) { event in
                EventMenu(event: event, model: model) { AllDayRow(event: event, paint: paint(event, of: timeline)) }
                    .padding(.leading, Measure.itemsLeft)
                    .padding(.trailing, Measure.itemsRight)
            }
        }
    }

    private func events(_ timeline: BoardTimeline, hour: CGFloat) -> some View {
        ForEach(timeline.events.sorted { $0.layer < $1.layer }) { event in
            let top = y(event.start, hour) + Measure.itemInset
            let length = CGFloat(event.end - event.start) / 60 * hour - Measure.itemGap
            EventMenu(event: event, model: model) { EventBlock(event: event, paint: paint(event, of: timeline), height: max(length, 1), contentTop: top) }
                .padding(.leading, Measure.itemsLeft + CGFloat(event.left))
                .padding(.trailing, Measure.itemsRight + Measure.itemInset)
                .offset(y: top)
        }
    }

    @ViewBuilder
    private func nowLayer(_ timeline: BoardTimeline, hour: CGFloat) -> some View {
        if let now = timeline.now { nowLine(now, hour: hour) } else { Color.clear.frame(height: 0) }
    }

    /// A long press on the empty calendar: the line follows the finger while held, and the field of a new task opens at
    /// its time when let go.
    private func newSlot(hour: CGFloat) -> CalendarPress {
        CalendarPress(
            moved: { y in model.pressCalendar(at: Double(max(0, y - Measure.labelLift) / hour * 60)) },
            ended: { done in if done { model.releaseCalendar() } else { model.cancelCalendarPress() } })
    }

    /// The field on the calendar stays in sight above the keyboard.
    private func reveal(_ hour: CGFloat) {
        guard let minute = model.entry.slotMinute, visible > 0 else { return }
        let top = y(minute, hour)
        let bottom = top + CardMetrics.height + 16
        if bottom > scroll.y + visible {
            withAnimation(.snappy) { position.scrollTo(y: bottom - visible) }
        } else if top < scroll.y {
            withAnimation(.snappy) { position.scrollTo(y: max(0, top - 16)) }
        }
    }

    /// The card the search led to is scrolled into sight, and nothing more, as the plugin's `FoundCard`.
    private func showFound(_ hour: CGFloat) {
        guard let found = model.found, visible > 0, let slot = model.stacked(timeline, hour: hour).first(where: { $0.id == found }) else { return }
        let top = y(0, hour) + CGFloat(slot.box.top)
        let bottom = top + max(CardMetrics.height, CGFloat(slot.box.height))
        if top < scroll.y {
            withAnimation(.snappy) { position.scrollTo(y: max(0, top - SoftEdges.fade)) }
        } else if bottom > scroll.y + visible {
            withAnimation(.snappy) { position.scrollTo(y: min(top - SoftEdges.fade, bottom - visible + SoftEdges.fade)) }
        }
    }

    // MARK: The grid

    private func grid(hour: CGFloat) -> some View {
        let nowY = timeline.now.map { y($0, hour) }
        let marks = model.gridMarks(hour: hour, measures: Measure.grid)
        return ZStack(alignment: .topLeading) {
            ForEach(marks, id: \.minute) { mark in
                let at = y(mark.minute, hour)
                line(Palette.minorLine(scheme), at: at)
                if let label = mark.label, !model.labelHides(at, now: nowY, lift: Measure.minorLift, pill: Measure.nowHeight) {
                    hourLabel(label, size: 7, leading: 8, color: Palette.minorLabel(scheme))
                        .offset(y: at - Measure.minorLift)
                }
            }
            ForEach(timeline.hours, id: \.minute) { mark in
                let at = y(mark.minute, hour)
                line(Palette.hourLine(scheme), at: at)
                if !model.labelHides(at, now: nowY, lift: Measure.labelLift, pill: Measure.nowHeight) {
                    hourLabel(mark.label, size: 11, leading: 14, color: Palette.muted)
                        .offset(y: at - Measure.labelLift)
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func line(_ color: Color, at y: CGFloat) -> some View {
        Rectangle().fill(color).frame(height: 1)
            .padding(.leading, Measure.lineLeft)
            .offset(y: y)
    }

    private func hourLabel(_ text: String, size: CGFloat, leading: CGFloat, color: Color) -> some View {
        Text(text)
            .font(.system(size: size))
            .monospacedDigit()
            .foregroundStyle(color)
            .frame(width: Measure.labelWidth, height: leading, alignment: .trailing)
    }

    // MARK: Blocks

    private func paint(_ event: BoardEvent, of timeline: BoardTimeline) -> EventPaint {
        let themed = event.event.past == true ? timeline.pastPaint : event.paint
        return scheme == .dark ? themed.dark : themed.light
    }

    @ViewBuilder
    private func slotCard(_ slot: BoardSlot, tall stretched: CGFloat? = nil) -> some View {
        let tall = stretched ?? CGFloat(slot.box.height)
        if model.selecting, !model.canPick("timeline") {
            TaskCapsule(card: slot.card, height: tall).opacity(0.5)
        } else {
            CardButton(
                card: slot.card,
                menu: { later in model.cardMenu(slot.card.item, from: "timeline", ask: { question = $0 }, later: later) },
                ringed: model.found == slot.id || model.selectedSlot == slot.id,
                height: tall,
                carried: model.isCarried(slot.card),
                onTouch: {
                    model.found = nil
                    model.select(slot)
                },
                onCarry: { model.startCarry(slot.card, from: "timeline", grab: $0) },
                onCancel: { model.cancelCarry() },
                onEnd: { model.carryEnded() },
                onLink: { model.openLink($0) },
                onProject: model.projectOpener(slot.card.item))
                .frame(height: max(tall, CardMetrics.height))
        }
    }

    /// The selected card's two dots, as the plugin's: the top one on its top edge near the right moves its start, the
    /// bottom one on its bottom edge near the left its end, a grid step at a time; let go, the core writes the new time.
    private func grips(_ slot: BoardSlot, hour: CGFloat) -> some View {
        ZStack {
            grip(slot, edge: "start", hour: hour)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.trailing, Measure.gripInset - Measure.gripHit)
                .offset(y: -Measure.gripHit)
            grip(slot, edge: "end", hour: hour)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                .padding(.leading, Measure.gripInset - Measure.gripHit)
                .offset(y: Measure.gripHit)
        }
    }

    private func grip(_ slot: BoardSlot, edge: String, hour: CGFloat) -> some View {
        Circle()
            .strokeBorder(Palette.accent(scheme), lineWidth: 2)
            .background(Circle().fill(Color(.systemBackground)))
            .frame(width: Measure.grip, height: Measure.grip)
            .frame(width: 2 * Measure.gripHit, height: 2 * Measure.gripHit)
            .contentShape(.rect)
            .gesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .named(Self.canvasSpace))
                    .onChanged { drag in
                        model.stretch(slot, edge: edge, minute: model.snap(minute(at: drag.location.y, hour), hourHeight: hour))
                    }
                    .onEnded { drag in
                        let at = model.snap(minute(at: drag.location.y, hour), hourHeight: hour)
                        let least = Double((CardMetrics.height + Measure.itemGap) / hour * 60)
                        Task { await model.endStretch(slot, edge: edge, minute: at, least: least) }
                    }
            )
            .accessibilityLabel(edge == "start" ? "Start" : "End")
    }

    private static let canvasSpace = "timelineCanvas"

    /// Where a carried card would land: the line at its start and the time in the accent, as Calendar draws a moved event.
    private func landingLine(_ minute: Int, hour: CGFloat) -> some View {
        HStack(spacing: 0) {
            Text(BoardTime.label(minute, hours: timeline.hours))
                .font(.system(size: 10, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(.white)
                .frame(width: Measure.nowWidth, height: Measure.nowHeight)
                .background(.tint, in: .capsule)
            Rectangle().fill(.tint).frame(height: 2)
        }
        .offset(y: y(minute, hour) - Measure.nowHeight / 2)
        .allowsHitTesting(false)
    }

    private func nowLine(_ minute: Int, hour: CGFloat) -> some View {
        HStack(spacing: 0) {
            Text(Date.now, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
                .font(.system(size: 10, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(.white)
                .frame(width: Measure.nowWidth, height: Measure.nowHeight)
                .background(Palette.now(scheme), in: .capsule)
            Rectangle().fill(Palette.now(scheme)).frame(height: 2)
        }
        .offset(y: y(minute, hour) - Measure.nowHeight / 2)
        .allowsHitTesting(false)
    }

    // MARK: Zoom

    private func y(_ minute: Int, _ hour: CGFloat) -> CGFloat { CGFloat(minute) / 60 * hour + Measure.labelLift }

    /// The minute of the day at `y` in the calendar's own height.
    private func minute(at y: CGFloat, _ hour: CGFloat) -> Double { Double(max(0, y - Measure.labelLift) / hour * 60) }

    /// The hour's height at which the whole day, from its first label to its last, fills the column.
    private var wholeDay: Double? { visible > 0 ? Double((visible - 2 * Measure.labelLift) / 24) : nil }

    private var saved: JSONValue {
        if savedZoom == "wholeDay" { return "wholeDay" }
        return Double(savedZoom).map(JSONValue.number) ?? .null
    }

    /// The zoom kept on the device, at this height of the screen: the whole day stays the whole day.
    private func settleZoom() {
        guard pinch == nil else { return }
        range = wholeDay.map { model.zoomRange(wholeDay: $0, levels: timeline.zoomLevels) } ?? []
        hour = CGFloat(model.zoomShown(saved: saved, wholeDay: wholeDay, levels: timeline.zoomLevels))
    }

    private var zoom: some Gesture {
        MagnifyGesture(minimumScaleDelta: 0.01)
            .onChanged { value in
                guard let shown = hour, let wholeDay else { return }
                // The gesture is the scroll view's: its points are on the screen, the minute under them in the content.
                let start = pinch ?? Pinch(hour: shown, minute: minute(at: value.startLocation.y + scroll.y, shown), screenY: value.startLocation.y)
                pinch = start
                let next = min(CGFloat(range.last ?? wholeDay), max(CGFloat(range.first ?? wholeDay), start.hour * value.magnification))
                var instant = Transaction()
                instant.disablesAnimations = true
                withTransaction(instant) {
                    hour = next
                    position.scrollTo(y: max(0, CGFloat(start.minute) / 60 * next + Measure.labelLift - start.screenY))
                }
            }
            .onEnded { _ in
                pinch = nil
                guard let shown = hour, let wholeDay else { return }
                let settled = model.zoomAfterPinch(hour: Double(shown), wholeDay: wholeDay, levels: timeline.zoomLevels)
                savedZoom = settled.map { String($0) } ?? "wholeDay"
                if settled == nil { hour = CGFloat(wholeDay) }
            }
    }

    /// The day opens where the core says: today on the now line at half the height, another day at its hour on top.
    private func open() {
        guard !opened, visible > 0, let hour else { return }
        opened = true
        let top = y(timeline.opening, hour) - (timeline.now != nil ? visible / 2 : 0)
        position.scrollTo(y: max(0, top))
    }
}

/// The timeline's measures a drop on it reads by (`styles.css`): the room over the first hour, the items' edges.
enum TimelineGeometry {
    static let labelLift: CGFloat = 7
    static let itemsLeft: CGFloat = 28
    static let itemsRight: CGFloat = 4
}

/// Where a column stands scrolled: read by a pinch as it starts and by a carry held at an edge, never drawn.
@Observable
final class ScrollSpot {
    @ObservationIgnored var y: CGFloat = 0
    @ObservationIgnored var reach = Reach()

    /// How far the content scrolls: where it stands and its furthest offset.
    struct Reach: Equatable {
        var offset: CGFloat = 0
        var most: CGFloat = 0

        init() {}

        init(_ geometry: ScrollGeometry) {
            offset = geometry.contentOffset.y
            most = max(0, geometry.contentSize.height + geometry.contentInsets.top + geometry.contentInsets.bottom - geometry.containerSize.height)
        }
    }

    /// Scrolled on by `dy` within the content, the room at its end (`trailing`) left out: false at an end.
    @MainActor
    func scroll(by dy: CGFloat, trailing: CGFloat = 0, to: (CGFloat) -> Void) -> Bool {
        let next = min(max(0, reach.offset + dy), max(0, reach.most - trailing))
        guard abs(next - reach.offset) >= 0.5 else { return false }
        reach.offset = next
        y = next
        to(next)
        return true
    }
}

/// A calendar's event, as the plugin draws it: a block in its calendar's colour over the ground with a bar on the left and
/// its title only; the title stays at the top of what shows of the block while the block is scrolled partly out of view.
struct EventBlock: View {
    let event: BoardEvent
    let paint: EventPaint
    let height: CGFloat
    /// Where the block stands in the calendar's content: with where it shows, how far the calendar is scrolled.
    var contentTop: CGFloat = 0

    /// Shorter than this, a block takes the small type and no padding over its title (`tinyItemHeight`).
    private static let tiny: CGFloat = 24
    private var isTiny: Bool { height < Self.tiny }
    private var titleHeight: CGFloat { isTiny ? max(height - 2, 10) : 15 }

    var body: some View {
        HStack(spacing: 0) {
            Rectangle().fill(Color(hex: paint.bar)).frame(width: 3)
            Text(event.event.title)
                .font(.system(size: isTiny ? 10 : 12, weight: .semibold))
                .lineLimit(1)
                .fixedSize()
                .frame(maxWidth: .infinity, minHeight: titleHeight, maxHeight: titleHeight, alignment: .leading)
                .mask(FadeEnd(width: 16))
                .foregroundStyle(Color(hex: paint.text))
                .padding(.horizontal, isTiny ? 5 : 6)
                .padding(.top, isTiny ? 0 : 4)
                .visualEffect { [height, titleHeight, isTiny, contentTop] content, geometry in
                    // The title keeps below the top edge and its fade, which grows with the scroll, so it never jumps.
                    let top = geometry.frame(in: .scrollView).minY
                    let fade = SoftEdge.top(at: contentTop - top)
                    // The padded title stands at the larger of where it rests and the fade's depth, its text 4 pt below,
                    // as the plugin's.
                    return content.offset(y: min(max(0, fade - top), max(0, height - titleHeight - (isTiny ? 0 : 8))))
                }
                .frame(maxHeight: .infinity, alignment: .top)
        }
        .frame(height: height)
        .background(Color(hex: paint.bg))
        .background(Color(.systemBackground))
        .clipShape(.rect(cornerRadius: 6))
        .accessibilityElement(children: .combine)
    }
}

/// A tap on an event opens its menu, as the plugin's: one row, Open in Calendar, Apple's Calendar at the event's start.
struct EventMenu<Block: View>: View {
    let event: BoardEvent
    let model: BoardModel
    @ViewBuilder let block: Block

    var body: some View {
        Menu {
            Button("Open in Calendar", systemImage: "calendar") { model.openInCalendar(event.event) }
        } label: {
            block
        }
        .buttonStyle(.plain)
        .menuStyle(.button)
        .accessibilityLabel(event.event.title)
    }
}

/// An event of the whole day over the hours: a row in its calendar's colour, its title in the middle of it.
struct AllDayRow: View {
    let event: BoardEvent
    let paint: EventPaint

    var body: some View {
        HStack(spacing: 0) {
            Rectangle().fill(Color(hex: paint.bar)).frame(width: 3)
            Text(event.event.title)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
                .fixedSize()
                .frame(maxWidth: .infinity, alignment: .leading)
                .mask(FadeEnd(width: 16))
                .foregroundStyle(Color(hex: paint.text))
                .padding(.horizontal, 6)
        }
        .frame(height: 22)
        .background(Color(hex: paint.bg))
        .clipShape(.rect(cornerRadius: 6))
    }
}

/// A mask that fades its content out over its last points, as the plugin's titles fade.
struct FadeEnd: View {
    let width: CGFloat

    var body: some View {
        HStack(spacing: 0) {
            Rectangle()
            LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing).frame(width: width)
        }
    }
}

/// A minute of the shown day as the timeline writes it: its hour as the core names it, and the minutes.
enum BoardTime {
    static func label(_ minute: Int, hours: [BoardHour]) -> String {
        "\(hours[safe: minute / 60]?.label ?? "--"):\(String(format: "%02d", minute % 60))"
    }
}

/// The system's long press (its delay, its slop that leaves a pan to the scroll view), reporting where the finger is in
/// the calendar's own space.
struct CalendarPress: UIGestureRecognizerRepresentable {
    let moved: (CGFloat) -> Void
    let ended: (Bool) -> Void

    func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
        let press = UILongPressGestureRecognizer()
        press.minimumPressDuration = CardMetrics.press
        return press
    }

    func updateUIGestureRecognizer(_ press: UILongPressGestureRecognizer, context: Context) {
        press.minimumPressDuration = CardMetrics.press
    }

    func handleUIGestureRecognizerAction(_ press: UILongPressGestureRecognizer, context: Context) {
        switch press.state {
        case .began, .changed:
            moved(context.converter.localLocation.y)
        case .ended:
            ended(true)
        case .cancelled, .failed:
            ended(false)
        default:
            break
        }
    }
}
