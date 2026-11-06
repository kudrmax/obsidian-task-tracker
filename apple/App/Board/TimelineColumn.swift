import Core
import SwiftUI

/// The calendar beside the day list, as the plugin's: the hours of the day from its start, the events in their calendars'
/// colours (past ones paler), the tasks on a time as the same capsules, and the red now line.
struct TimelineColumn: View {
    let timeline: BoardTimeline
    @Bindable var model: BoardModel
    @Binding var question: MenuQuestion?
    @State private var position = ScrollPosition(y: 0)
    @State private var opened: String?
    /// The minute a carried card would start at, shown as a line while it is held over the calendar.
    @State private var landing: Int?
    /// The last minute the line stood at: SwiftUI ends the hover before the drop, and the drop writes what was shown.
    @State private var last = LastMinute()

    @Environment(\.colorScheme) private var scheme

    private let hour = CardMetrics.hour
    private let labelWidth: CGFloat = 26
    /// Where the items area starts, right of the hours: blocks stand in it by the core's insets.
    private let itemsLeft: CGFloat = 31

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(timeline.allDay) { event in
                EventBlock(event: event, height: 24, showsTime: false)
                    .padding(.horizontal, 8)
            }
            GeometryReader { box in
                ScrollView {
                    ZStack(alignment: .topLeading) {
                        grid
                        ForEach(timeline.events.sorted { $0.layer < $1.layer }) { event in
                            EventBlock(event: event, height: height(event.start, event.end), showsTime: height(event.start, event.end) >= 36)
                                .padding(.leading, itemsLeft + CGFloat(event.left))
                                .padding(.trailing, 8)
                                .offset(y: y(event.start) + 1)
                        }
                        ForEach(timeline.slots) { slot in
                            slotCard(slot)
                                .padding(.leading, itemsLeft + CGFloat(slot.box.left))
                                .padding(.trailing, 8)
                                .offset(y: y(0) + CGFloat(slot.box.top))
                        }
                        if let now = timeline.now { nowLine(now) }
                        if let minute = landing { landingLine(minute) }
                    }
                    .frame(width: box.size.width, height: y(24 * 60), alignment: .topLeading)
                    .contentShape(.rect)
                    .onDrop(of: [.plainText], delegate: TimeLanding(model: model, minute: $landing, last: last, minuteAt: minute(at:)))
                }
                .scrollPosition($position)
                .scrollIndicators(.hidden)
                .onAppear { open(visible: box.size.height) }
                .onChange(of: model.snapshot?.day) { open(visible: box.size.height) }
            }
        }
        .overlay(alignment: .leading) {
            Rectangle().fill(Color(.separator)).frame(width: 1).padding(.top, -8)
        }
    }

    private var grid: some View {
        ForEach(timeline.hours, id: \.minute) { mark in
            HStack(alignment: .center, spacing: 4) {
                Text(mark.label)
                    .font(.system(size: 11))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .frame(width: labelWidth - 4, alignment: .trailing)
                Rectangle().fill(Color(.separator).opacity(0.6)).frame(height: 1)
            }
            .frame(height: 14)
            .offset(y: y(mark.minute) - 7)
        }
    }

    @ViewBuilder
    private func slotCard(_ slot: BoardSlot) -> some View {
        let tall = CGFloat(slot.box.height)
        if model.selecting {
            TaskCapsule(card: slot.card, height: tall, over: slot.box.overlay).opacity(0.5)
        } else {
            CardButton(
                card: slot.card,
                menu: { model.cardMenu(slot.card.item) { question = $0 } },
                ringed: model.found == slot.id,
                height: tall,
                over: slot.box.overlay,
                onTouch: { model.found = nil },
                onCarry: { model.carrying = $0 })
                .frame(height: tall)
                .overlay { if model.carrying { Color.clear.contentShape(.rect) } }
        }
    }

    /// Where a carried card would land: the line at its start and the time in the accent, as Calendar draws a moved event.
    private func landingLine(_ minute: Int) -> some View {
        HStack(spacing: 2) {
            Text(BoardTime.label(minute, hours: timeline.hours))
                .font(.system(size: 10, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(.white)
                .padding(.horizontal, 4)
                .frame(height: 17)
                .background(.tint, in: .capsule)
            Rectangle().fill(.tint).frame(height: 2)
        }
        .offset(y: y(minute) - 8.5)
        .allowsHitTesting(false)
        .transition(.opacity)
    }

    /// The minute of the day at `y` in the calendar's own height.
    private func minute(at y: CGFloat) -> Double { Double(max(0, y - self.y(0)) / hour * 60) }

    private func nowLine(_ minute: Int) -> some View {
        ZStack(alignment: .leading) {
            Rectangle().fill(Color(.systemRed)).frame(height: 2).padding(.leading, labelWidth)
            Text(Date.now, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
                .font(.system(size: 10, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(.white)
                .padding(.horizontal, 4)
                .frame(height: 17)
                .background(Color(.systemRed), in: .capsule)
                .padding(.leading, 1)
        }
        .offset(y: y(minute) - 8.5)
        .allowsHitTesting(false)
    }

    private func y(_ minute: Int) -> CGFloat { CGFloat(minute) / 60 * hour + 7 }
    private func height(_ start: Int, _ end: Int) -> CGFloat { max(18, CGFloat(end - start) / 60 * hour - 2) }

    /// The day opens where the core says: today on the now line at half the height, another day at its hour on top.
    private func open(visible: CGFloat) {
        guard let day = model.snapshot?.day, opened != day else { return }
        opened = day
        let top = y(timeline.opening) - (timeline.now != nil ? visible / 2 : 0)
        position.scrollTo(y: max(0, top))
    }
}

/// A calendar's event: a tinted block with a bar in the calendar's colour, its title and, when it has room, its time.
struct EventBlock: View {
    let event: BoardEvent
    let height: CGFloat
    let showsTime: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let paint = scheme == .dark ? event.paint.dark : event.paint.light
        VStack(alignment: .leading, spacing: 0) {
            Text(event.event.title).font(.system(size: 12, weight: .semibold)).lineLimit(1)
            if showsTime {
                Text(start ..< end, format: .interval.hour().minute()).font(.system(size: 11)).lineLimit(1)
            }
        }
        .foregroundStyle(Color(hex: paint.text))
        .padding(.leading, 9)
        .padding(.trailing, 6)
        .padding(.top, showsTime ? 4 : 1)
        .frame(maxWidth: .infinity, minHeight: height, maxHeight: height, alignment: .topLeading)
        .background(alignment: .leading) { Rectangle().fill(Color(hex: paint.bar)).frame(width: 3) }
        .background(Color(hex: paint.bg))
        .clipShape(.rect(cornerRadius: 7))
        .opacity(event.event.past == true ? 0.5 : 1)
    }

    private var start: Date { Date(timeIntervalSince1970: event.event.startMs / 1000) }
    private var end: Date { Date(timeIntervalSince1970: max(event.event.endMs, event.event.startMs) / 1000) }
}

/// The calendar taking a carried card or the plus: the line follows the finger on the grid's steps, and letting go drops
/// it at that time.
final class LastMinute {
    var minute: Int?
}

private struct TimeLanding: DropDelegate {
    let model: BoardModel
    @Binding var minute: Int?
    let last: LastMinute
    let minuteAt: (CGFloat) -> Double

    func dropUpdated(info: DropInfo) -> DropProposal? {
        let snapped = model.snap(minuteAt(info.location.y), hourHeight: CardMetrics.hour)
        last.minute = snapped
        if snapped != minute {
            if minute != nil { UISelectionFeedbackGenerator().selectionChanged() }
            withAnimation(.snappy(duration: 0.15)) { minute = snapped }
        }
        return DropProposal(operation: .move)
    }

    func dropExited(info: DropInfo) {
        withAnimation(.snappy(duration: 0.15)) { minute = nil }
    }

    func performDrop(info: DropInfo) -> Bool {
        // The time written is the one the line showed.
        let at = (minute ?? last.minute).map(Double.init) ?? minuteAt(info.location.y)
        minute = nil
        last.minute = nil
        guard let provider = info.itemProviders(for: [.plainText]).first else { return false }
        _ = provider.loadObject(ofClass: NSString.self) { object, _ in
            guard let id = object as? String else { return }
            Task { @MainActor in await model.drop(id, atMinute: at, hourHeight: CardMetrics.hour) }
        }
        return true
    }
}

/// A minute of the shown day as the timeline writes it: its hour as the core names it, and the minutes.
enum BoardTime {
    static func label(_ minute: Int, hours: [BoardHour]) -> String {
        "\(hours[safe: minute / 60]?.label ?? "--"):\(String(format: "%02d", minute % 60))"
    }
}
