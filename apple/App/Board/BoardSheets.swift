import Core
import SwiftUI

extension View {
    /// What a task's menu opens: Pick a Date, Repeat, Rename and Add Subtask as sheets, New Section as an alert with a field,
    /// as Notes names a folder.
    func boardSheets(model: BoardModel) -> some View {
        modifier(BoardSheets(model: model))
    }
}

private struct BoardSheets: ViewModifier {
    @Bindable var model: BoardModel
    @State private var text = ""

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: present(\.dateFor)) {
                if let items = model.dateFor { DateSheet(items: items, model: model) }
            }
            .sheet(item: $model.repeatFor) { item in RepeatSheet(item: item, model: model) }
            .alert("New Section", isPresented: present(\.newSection)) {
                TextField("Name", text: $text)
                Button("Cancel", role: .cancel) {}
                Button("Add") { if let item = model.newSection { Task { await model.toSection([item], text) } } }
            }
            .onChange(of: model.newSection?.id) { text = "" }
    }

    private func present<T>(_ path: ReferenceWritableKeyPath<BoardModel, T?>) -> Binding<Bool> {
        Binding(get: { model[keyPath: path] != nil }, set: { if !$0 { model[keyPath: path] = nil } })
    }
}

/// A task's title typed on its own small sheet, as Reminders names a new list: the field takes the keyboard at once, the
/// check writes it and the cross closes untouched.
struct NameSheet: View {
    let title: LocalizedStringKey
    let action: LocalizedStringKey
    var text = ""
    let done: (String) -> Void
    @State private var typed = ""
    @FocusState private var typing: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $typed, axis: .vertical)
                    .focused($typing)
                    .submitLabel(.done)
                    .onSubmit(save)
                    .onChange(of: typed) { if typed.contains("\n") { save() } }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", systemImage: "xmark") { dismiss() }.tint(.primary) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action, systemImage: "checkmark", action: save)
                        .buttonStyle(.glassProminent)
                        .disabled(typed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.height(180)])
        .defaultFocus($typing, true)
        .onAppear { typed = text }
        .task { typing = true }
    }

    private func save() {
        let title = typed.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        done(title)
        dismiss()
    }
}

/// Pick a Date: the system calendar; a tap on a day moves the tasks there and closes. Remove Due Date when the core offers it.
struct DateSheet: View {
    let items: [TaskItem]
    @Bindable var model: BoardModel
    @State private var picked = Date()
    @State private var menu: TaskMenuModel?
    /// The day shown as the sheet opens, the tasks' own: only another day tapped moves them.
    @State private var opened: Date?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                DatePicker("Date", selection: $picked, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .tint(.accentColor)
                if menu?.removeDue == true {
                    Button("Remove Due Date", role: .destructive) {
                        Task { await model.removeDue(items); dismiss() }
                    }
                }
                Spacer()
            }
            .padding(.horizontal)
            .navigationTitle("Pick a Date")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() }.tint(.primary) }
            }
        }
        .presentationDetents([.medium, .large])
        .task {
            menu = items.count == 1 ? model.snapshot?.menus[items[0].id] : await model.bulkMenu()
            let shown = menu?.dueDate.flatMap(LocalDay.date) ?? picked
            opened = shown
            picked = shown
        }
        .onChange(of: picked) { _, new in
            guard let opened, !Calendar.current.isDate(opened, inSameDayAs: new) else { return }
            Task { await model.postpone(items, to: LocalDay.string(new)); dismiss() }
        }
    }
}

