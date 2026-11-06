import ActivityKit
import SwiftUI
import WidgetKit

@main
struct TaskCardWidgets: WidgetBundle {
    var body: some Widget {
        TaskCardWidget()
        NewTaskControl()
        VoiceTaskControl()
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
                Text(context.attributes.start, style: .time).font(Metrics.button).monospacedDigit().foregroundStyle(Palette.dark.accent)
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

/// The card: the task and its time, then the notification's buttons; after Done, Cancel and Complete in their row.
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
            header
            buttons
        }
    }

    /// The title runs up to the time and ends there in an ellipsis; with a meeting button below it keeps to one line, so
    /// the card stays within iOS's height.
    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(task.title).font(Metrics.title).foregroundStyle(palette.text).lineLimit(task.meeting == nil ? 2 : 1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            Text(task.time).font(Metrics.time).foregroundStyle(palette.muted).fixedSize()
        }
    }

    private var buttons: some View {
        VStack(spacing: Metrics.gap) {
            // Done asks in place: its row turns into Cancel, where Done was, and Complete. The change comes from the app a
            // moment after the press, so a quick crossfade of the row alone hides the wait; a swap at once only shows it.
            Group {
                if confirming {
                    confirmRow.transition(.opacity)
                } else {
                    HStack(spacing: Metrics.gap) {
                        ForEach(ReminderButton.all, id: \.self) { button($0) }
                    }
                    .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: confirming)
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

    /// Cancel stands where Done was, so another press by chance lands on Cancel.
    private var confirmRow: some View {
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

    private func pill(fill: Color, @ViewBuilder _ label: () -> some View) -> some View {
        label()
            .font(Metrics.button)
            .frame(maxWidth: .infinity, minHeight: Metrics.buttonHeight)
            .background(Capsule().fill(fill))
    }
}
