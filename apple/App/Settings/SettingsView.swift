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
            ResultMarkSection(plugin: plugin)
            if let form = plugin.form {
                CardsSection(form: form, plugin: plugin)
            }
            Section("Show and set up") {
                link("Labels", value: plugin.form.map { "\($0.labels.count)" }, symbol: "tag.fill", tint: .green) { LabelsPage(plugin: plugin) }
                link("Sections", value: plugin.form.map { "\($0.presets.count)" }, symbol: "rectangle.stack.fill", tint: .indigo) { SectionsPage(plugin: plugin) }
                link("Projects", value: plugin.form?.projectTag, symbol: "folder.fill", tint: .teal) { ProjectsPage(plugin: plugin) }
                link("Calendars", symbol: "calendar", tint: .red) { CalendarsView(model: nil) }
                link("Day and Timeline", symbol: "clock.fill", tint: .blue) { DayPage(plugin: plugin) }
                link("Tasks File", symbol: "doc.text.fill", tint: .gray) { TasksFilePage(model: model, plugin: plugin) }
                link("Reminders", symbol: "bell.fill", tint: .orange) { RemindersPage(model: model) }
            }
        }
        .navigationTitle("Settings")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() }.tint(.primary) }
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
                .background(plugin.fill(color, scheme), in: .rect(cornerRadius: 10))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { rename(name) }
            Spacer()
            // The six preset colours, each its own shade in either theme, as the plugin's circles; the system picker for
            // any other.
            HStack(spacing: 6) {
                ForEach(plugin.presets, id: \.self) { preset in
                    Button {
                        Task { await plugin.write(of == "level" ? "settings.recolourLevel" : "settings.recolourLabel", [.number(Double(index)), .string(preset)]) }
                    } label: {
                        Circle()
                            .fill(plugin.ink(preset, scheme))
                            .frame(width: 18, height: 18)
                            .overlay { if preset == color { Circle().strokeBorder(Color.primary, lineWidth: 2).padding(-3) } }
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(preset.capitalized)
                    .accessibilityAddTraits(preset == color ? .isSelected : [])
                }
            }
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
            if let form = plugin.form {
                Section {
                    Picker("Several Labels", selection: Binding(get: { form.labelPaint }, set: { paint in Task { await plugin.write("settings.setLabelPaint", [.string(paint)]) } })) {
                        ForEach(form.labelPaints, id: \.self) { Text(LabelsPage.paintTitle($0)).tag($0) }
                    }
                } footer: {
                    Text("A card of several labels: thin slanted stripes of their colours in turn, or the colours flowing into each other from left to right.")
                }
            }
            Section {
                LabeledContent("Tag") {
                    TextField("label", text: $tag)
                        .multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(saveTag)
                }
            } footer: {
                Text("Labels are written as tags under this one: #\(tag)/Name.")
            }
        }
        .navigationTitle("Labels")
        .toolbar { EditButton() }
        .onAppear { tag = plugin.form?.labelTag ?? "" }
        .onDisappear(perform: saveTag)
    }

    /// The tag typed is kept on Return and on leaving the page, as Settings keeps a field.
    private func saveTag() {
        guard let saved = plugin.form?.labelTag, tag != saved else { return }
        Task { await plugin.write("settings.setLabelTag", [.string(tag)]) }
    }
}

/// «Result mark» (results, point 3), beside the priorities as the plugin has it: the word a result's line starts with. The
/// core keeps it only when it is one word that is no priority's prefix; otherwise the saved one comes back into the field.
struct ResultMarkSection: View {
    let plugin: PluginSettings
    @State private var mark = ""

    var body: some View {
        Section {
            LabeledContent("Result Mark") {
                TextField("🎯", text: $mark)
                    .multilineTextAlignment(.trailing)
                    .frame(minWidth: 88)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit(save)
            }
        } footer: {
            Text("A task whose line starts with this word is a result: its card shows its next open subtask under the result’s title. Changing it rewrites no task.")
        }
        .onAppear { mark = plugin.form?.resultMark ?? "" }
        .onDisappear(perform: save)
        .onChange(of: plugin.form?.resultMark) { mark = plugin.form?.resultMark ?? "" }
    }

    /// Kept on Return and on leaving, as Settings keeps a field; a mark the core refuses puts the saved one back.
    private func save() {
        guard let saved = plugin.form?.resultMark, mark != saved else { return }
        Task {
            await plugin.write("settings.setResultMark", [.string(mark)])
            mark = plugin.form?.resultMark ?? saved
        }
    }
}

/// The tag that makes a note a project, as the plugin's Project tag setting.
struct ProjectsPage: View {
    let plugin: PluginSettings
    @State private var tag = ""

    var body: some View {
        Form {
            Section {
                LabeledContent("Project Tag") {
                    TextField("#project", text: $tag)
                        .multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(saveTag)
                }
            } footer: {
                // As the plugin's Project tag: the warning only while Obsidian would leave a renamed note's links behind.
                Text(plugin.updatesLinks
                    ? "A note with this tag, in its properties or its text, is a project: Backlog and Soon group their tasks by it, and a task’s menu offers it under Project."
                    : "A note with this tag, in its properties or its text, is a project: Backlog and Soon group their tasks by it, and a task’s menu offers it under Project. Turn on Files and links → Automatically update internal links in Obsidian: otherwise renaming a project’s note breaks its tasks’ links.")
            }
        }
        .navigationTitle("Projects")
        .onAppear { tag = plugin.form?.projectTag ?? "" }
        .onDisappear(perform: saveTag)
        .onChange(of: plugin.form?.projectTag) { tag = plugin.form?.projectTag ?? "" }
    }

