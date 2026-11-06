import AlarmKit
import Core
import SwiftUI
import UserNotifications

/// Settings, one system sheet from «⋯»: the priorities on top, each a sample of its card and a colour button; everything
/// else on its own page, as rows of the iPhone's Settings. The plugin's settings and the app's own live here together.
struct SettingsView: View {
    @State private var plugin = PluginSettings()
    @State private var model = SettingsModel()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Form {
            if let expiration = AppSignature.expiration {
                SigningPlate(expiration: expiration)
            }
            Section("Priorities") {
                ForEach(Array((plugin.form?.priorities ?? []).enumerated()), id: \.offset) { index, level in
                    MarkRow(title: level.title, color: level.color, of: "level", index: index, plugin: plugin) { name in
                        Task { await plugin.write("settings.renameLevel", [.number(Double(index)), .string(name)]) }
                    }
                }
                .onMove { from, to in
                    guard let first = from.first else { return }
                    Task { await plugin.write("settings.moveLevel", [.number(Double(first)), .number(Double(to > first ? to - 1 : to))]) }
                }
                .onDelete { rows in
                    for index in rows.sorted(by: >) { Task { await plugin.write("settings.removeLevel", [.number(Double(index))]) } }
                }
                Button("Add Priority") { Task { await plugin.write("settings.addLevel") } }
            }
            Section("Show and set up") {
                link("Labels", value: plugin.form.map { "\($0.labels.count)" }, symbol: "tag.fill", tint: .green) { LabelsPage(plugin: plugin) }
                link("Sections", value: plugin.form.map { "\($0.presets.count)" }, symbol: "rectangle.stack.fill", tint: .indigo) { SectionsPage(plugin: plugin) }
                link("Calendars", symbol: "calendar", tint: .red) { CalendarsView(model: nil) }
                link("Day and Timeline", symbol: "clock.fill", tint: .blue) { DayPage(plugin: plugin) }
                link("Tasks File", symbol: "doc.text.fill", tint: .gray) { TasksFilePage(model: model, plugin: plugin) }
                link("Reminders", symbol: "bell.fill", tint: .orange) { RemindersPage(model: model) }
            }
        }
        .navigationTitle("Settings")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() } }
        }
        .task { await plugin.load() }
        .refreshable { await model.refresh(); await plugin.load() }
        .onChange(of: scenePhase, initial: true) { _, phase in
            if phase == .active { Task { await model.refresh(); await SigningWarnings.schedule() } }
        }
    }

    private func link(_ title: LocalizedStringKey, value: String? = nil, symbol: String, tint: Color, @ViewBuilder page: @escaping () -> some View) -> some View {
        NavigationLink {
            page()
        } label: {
            LabeledContent {
                if let value { Text(value) }
            } label: {
                Label {
                    Text(title)
                } icon: {
                    Image(systemName: symbol)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 30, height: 30)
                        .background(tint.gradient, in: .rect(cornerRadius: 8))
                }
            }
        }
    }
}

/// A priority or a label: a sample of its card in its colour, its name typed in place, the system colour button.
struct MarkRow: View {
    let title: String
    let color: String
    let of: String
    let index: Int
    let plugin: PluginSettings
    let rename: (String) -> Void
    @State private var name = ""
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 12) {
            TextField("Name", text: $name)
                .font(.system(size: 15))
                .fixedSize()
                .padding(.horizontal, 12)
                .frame(height: 30)
                .background(plugin.ink(color, scheme).opacity(scheme == .dark ? 0.26 : 0.16), in: .rect(cornerRadius: 10))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { rename(name) }
            Spacer()
            ColorPicker("Color", selection: Binding(
                get: { plugin.ink(color, scheme) },
                set: { picked in Task { await plugin.recolour(of, index, to: picked, scheme: scheme) } }
            ), supportsOpacity: false)
            .labelsHidden()
        }
        .onAppear { name = title }
        .onChange(of: title) { name = title }
    }
}

struct LabelsPage: View {
    let plugin: PluginSettings
    @State private var tag = ""

