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

    @Environment(\.colorScheme) private var scheme

    private let hour = CardMetrics.hour
    private let labelWidth: CGFloat = 26
    private let itemsLeft: CGFloat = 32
    private let overlayInset: CGFloat = 18

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
                                .padding(.leading, itemsLeft + CGFloat(event.level) * overlayInset)
                                .padding(.trailing, 8)
                                .offset(y: y(event.start) + 1)
                        }
                        ForEach(timeline.slots) { slot in
                            slotCard(slot)
                                .padding(.leading, itemsLeft)
                                .padding(.trailing, 8)
                                .offset(y: y(slot.start) + 1)
                        }
                        if let now = timeline.now { nowLine(now) }
                    }
                    .frame(width: box.size.width, height: y(24 * 60), alignment: .topLeading)
                    .contentShape(.rect)
                    .dropDestination(for: DraggedTask.self) { dropped, at in
                        guard let id = dropped.first?.id else { return false }
                        Task { await model.drop(id, atMinute: Double(at.y / hour * 60), hourHeight: hour) }
                        return true
                    }
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
        let tall = slot.end.map { max(CardMetrics.height, height(slot.start, $0)) } ?? CardMetrics.height
        if let menu = model.snapshot?.menus[slot.id], !model.selecting {
            Menu {
                TaskMenuContent(items: [slot.card.item], menu: menu, model: model, question: $question)
            } label: {
                TaskCapsule(card: slot.card, ringed: model.found == slot.id, height: tall)
            }
            .buttonStyle(.plain)
            .draggable(DraggedTask(id: slot.id)) { TaskCapsule(card: slot.card).frame(width: 160) }
        } else {
            TaskCapsule(card: slot.card, height: tall)
        }
    }

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
