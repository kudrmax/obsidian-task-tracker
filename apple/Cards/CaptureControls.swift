import AppIntents
import SwiftUI
import WidgetKit

/// The button for the lock screen's bottom corners and Control Center that opens a new task.
struct NewTaskControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.kudrmax.taskcalendar.new-task") {
            ControlWidgetButton(action: NewTaskIntent()) {
                Label("New Task", systemImage: "square.and.pencil")
            }
        }
        .displayName("New Task")
        .description("Type or record a task.")
    }
}

/// The round lock screen widget that opens a new task.
struct NewTaskWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.kudrmax.taskcalendar.new-task-widget", provider: Always()) { _ in
            Image(systemName: "square.and.pencil")
                .font(.title2.weight(.medium))
                .widgetAccentable()
                .containerBackground(for: .widget) { AccessoryWidgetBackground() }
                .widgetURL(URL(string: "taskcalendar://new-task"))
                .accessibilityLabel("New Task")
        }
        .configurationDisplayName("New Task")
        .description("Type or record a task.")
        .supportedFamilies([.accessoryCircular])
    }

    /// The widget never changes.
    struct Always: TimelineProvider {
        func placeholder(in context: Context) -> Entry { Entry() }
        func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry()) }
        func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
            completion(Timeline(entries: [Entry()], policy: .never))
        }
    }

    struct Entry: TimelineEntry {
        let date = Date.now
    }
}
