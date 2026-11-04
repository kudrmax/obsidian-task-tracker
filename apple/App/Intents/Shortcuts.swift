import AppIntents

struct Shortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SyncRemindersIntent(),
            phrases: ["Update reminders in \(.applicationName)"],
            shortTitle: "Update Reminders",
            systemImageName: "arrow.clockwise")
    }
}
