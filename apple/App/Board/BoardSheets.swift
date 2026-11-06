import Core
import SwiftUI

extension View {
    /// What a task's menu opens: Pick a Date and Repeat as sheets, Rename, Add Subtask and New Section as alerts with a field.
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
            .alert("Rename", isPresented: present(\.renaming)) {
                TextField("Task", text: $text)
                Button("Cancel", role: .cancel) {}
                Button("Rename") { if let item = model.renaming { Task { await model.rename(item, to: text) } } }
            }
            .alert("New Subtask", isPresented: present(\.subtaskOf)) {
                TextField("Task", text: $text)
                Button("Cancel", role: .cancel) {}
                Button("Add") { if let item = model.subtaskOf { Task { await model.addSubtask(to: item, text) } } }
            }
            .alert("New Section", isPresented: present(\.newSection)) {
                TextField("Name", text: $text)
                Button("Cancel", role: .cancel) {}
                Button("Add") { if let item = model.newSection { Task { await model.toSection([item], text) } } }
            }
            .onChange(of: model.renaming?.id) { text = model.renaming?.text ?? "" }
            .onChange(of: model.subtaskOf?.id) { text = "" }
            .onChange(of: model.newSection?.id) { text = "" }
    }

    private func present<T>(_ path: ReferenceWritableKeyPath<BoardModel, T?>) -> Binding<Bool> {
        Binding(get: { model[keyPath: path] != nil }, set: { if !$0 { model[keyPath: path] = nil } })
    }
}

/// Pick a Date: the system calendar; a tap on a day moves the tasks there and closes. Remove Due Date when the core offers it.
struct DateSheet: View {
    let items: [TaskItem]
    @Bindable var model: BoardModel
    @State private var picked = Date()
    @State private var menu: TaskMenuModel?
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
                ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
        .task {
            menu = items.count == 1 ? model.snapshot?.menus[items[0].id] : await model.bulkMenu()
            if let due = menu?.dueDate, let date = LocalDay.date(due) { picked = date }
        }
        .onChange(of: picked) { old, new in
            guard !Calendar.current.isDate(old, inSameDayAs: new) else { return }
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
    let item: TaskItem
    @Bindable var model: BoardModel
    @State private var draft: RepeatDraft?
    @State private var touched = false
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
                            HStack {
                                ForEach(0..<7, id: \.self) { day in
                                    let on = draft.days.contains(day)
                                    Button(Self.weekdays[day]) { edit(["what": "weekday", "day": .number(Double(day))]) }
                                        .buttonStyle(.bordered)
                                        .buttonBorderShape(.circle)
                                        .tint(on ? .accentColor : .secondary)
                                        .accessibilityAddTraits(on ? .isSelected : [])
                                }
                            }
                        }
                    } else if draft.detail == "dayOfMonth", let day = draft.dayOfMonth {
                        Section { LabeledContent("On Day", value: "\(day)") }
                    }
                    if draft.removable {
                        Section {
                            Button("Remove Repeat", role: .destructive) { Task { await model.setRepeat(item, .null); dismiss() } }
                        }
                    }
                }
            }
            .navigationTitle("Repeat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", systemImage: "checkmark") { Task { await save(); dismiss() } }
                        .buttonStyle(.glassProminent)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task { draft = try? await model.rule("rules.repeatDraft", [.string(item.repeatDay), item.repeatRule]) }
    }

    private func edit(_ change: JSONValue) {
        guard let current = draft else { return }
        Task {
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
        guard let end: [String: JSONValue] = try? await model.rule("repeatPage.end", [item.repeatRule, held]), let rule = end["rule"] else { return }
        await model.setRepeat(item, rule)
    }

    static let weekdays = ["M", "T", "W", "T", "F", "S", "S"]

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
