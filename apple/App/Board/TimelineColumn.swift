import Core
import SwiftUI

/// The calendar beside the day list, as the plugin's: the hours of the day from its start with finer marks as it zooms,
/// the events in their calendars' colours (grey once over), each with its title only, the tasks on a time as the same
/// capsules stacked by the core, and the red now line. A pinch zooms it, keeping the minute under the fingers in place.
struct TimelineColumn: View {
    let timeline: BoardTimeline
    @Bindable var model: BoardModel
    @State private var position: ScrollPosition
    @State private var opened: Bool
    @State private var pinch: Pinch?
    /// A pinch ended before the content took the height of its last zoom: its minute is held until it has.
    @State private var held: Pinch?
    @State private var scroll = ScrollSpot()
    /// The zoom and the column's height, the screen's: a new day's timeline opens at the zoom the last one showed.
    private var zoom: TimelineZoom { model.zoom }
    private var hour: CGFloat? { zoom.hour }
    private var visible: CGFloat { zoom.visible }
    private var range: [Double] { zoom.range }

    init(timeline: BoardTimeline, model: BoardModel) {
        self.timeline = timeline
        self.model = model
        // A day slid in opens where the core says from its first frame, at the zoom shown: no frame at the top first.
        let top = model.zoom.openingTop(timeline)
        _position = State(initialValue: ScrollPosition(y: top ?? 0))
        _opened = State(initialValue: top != nil)
    }
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
        static let grid = GridMeasures(divisions: [5, 15, 30], labelGap: 40, tickMinutes: 5, tickGap: 16)
    }

    private struct Pinch {
        let hour: CGFloat
        let minute: Double
        let screenY: CGFloat
    }

    /// The minute the pinch started under stays under the fingers at the hour's height drawn now; a pinch that has
    /// ended lets go of it once the content is as tall as its zoom.
    private func holdPinchedMinute() {
        guard let anchor = pinch ?? held, let hour else { return }
        let target = max(0, CGFloat(anchor.minute) / 60 * hour + Measure.labelLift - anchor.screenY)
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) { position.scrollTo(y: target) }
        // Scrolled while the content changes height, the scroll view reports an offset from before the change and never
        // the one it draws: the next pinch starts from where this one put the content.
        scroll.y = min(target, max(0, scroll.contentHeight - visible))
        if pinch == nil, isTall(at: hour) { held = nil }
    }

    /// The content has the height of the day at `hour`.
    private func isTall(at hour: CGFloat) -> Bool { scroll.contentHeight >= y(24 * 60, hour) + Measure.labelLift - 0.5 }

    var body: some View {
        VStack(alignment: .leading, spacing: Measure.allDayGap) {
            ForEach(timeline.allDay) { event in
                AllDayRow(event: event, paint: paint(event))
                    .padding(.leading, Measure.itemsLeft)
                    .padding(.trailing, Measure.itemsRight)
            }
            GeometryReader { box in
                let hour = hour ?? CGFloat(timeline.zoomLevels.first ?? 56)
                ScrollView {
                    canvas(hour: hour, width: box.size.width)
                }
                .scrollPosition($position)
                .scrollIndicators(.hidden)
                .softEdges()
                .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { _, y in scroll.y = y }
                .onScrollGeometryChange(for: CGFloat.self) { $0.containerSize.height - $0.contentInsets.top - $0.contentInsets.bottom } action: { _, height in
                    zoom.visible = height
                    settleZoom()
                    open()
                    reveal(hour)
                }
                // A pinch's scroll is set once the content has its new height: never cut short by the old one.
                .onScrollGeometryChange(for: CGFloat.self) { $0.contentSize.height } action: { _, height in
                    scroll.contentHeight = height
                    holdPinchedMinute()
                }
                .onChange(of: model.entry.moved) { reveal(hour) }
                .simultaneousGesture(pinchGesture)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.dropping.move(Self.key, visible: $0) }
            }
        }
        .overlay(alignment: .leading) {
            Rectangle().fill(Color(.separator)).frame(width: 1).padding(.top, -8)
        }
        .onAppear { model.registerCalendar() }
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
            ForEach(timeline.events.sorted { $0.layer < $1.layer }) { event in
                let top = y(event.start, hour) + Measure.itemInset
                let length = CGFloat(event.end - event.start) / 60 * hour - Measure.itemGap
                EventBlock(event: event, paint: paint(event), height: max(length, 1), contentTop: top)
                    .padding(.leading, Measure.itemsLeft + CGFloat(event.left))
                    .padding(.trailing, Measure.itemsRight + Measure.itemInset)
                    .offset(y: top)
            }
            ForEach(slots.filter { $0.card.item.id != model.entry.state?.renaming?.id }) { slot in
                slotCard(slot)
                    .padding(.leading, Measure.itemsLeft + CGFloat(slot.box.left))
                    .padding(.trailing, Measure.itemsRight + Measure.itemInset)
                    .offset(y: y(0, hour) + CGFloat(slot.box.top))
            }
            if let now = timeline.now { nowLine(now, hour: hour) }
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
        .onGeometryChange(for: CGPoint.self) { $0.frame(in: .global).origin } action: { model.dropping.move(Self.key, origin: $0) }
        .onChange(of: hour, initial: true) { model.calendarHour = hour }
        .onChange(of: width, initial: true) { model.calendarWidth = width }
    }

    private static let key = "timeline"

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

    private func paint(_ event: BoardEvent) -> EventPaint {
        let themed = event.event.past == true ? timeline.pastPaint : event.paint
        return scheme == .dark ? themed.dark : themed.light
    }

    private func slotCard(_ slot: BoardSlot) -> some View {
        let tall = CGFloat(slot.box.height)
        let selecting = model.selecting
        // One card in and out of Select Tasks: the calendar's cannot be picked, so they dim and take no touch.
        return CardButton(
            card: slot.card,
            renamedText: model.entry.renamedTexts[slot.card.id],
            menu: { later in selecting ? nil : model.cardMenu(slot.card.item, later: later) },
            ringed: model.found == slot.id,
            height: tall,
            draggable: !selecting,
            carried: model.isHidden(slot.card),
            arrival: model.arrival?.id == slot.id ? model.arrival?.from : nil,
            onTouch: { model.found = nil },
            onCarry: { model.startCarry(slot.card, from: "timeline", grab: $0) },
            onCancel: { model.cancelCarry() },
            onEnd: { model.carryEnded() },
            onDropped: { model.carryDropped() })
            .frame(height: max(tall, CardMetrics.height))
            .opacity(selecting ? 0.5 : 1)
            .allowsHitTesting(!selecting)
    }

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
        zoom.range = wholeDay.map { model.zoomRange(wholeDay: $0, levels: timeline.zoomLevels) } ?? []
        let shown = CGFloat(model.zoomShown(saved: saved, wholeDay: wholeDay, levels: timeline.zoomLevels))
        if zoom.hour != shown { zoom.hour = shown }
    }

    private var pinchGesture: some Gesture {
        MagnifyGesture(minimumScaleDelta: 0.01)
            .onChanged { value in
                guard let shown = hour, let wholeDay else { return }
                // The gesture is the scroll view's: its points are on the screen, the minute under them in the content.
                let start = pinch ?? Pinch(hour: shown, minute: minute(at: value.startLocation.y + scroll.y, shown), screenY: value.startLocation.y)
                pinch = start
                let next = min(CGFloat(range.last ?? wholeDay), max(CGFloat(range.first ?? wholeDay), start.hour * value.magnification))
                var instant = Transaction()
                instant.disablesAnimations = true
                withTransaction(instant) { zoom.hour = next }
                holdPinchedMinute()
            }
            .onEnded { _ in
                let ended = pinch
                pinch = nil
                guard let shown = hour, let wholeDay else { return }
                let settled = model.zoomAfterPinch(hour: Double(shown), wholeDay: wholeDay, levels: timeline.zoomLevels)
                savedZoom = settled.map { String($0) } ?? "wholeDay"
                // The zoom the core settles on is drawn now, with the minute still under the fingers; the last step's
                // scroll, cut short by the content's old height, is set again once the content has the new one.
                held = ended
                let next = CGFloat(settled ?? wholeDay)
                if next != shown {
                    var instant = Transaction()
                    instant.disablesAnimations = true
                    withTransaction(instant) { zoom.hour = next }
                }
                holdPinchedMinute()
            }
    }

    /// The day opens where the core says: today on the now line at half the height, another day at its hour on top.
    private func open() {
        guard !opened, let top = zoom.openingTop(timeline) else { return }
        opened = true
        position.scrollTo(y: top)
    }
}

