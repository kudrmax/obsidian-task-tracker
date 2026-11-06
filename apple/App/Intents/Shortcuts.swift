import AppIntents

struct Shortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: ["Add a task in \(.applicationName)", "Add task in \(.applicationName)"],
            shortTitle: "Add Task",
            systemImageName: "plus.circle")
        AppShortcut(
            intent: NewTaskIntent(),
            phrases: ["Open a new task in \(.applicationName)"],
            shortTitle: "New Task",
            systemImageName: "square.and.pencil")
        AppShortcut(
            intent: SyncRemindersIntent(),
            phrases: ["Update reminders in \(.applicationName)"],
            shortTitle: "Update Reminders",
            systemImageName: "arrow.clockwise")
    }
}
