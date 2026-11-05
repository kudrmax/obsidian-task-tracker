import ActivityKit
import SwiftUI
import WidgetKit

@main
struct TaskCardWidgets: WidgetBundle {
    var body: some Widget {
        TaskCardWidget()
    }
}

/// The plugin's palette, its own on any wallpaper: dark, light, and the island, which is always dark.
struct Palette {
    let card: Color
    let button: Color
    let accent: Color
    /// The text on the accent.
    let onAccent: Color
    let text: Color
    let muted: Color

    static let dark = Palette(
        card: Color(red: 0x1C / 255, green: 0x1C / 255, blue: 0x1C / 255),
        button: Color(red: 0x2C / 255, green: 0x2C / 255, blue: 0x2E / 255),
        accent: Color(red: 0x95 / 255, green: 0x80 / 255, blue: 0xFF / 255),
        onAccent: .black,
        text: .white,
        muted: Color(red: 0xA1 / 255, green: 0xA1 / 255, blue: 0xA6 / 255))

    static let light = Palette(
        card: Color(red: 0xF2 / 255, green: 0xF2 / 255, blue: 0xF7 / 255),
        button: Color(red: 0xE3 / 255, green: 0xE3 / 255, blue: 0xE8 / 255),
        accent: Color(red: 0x6A / 255, green: 0x50 / 255, blue: 0xE0 / 255),
        onAccent: .white,
        text: .black,
        muted: Color(red: 0x5E / 255, green: 0x5E / 255, blue: 0x63 / 255))

    static func of(_ scheme: ColorScheme) -> Palette { scheme == .dark ? dark : light }
}

private enum Metrics {
    static let title = Font.system(size: 17, weight: .semibold)
    static let time = Font.system(size: 17).monospacedDigit()
    static let label = Font.system(size: 13, weight: .semibold)
    static let button = Font.system(size: 14, weight: .semibold)
    static let buttonHeight: CGFloat = 36
    static let gap: CGFloat = 6
}

struct TaskCardWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TaskCardAttributes.self) { context in
            LockScreenCard(task: context.attributes, confirming: context.state.confirming)
                .activityBackgroundTint(.clear)
                .widgetURL(TaskCardView.calendarLink(context.attributes.date))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    TaskCardView(task: context.attributes, confirming: context.state.confirming, palette: .dark)
                        .padding(.horizontal, 6)
                }
            } compactLeading: {
                HStack(spacing: 4) {
                    LogoCheck(color: Palette.dark.accent, size: 12)
                    Text(context.attributes.title).font(Metrics.button).lineLimit(1)
                }
                .frame(maxWidth: 84, alignment: .leading)
            } compactTrailing: {
                Elapsed(since: context.attributes.start)
                    .font(Metrics.button)
                    .foregroundStyle(Palette.dark.accent)
                    .frame(width: 56, alignment: .trailing)
            } minimal: {
                LogoCheck(color: Palette.dark.accent, size: 13)
            }
            .widgetURL(TaskCardView.calendarLink(context.attributes.date))
        }
    }
}

/// The card on the lock screen, in the phone's light or dark.
struct LockScreenCard: View {
    let task: TaskCardAttributes
    let confirming: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = Palette.of(scheme)
        TaskCardView(task: task, confirming: confirming, palette: palette)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(palette.card)
            .activitySystemActionForegroundColor(palette.text)
    }
}

/// The logo's checkmark: the card's mark by the camera.
struct LogoCheck: View {
    let color: Color
    let size: CGFloat

    var body: some View {
        Image(systemName: "checkmark").font(.system(size: size, weight: .heavy)).foregroundStyle(color)
    }
}

/// How long the task has been going: `+25:07`, ticking by itself. iOS keeps it as wide as its widest value and draws
/// nothing at all for a card that sizes it to fit (`fixedSize`): give it a frame instead.
struct Elapsed: View {
    let since: Date