/// The timeline's zoom and height, kept by the screen across days: a day turned keeps the zoom, its timeline drawn anew.
@MainActor
@Observable
final class TimelineZoom {
    /// The hour's height drawn now; nil until the column knows its height.
    var hour: CGFloat?
    /// The column's height that shows.
    var visible: CGFloat = 0
    /// The hour heights a pinch moves between at this height, asked once per height.
    var range: [Double] = []

    /// Where a day's timeline opens (`days.openAt`): today on the now line at half the height, another day at its hour
    /// on top; nil until the column's height and zoom are known.
    func openingTop(_ timeline: BoardTimeline) -> CGFloat? {
        guard visible > 0, let hour else { return nil }
        let top = CGFloat(timeline.opening) / 60 * hour + TimelineGeometry.labelLift - (timeline.now != nil ? visible / 2 : 0)
        return max(0, top)
    }
}

/// The timeline's measures a drop on it reads by (`styles.css`): the room over the first hour, the items' edges.
enum TimelineGeometry {
    static let labelLift: CGFloat = 7
    static let itemsLeft: CGFloat = 28
    static let itemsRight: CGFloat = 4
}

/// Where the timeline stands scrolled: read by a pinch as it starts, never drawn.
@Observable
final class ScrollSpot {
    @ObservationIgnored var y: CGFloat = 0
    @ObservationIgnored var contentHeight: CGFloat = 0
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
        press.minimumPressDuration = 0.25
        return press
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
