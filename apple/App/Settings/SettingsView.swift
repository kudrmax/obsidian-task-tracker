import AlarmKit
import Core
import SwiftUI
import UserNotifications

struct SettingsView: View {
    @State private var model = SettingsModel()
    @State private var picking = false
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button { picking = true } label: {
                        LabeledContent("Папка vault", value: model.folderName ?? "Не выбрана")
                    }
                    status
                } footer: {
                    Text("Папка волта Obsidian: On My iPhone → Obsidian → твой волт.")
                }

                Section("Разрешения") {
                    permission("Уведомления", allowed: model.notifications == .authorized, undecided: model.notifications == .notDetermined) {
                        await model.allowNotifications()
                    }
                    permission("Будильники", allowed: model.alarms == .authorized, undecided: model.alarms == .notDetermined) {
                        await model.allowAlarms()
                    }
                }

                Section {
                    Picker("Отложить будильник на", selection: $model.alarmSnooze) {
                        ForEach(AppSettings.alarmSnoozeChoices, id: \.self) { Text("\($0) мин").tag($0) }
                    }
                } footer: {
                    Text("Кнопка Snooze на будильнике переносит задачу на это время.")
                }
            }
            .navigationTitle("Task Calendar")
            .refreshable { await model.refresh() }
            .fileImporter(isPresented: $picking, allowedContentTypes: [.folder]) { picked in
                Task { await model.choose(picked) }
            }
            .onChange(of: scenePhase, initial: true) { _, phase in
                if phase == .active { Task { await model.refresh() } }
            }
        }
    }

    @ViewBuilder
    private var status: some View {
        switch model.status {
        case .ok(let reminders, let at):
            LabeledContent("Напоминаний", value: "\(reminders)")
            LabeledContent("Обновлено", value: at.formatted(date: .omitted, time: .shortened))
        case .failed(let reason):
            Label(reason, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
        case nil:
            Text("Ещё не обновлялось").foregroundStyle(.secondary)
        }
    }

    private func permission(_ title: String, allowed: Bool, undecided: Bool, ask: @escaping () async -> Void) -> some View {
        LabeledContent(title) {
            if allowed {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            } else if undecided {
                Button("Разрешить") { Task { await ask() } }
            } else {
                Button("Открыть настройки") { openURL(URL(string: UIApplication.openSettingsURLString)!) }
            }
        }
    }
}