    var body: some View {
        (Text("+") + Text(since, style: .timer))
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
    }
}

/// The card: the task, its time and how long it has been going, then the notification's buttons; after Done, the question.
struct TaskCardView: View {
    let task: TaskCardAttributes
    let confirming: Bool
    let palette: Palette

    static func calendarLink(_ date: String) -> URL? {
        var link = URLComponents(string: "obsidian://task-calendar-open")
        link?.queryItems = [URLQueryItem(name: "date", value: date)]
        return link?.url
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if confirming {
                question
            } else {
                header
                buttons
            }
        }
    }

    /// With a meeting button below, the title keeps to one line so the card stays within iOS's height.
    @ViewBuilder private var header: some View {
        if task.meeting == nil {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(task.title).font(Metrics.title).foregroundStyle(palette.text).lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(task.time).foregroundStyle(palette.text)
                    Elapsed(since: task.start).foregroundStyle(palette.muted)
                }
                .font(Metrics.time)
                .frame(width: 76, alignment: .trailing)
            }
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(task.title).font(Metrics.title).foregroundStyle(palette.text).lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                // One text: the room iOS keeps for the ticking timer stays on its left, next to the title, never between the two.
                (Text(task.time).foregroundColor(palette.text) + Text("  +").foregroundColor(palette.muted) + Text(task.start, style: .timer).foregroundColor(palette.muted))
                    .font(Metrics.time)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 150, alignment: .trailing)
            }
        }
    }

    private var buttons: some View {
        VStack(spacing: Metrics.gap) {
            HStack(spacing: Metrics.gap) {
                ForEach(ReminderButton.all, id: \.self) { button($0) }
            }
            if let meeting = task.meeting {
                Button(intent: CardAfterMeetingIntent(reminderID: task.reminderID, title: task.title, date: task.date, until: meeting.until)) {
                    pill(fill: palette.button) {
                        HStack(spacing: 8) {
                            Image(systemName: "calendar.badge.clock")
                            Text("After \(meeting.name)").lineLimit(1)
                            Text(meeting.left).foregroundStyle(palette.muted).fixedSize()
                        }
                        .foregroundStyle(palette.text)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private func button(_ button: ReminderButton) -> some View {
        switch button {
        case .done:
            Button(intent: CardDoneIntent(reminderID: task.reminderID)) {
                pill(fill: palette.accent) {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark").font(.system(size: 12, weight: .bold))
                        Text(button.title)
                    }
                    .foregroundStyle(palette.onAccent)
                }
            }
            .buttonStyle(.plain)
        case .snooze(let minutes):
            Button(intent: CardSnoozeIntent(reminderID: task.reminderID, title: task.title, date: task.date, minutes: minutes)) {
                pill(fill: palette.button) { Text(button.title).foregroundStyle(palette.text) }
            }
            .buttonStyle(.plain)
        }
    }

    /// Done asks first. Cancel stands where Done was, so another press by chance lands on Cancel.
    private var question: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Complete task?").font(Metrics.label).foregroundStyle(palette.muted)
                Text(task.title).font(Metrics.title).foregroundStyle(palette.text).lineLimit(2)
            }
            HStack(spacing: Metrics.gap) {
                Button(intent: CardCancelIntent(reminderID: task.reminderID)) {
                    pill(fill: palette.button) { Text("Cancel").foregroundStyle(palette.text) }
                }
                .buttonStyle(.plain)
                Button(intent: CardCompleteIntent(reminderID: task.reminderID, title: task.title, date: task.date)) {
                    pill(fill: palette.accent) {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark").font(.system(size: 12, weight: .bold))
                            Text("Complete")
                        }
                        .foregroundStyle(palette.onAccent)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func pill(fill: Color, @ViewBuilder _ label: () -> some View) -> some View {
        label()
            .font(Metrics.button)
            .frame(maxWidth: .infinity, minHeight: Metrics.buttonHeight)
            .background(Capsule().fill(fill))
    }
}
