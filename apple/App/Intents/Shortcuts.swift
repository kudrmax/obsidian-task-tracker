import AppIntents

struct Shortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SyncRemindersIntent(),
            phrases: ["Обнови напоминания в \(.applicationName)"],
            shortTitle: "Обновить напоминания",
            systemImageName: "arrow.clockwise")
    }
}
