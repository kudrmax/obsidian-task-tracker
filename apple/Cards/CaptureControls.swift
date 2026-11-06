import AppIntents
import SwiftUI
import WidgetKit

/// The lock screen and Control Center button that opens a new task in Inbox.
struct NewTaskControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.kudrmax.taskcalendar.new-task") {
            ControlWidgetButton(action: NewTaskIntent(list: .inbox, voice: false)) {
                Label("New Task", systemImage: "square.and.pencil")
            }
        }
        .displayName("New Task")
        .description("Type a task into Inbox.")
    }
}

/// The same with the recording already going.
struct VoiceTaskControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.kudrmax.taskcalendar.voice-task") {
            ControlWidgetButton(action: NewTaskIntent(list: .inbox, voice: true)) {
                Label("Voice Task", systemImage: "mic")
            }
        }
        .displayName("Voice Task")
        .description("Record a task into Inbox.")
    }
}
