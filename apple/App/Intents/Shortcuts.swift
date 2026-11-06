import AppIntents

struct Shortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: [
                "Add a task in \(.applicationName)",
                "Add a task to \(\.$list) in \(.applicationName)",
            ],
            shortTitle: "Add Task",
            systemImageName: "plus.circle")
        AppShortcut(
            intent: NewTaskIntent(),
            phrases: ["New task in \(.applicationName)", "Capture in \(.applicationName)"],
            shortTitle: "New Task",
            systemImageName: "square.and.pencil")
        AppShortcut(
            intent: NewTaskIntent(list: .inbox, voice: true),
            phrases: ["Record a task in \(.applicationName)", "Voice note in \(.applicationName)"],
            shortTitle: "Voice Task",
            systemImageName: "mic")
        AppShortcut(
            intent: SyncRemindersIntent(),
            phrases: ["Update reminders in \(.applicationName)"],
            shortTitle: "Update Reminders",
            systemImageName: "arrow.clockwise")
    }
}