    /// The tag typed is kept on Return and on leaving the page, as Settings keeps a field.
    private func saveTag() {
        guard let saved = plugin.form?.projectTag, tag != saved else { return }
        Task { await plugin.write("settings.setProjectTag", [.string(tag)]) }
    }
}

extension LabelsPage {
    /// Several labels' paints in the app's words.
    static func paintTitle(_ paint: String) -> String {
        switch paint {
        case "stripes": "Stripes"
        case "blend": "Blend"
        default: paint.capitalized
        }
    }
}

/// Cards: a card's height and the gap between two cards, each a slider within the core's bounds, as the plugin's.
struct CardsSection: View {
    let form: SettingsForm
    let plugin: PluginSettings
    @State private var height: Double = 35
    @State private var gap: Double = 2

    var body: some View {
        Section {
            slider("Card Height", value: $height, bounds: form.cardHeights) { await plugin.write("settings.setCardHeight", [.number($0)]) }
            slider("Gap Between Cards", value: $gap, bounds: form.cardGaps) { await plugin.write("settings.setCardGap", [.number($0)]) }
        } header: {
            Text("Cards")
        } footer: {
            Text("Points. The ends of a card are round: half its height. The gap is between cards in a list and in a stack on the timeline.")
        }
        .onAppear { follow() }
        .onChange(of: form.cardHeight) { follow() }
        .onChange(of: form.cardGap) { follow() }
    }

    private func follow() {
        height = Double(form.cardHeight)
        gap = Double(form.cardGap)
    }

    private func slider(_ title: String, value: Binding<Double>, bounds: SizeBounds, write: @escaping (Double) async -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            LabeledContent(title, value: "\(Int(value.wrappedValue))")
            Slider(value: value, in: Double(bounds.min)...Double(bounds.max), step: 1) {
                Text(title)
            } minimumValueLabel: {
                Text("\(bounds.min)").font(.caption).foregroundStyle(.secondary)
            } maximumValueLabel: {
                Text("\(bounds.max)").font(.caption).foregroundStyle(.secondary)
            } onEditingChanged: { editing in
                if !editing { Task { await write(value.wrappedValue) } }
            }
            .accessibilityLabel(title)
        }
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
                Section {
                    CountRow(title: "Long Press Delay", unit: "ms", value: form.longPressMs) { text in
                        await plugin.write("settings.setCount", ["longPressMs", .string(text)])
                    }
                    TextRow(title: "Zoom Levels", value: form.zoomLevels) { text in
                        await plugin.write("settings.setZoomLevels", [.string(text)])
                    }
                    .keyboardType(.numbersAndPunctuation)
                } footer: {
                    Text("Milliseconds before a touch becomes a drag, on a card and on the empty timeline. The zoom's hour heights in points, like 28, 56, 112, 224: a pinch stops wherever the fingers lift, up to the largest. Zoomed out all the way, the timeline shows the whole day instead of the smallest one.")
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
            if let form = plugin.form {
                Section {
                    ForEach(form.markerOrder, id: \.self) { marker in
                        TextRow(title: TasksFilePage.markerTitle(marker), value: form.markers[marker] ?? "") { text in
                            await plugin.write("settings.setMarker", [.string(marker), .string(text)])
                        }
                    }
                } header: {
                    Text("Line Markers")
                } footer: {
                    Text("Lines written with an old marker are no longer read: change them in the file by hand.")
                }
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

extension TasksFilePage {
    /// A line marker's name, as the plugin's settings name it.
    static func markerTitle(_ marker: String) -> String {
        switch marker {
        case "dueDateMarker": "Due Date"
        case "slotMarker": "Slot"
        case "alarmSlotMarker": "Alarm"
        case "liveSlotMarker": "Live Activity"
        case "silentSlotMarker": "No Reminder"
        case "repeatMarker": "Repeat"
        case "collapsedMarker": "Collapsed"
        default: marker
        }
    }
}

/// A setting typed as text, written when it is left (Return): the field shows what the settings hold again after the
/// write, so a value the core refused goes back to the one saved.
struct TextRow: View {
    let title: String
    let value: String
    let write: (String) async -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        LabeledContent(title) {
            TextField(title, text: $text)
                .focused($focused)
                .multilineTextAlignment(.trailing)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { focused = false }
                .onChange(of: focused) { if !focused, text != value { Task { await write(text); text = value } } }
        }
        .onAppear { text = value }
        .onChange(of: value) { text = value }
    }
}

/// A setting typed as a count: digits, its unit after the field.
struct CountRow: View {
    let title: String
    let unit: String
    let value: Int
    let write: (String) async -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        LabeledContent(title) {
            HStack(spacing: 4) {
                TextField(title, text: $text)
                    .focused($focused)
                    .multilineTextAlignment(.trailing)
                    .keyboardType(.numberPad)
                    .onSubmit { focused = false }
                    // The number pad has no return: the bar over it ends the typing, as the plugin's field is left.
                    .toolbar {
                        if focused {
                            ToolbarItemGroup(placement: .keyboard) {
                                Spacer()
                                Button("Done") { focused = false }
                            }
                        }
                    }
                    .onChange(of: focused) { if !focused, text != "\(value)" { Task { await write(text); text = "\(value)" } } }
                    .frame(maxWidth: 90)
                Text(unit).foregroundStyle(.secondary)
            }
        }
        .onAppear { text = "\(value)" }
        .onChange(of: value) { text = "\(value)" }
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