    var body: some View {
        Form {
            Section {
                ForEach(Array((plugin.form?.labels ?? []).enumerated()), id: \.offset) { index, label in
                    MarkRow(title: label.title, color: label.color, of: "label", index: index, plugin: plugin) { name in
                        Task { await plugin.write("settings.renameLabel", [.number(Double(index)), .string(name)]) }
                    }
                }
                .onMove { from, to in
                    guard let first = from.first else { return }
                    Task { await plugin.write("settings.moveLabel", [.number(Double(first)), .number(Double(to > first ? to - 1 : to))]) }
                }
                .onDelete { rows in
                    for index in rows.sorted(by: >) { Task { await plugin.write("settings.removeLabel", [.number(Double(index))]) } }
                }
                Button("Add Label") { Task { await plugin.write("settings.addLabel") } }
            } footer: {
                Text("A task tagged with a label is drawn in its colour.")
            }
            Section {
                LabeledContent("Tag") {
                    TextField("label", text: $tag)
                        .multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit { Task { await plugin.write("settings.setLabelTag", [.string(tag)]) } }
                }
            } footer: {
                Text("Labels are written as tags under this one: #\(tag)/Name.")
            }
        }
        .navigationTitle("Labels")
        .toolbar { EditButton() }
        .onAppear { tag = plugin.form?.labelTag ?? "" }
    }
}

struct SectionsPage: View {
    let plugin: PluginSettings
    @State private var names: [String] = []
    @State private var ungrouped = ""
    @State private var lists: [String: String] = [:]

    var body: some View {
        Form {
            Section {
                ForEach(names.indices, id: \.self) { index in
                    TextField("Section", text: $names[index])
                        .onSubmit { Task { await plugin.write("settings.renamePreset", [.number(Double(index)), .string(names[index])]) } }
                }
                .onMove { from, to in
                    guard let first = from.first else { return }
                    Task { await plugin.write("settings.movePreset", [.number(Double(first)), .number(Double(to > first ? to - 1 : to))]) }
                }
                .onDelete { rows in
                    for index in rows.sorted(by: >) { Task { await plugin.write("settings.removePreset", [.number(Double(index))]) } }
                }
                Button("Add Section") { Task { await plugin.write("settings.addPreset") } }
            } header: {
                Text("Offered Sections")
            } footer: {
                Text("A task's menu offers these sections in every list, in this order.")
            }
            Section("Tasks Outside a Section") {
                TextField("No section", text: $ungrouped)
                    .onSubmit { Task { await plugin.write("settings.setUngrouped", [.string(ungrouped)]) } }
            }
            if let form = plugin.form {
                Section {
                    ForEach(form.sectionOrder, id: \.self) { key in
                        LabeledContent(key.capitalized) {
                            TextField(key.capitalized, text: Binding(get: { lists[key] ?? "" }, set: { lists[key] = $0 }))
                                .multilineTextAlignment(.trailing)
                                .onSubmit { Task { await plugin.write("settings.setSection", [.string(key), .string(lists[key] ?? "")]) } }
                        }
                    }
                } header: {
                    Text("Lists")
                } footer: {
                    Text("The headings of the tasks file, as the screens name the lists.")
                }
            }
        }
        .navigationTitle("Sections")
        .toolbar { EditButton() }
        .onAppear(perform: fill)
        .onChange(of: plugin.form?.presets) { fill() }
    }

    private func fill() {
        names = plugin.form?.presets ?? []
        ungrouped = plugin.form?.ungrouped ?? ""
        lists = plugin.form?.sections ?? [:]
    }
}

struct DayPage: View {
    let plugin: PluginSettings