/// A day on the device's calendar, as the core writes it (`YYYY-MM-DD`): what a picked date becomes.
enum LocalDay {
    static func string(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func date(_ text: String) -> Date? {
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}

/// Repeat: what the core's repeat page offers, with system controls. The check saves, the cross closes untouched.
struct RepeatSheet: View {
    /// The day a new rule starts from, the rule as it stands, and what writing a rule does.
    let day: String
    let own: JSONValue
    let write: (JSONValue) async -> Void
    @Bindable var model: BoardModel

    init(item: TaskItem, model: BoardModel) {
        day = item.repeatDay
        own = item.repeatRule
        write = { [model] rule in await model.setRepeat(item, rule) }
        self.model = model
    }

    /// The quick entry's repeat: the rule goes to the field, which writes it with the task.
    init(day: String, own: JSONValue, model: BoardModel, write: @escaping (JSONValue) async -> Void) {
        self.day = day
        self.own = own
        self.write = write
        self.model = model
    }

    @State private var draft: RepeatDraft?
    @State private var touched = false
    @State private var editing: Task<Void, Never>?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                if let draft {
                    Section {
                        Picker("Repeat", selection: Binding(get: { draft.kind }, set: { edit(["what": "kind", "to": .string($0)]) })) {
                            ForEach(draft.kinds, id: \.self) { kind in Text(kind == "afterDone" ? "After Done" : "Schedule").tag(kind) }
                        }
                        .pickerStyle(.segmented)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                    }
                    Section {
                        Stepper {
                            HStack {
                                Text("Every")
                                Spacer()
                                Text(verbatim: "\(draft.every)").monospacedDigit()
                            }
                        } onIncrement: {
                            edit(["what": "every", "by": 1])
                        } onDecrement: {
                            if draft.can.fewer { edit(["what": "every", "by": -1]) }
                        }
                        Picker("Unit", selection: Binding(get: { draft.unit }, set: { edit(["what": "unit", "to": .string($0)]) })) {
                            ForEach(draft.units, id: \.self) { unit in Text(Self.unit(unit, every: draft.every)).tag(unit) }
                        }
                        .pickerStyle(.menu)
                    }
                    if draft.detail == "weekdays" {
                        Section("On") {
                            HStack(spacing: 0) {
                                ForEach(0..<7, id: \.self) { day in
                                    let on = draft.days.contains(day)
                                    Button { edit(["what": "weekday", "day": .number(Double(day))]) } label: {
                                        Text(Self.weekdays[day])
                                            .font(.body.weight(on ? .semibold : .regular))
                                            .foregroundStyle(on ? Color.white : Color.primary)
                                            .frame(width: 38, height: 38)
                                            .background(on ? AnyShapeStyle(.tint) : AnyShapeStyle(Color(.tertiarySystemFill)), in: .circle)
                                    }
                                    .buttonStyle(.plain)
                                    .frame(maxWidth: .infinity)
                                    .accessibilityLabel(Self.weekdayNames[day])
                                    .accessibilityAddTraits(on ? .isSelected : [])
                                }
                            }
                        }
                    } else if draft.detail == "dayOfMonth", let day = draft.dayOfMonth {
                        Section { LabeledContent("On Day", value: "\(day)") }
                    }
                    if draft.removable {
                        Section {
                            Button("Remove Repeat", role: .destructive) { Task { await write(.null); dismiss() } }
                        }
                    }
                }
            }
            .navigationTitle("Repeat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() }.tint(.primary) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", systemImage: "checkmark") { Task { await editing?.value; await save(); dismiss() } }
                        .buttonStyle(.glassProminent)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task { draft = try? await model.rule("rules.repeatDraft", [.string(day), own]) }
    }

    /// Each change is made over the draft the one before it left: quick taps add up.
    private func edit(_ change: JSONValue) {
        let before = editing
        editing = Task {
            await before?.value
            guard let current = draft else { return }
            if let next: RepeatDraft = try? await model.rule("rules.editRepeat", [current.json, change]) {
                draft = next
                touched = true
            }
        }
    }

    /// The page writes once, as it closes: `repeatPage.end` says whether, and what.
    private func save() async {
        guard let draft else { return }
        let held: JSONValue = touched ? ["rule": draft.rule] : .null
        guard let end: [String: JSONValue] = try? await model.rule("repeatPage.end", [own, held]), let rule = end["rule"] else { return }
        await write(rule)
    }

    static let weekdays = ["M", "T", "W", "T", "F", "S", "S"]
    static let weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    static func unit(_ unit: String, every: Int) -> String {
        let one = every == 1
        switch unit {
        case "day": return one ? "Day" : "Days"
        case "week": return one ? "Week" : "Weeks"
        case "month": return one ? "Month" : "Months"
        default: return unit
        }
    }
}
