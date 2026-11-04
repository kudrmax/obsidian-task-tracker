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
                        LabeledContent("Vault Folder", value: model.folderName ?? "Not Chosen")
                    }
                    status
                } footer: {
                    Text("Your Obsidian vault: On My iPhone → Obsidian → your vault.")
                }

                Section("Permissions") {
                    permission("Notifications", allowed: model.notifications == .authorized, undecided: model.notifications == .notDetermined) {
                        await model.allowNotifications()
                    }
                    permission("Alarms", allowed: model.alarms == .authorized, undecided: model.alarms == .notDetermined) {
                        await model.allowAlarms()
                    }
                }

                Section {
                    Picker("Snooze Alarm For", selection: $model.alarmSnooze) {
                        ForEach(AppSettings.alarmSnoozeChoices, id: \.self) { Text("\($0) min").tag($0) }
                    }
                } footer: {
                    Text("Snooze on an alarm moves the task this much later.")
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
            LabeledContent("Reminders", value: "\(reminders)")
            LabeledContent("Updated", value: at.formatted(date: .omitted, time: .shortened))
        case .failed(let reason):
            Label(reason, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
        case nil:
            Text("Not updated yet").foregroundStyle(.secondary)
        }
    }

    private func permission(_ title: String, allowed: Bool, undecided: Bool, ask: @escaping () async -> Void) -> some View {
        LabeledContent(title) {
            if allowed {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            } else if undecided {
                Button("Allow") { Task { await ask() } }
            } else {
                Button("Open Settings") { openURL(URL(string: UIApplication.openSettingsURLString)!) }
            }
        }
    }
}