    var body: some View {
        Form {
            if let form = plugin.form {
                Section {
                    Picker("Day Starts At", selection: Binding(get: { form.dayStartHour }, set: { hour in Task { await plugin.write("settings.setDayStartHour", [.number(Double(hour))]) } })) {
                        ForEach(form.dayStartHours, id: \.self) { Text(String(format: "%02d:00", $0)).tag($0) }
                    }
                } footer: {
                    Text("Until this hour the night still belongs to the day before.")
                }
                Section {
                    Picker("Other Days Open At", selection: Binding(get: { form.scrollToHour }, set: { hour in Task { await plugin.write("settings.setCount", ["scrollToHour", .string(String(hour))]) } })) {
                        ForEach(0..<24, id: \.self) { Text(String(format: "%02d:00", $0)).tag($0) }
                    }
                    Stepper(value: Binding(get: { form.staleAfterMinutes }, set: { minutes in Task { await plugin.write("settings.setCount", ["staleAfterMinutes", .string(String(minutes))]) } }), in: 0...1440, step: 30) {
                        LabeledContent("Calendar Out of Date After", value: "\(form.staleAfterMinutes) min")
                    }
                } footer: {
                    Text("Today opens on the now line. A calendar file older than this is shown in orange.")
                }
            }
        }
        .navigationTitle("Day and Timeline")
    }
}

struct TasksFilePage: View {
    @Bindable var model: SettingsModel
    let plugin: PluginSettings
    @State private var picking = false
    @State private var path = ""

    var body: some View {
        Form {
            Section {
                Button { picking = true } label: {
                    LabeledContent("Vault Folder", value: model.folderName ?? "Not Chosen")
                }
                LabeledContent("Tasks File") {
                    TextField("TODOs Tasks.md", text: $path)
                        .multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit { Task { await plugin.write("settings.setTasksFile", [.string(path)]) } }
                }
            } footer: {
                Text("Your Obsidian vault: On My iPhone → Obsidian → your vault. The tasks file is a path in it.")
            }
            Section {
                LabeledContent("Recording Tag") {
                    TextField("None", text: $model.recordingTag)
                        .multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            } footer: {
                Text("Goes after a recording's link in its task, for the plugin that transcribes it. Empty for none.")
            }
        }
        .navigationTitle("Tasks File")
        .fileImporter(isPresented: $picking, allowedContentTypes: [.folder]) { picked in
            Task { await model.choose(picked); await plugin.load() }
        }
        .onAppear { path = plugin.form?.tasksFile ?? "" }
    }
}

struct RemindersPage: View {
    @Bindable var model: SettingsModel
    @Environment(\.openURL) private var openURL

    var body: some View {
        Form {
            Section {
                status
            }
            Section {
                permission("Notifications", allowed: model.notifications == .authorized, undecided: model.notifications == .notDetermined) {
                    await model.allowNotifications()
                }
                permission("Alarms", allowed: model.alarms == .authorized, undecided: model.alarms == .notDetermined) {
                    await model.allowAlarms()
                }
            } header: {
                Text("Permissions")
            }
            Section {
                Toggle("Alarm Sound", isOn: $model.alarmSound)
                Picker("Snooze Alarm For", selection: $model.alarmSnooze) {
                    ForEach(AppSettings.alarmSnoozeChoices, id: \.self) { Text("\($0) min").tag($0) }
                }
            } footer: {
                Text("Without the sound an alarm still covers the screen. Snooze moves the task this much later.")
            }
        }
        .navigationTitle("Reminders")
        .refreshable { await model.refresh() }
    }

    @ViewBuilder
    private var status: some View {
        switch model.status {
        case .ok(let reminders, let at, let cardsRefused):
            LabeledContent("Reminders", value: "\(reminders)")
            LabeledContent("Updated", value: at.formatted(date: .omitted, time: .shortened))
            if let cardsRefused {
                Label("Live Activity refused, sent as a notification: \(cardsRefused)", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
            }
        case .failed(let reason):
            Label(reason, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
        case nil:
            Text("Not updated yet").foregroundStyle(.secondary)
        }
    }

    private func permission(_ title: String, allowed: Bool, undecided: Bool, ask: @escaping () async -> Void) -> some View {
        PermissionRow(title: title, allowed: allowed, undecided: undecided, ask: ask)
    }
}

/// A permission the app asks for: granted, to be asked, or refused and changed only in the iPhone's Settings.
struct PermissionRow: View {
    let title: String
    let allowed: Bool
    let undecided: Bool
    let ask: () async -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
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
