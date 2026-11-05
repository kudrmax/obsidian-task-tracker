import ActivityKit
import SwiftUI
import WidgetKit

@main
struct TaskCardWidgets: WidgetBundle {
    var body: some Widget {
        TaskCardWidget()
    }
}

/// The plugin's dark palette: the card stays flat and its own on any wallpaper.
private enum Palette {
    static let card = Color(red: 0x1C / 255, green: 0x1C / 255, blue: 0x1C / 255)
    static let button = Color(red: 0x2C / 255, green: 0x2C / 255, blue: 0x2E / 255)
    static let accent = Color(red: 0x95 / 255, green: 0x80 / 255, blue: 0xFF / 255)
    static let muted = Color(red: 0x8E / 255, green: 0x8E / 255, blue: 0x93 / 255)
}

struct TaskCardWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TaskCardAttributes.self) { context in
            TaskCardView(task: context.attributes)
                .activityBackgroundTint(Palette.card)
                .activitySystemActionForegroundColor(.white)
                .widgetURL(TaskCardView.calendarLink(context.attributes.date))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "pin.fill").foregroundStyle(Palette.accent)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.title).font(.headline).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.attributes.time).font(.subheadline).monospacedDigit().foregroundStyle(Palette.muted)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    TaskCardButtons(task: context.attributes)
                }
            } compactLeading: {
                Image(systemName: "pin.fill").foregroundStyle(Palette.accent)
            } compactTrailing: {
                Text(context.attributes.start, style: .time).monospacedDigit()
            } minimal: {
                Image(systemName: "pin.fill").foregroundStyle(Palette.accent)
            }
            .widgetURL(TaskCardView.calendarLink(context.attributes.date))
        }
    }
}

struct TaskCardView: View {
    let task: TaskCardAttributes

    static func calendarLink(_ date: String) -> URL? {
        var link = URLComponents(string: "obsidian://task-calendar-open")
        link?.queryItems = [URLQueryItem(name: "date", value: date)]
        return link?.url
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "pin.fill").font(.subheadline).foregroundStyle(Palette.accent)
                Text(task.title).font(.headline).foregroundStyle(.white).lineLimit(2)
                Spacer(minLength: 8)
                Text(task.time).font(.subheadline).monospacedDigit().foregroundStyle(Palette.muted)
            }
            TaskCardButtons(task: task)
        }
        .padding(16)
    }
}

struct TaskCardButtons: View {
    let task: TaskCardAttributes

    var body: some View {
        HStack(spacing: 8) {
            Button(intent: CardDoneIntent(reminderID: task.reminderID, title: task.title, date: task.date)) {
                Label("Done", systemImage: "checkmark").frame(maxWidth: .infinity)
            }
            .tint(Palette.accent)
            .foregroundStyle(.black)
            snooze("15 min", 15)
            snooze("1 hour", 60)
        }
        .buttonStyle(.borderedProminent)
        .font(.subheadline.weight(.semibold))
    }

    private func snooze(_ label: String, _ minutes: Int) -> some View {
        Button(intent: CardSnoozeIntent(reminderID: task.reminderID, title: task.title, date: task.date, minutes: minutes)) {
            Label(label, systemImage: "clock.arrow.circlepath").frame(maxWidth: .infinity)
        }
        .tint(Palette.button)
        .foregroundStyle(.white)
    }
}
