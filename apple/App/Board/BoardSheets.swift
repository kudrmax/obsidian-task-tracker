import Core
import SwiftUI
import os

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
            .newProjectAlert(asking: $model.newProjectFor) { name, ask in
                Task { await model.newProject(name, for: ask.target) }
            }
    }

    private func present<T>(_ path: ReferenceWritableKeyPath<BoardModel, T?>) -> Binding<Bool> {
        Binding(get: { model[keyPath: path] != nil }, set: { if !$0 { model[keyPath: path] = nil } })
    }
}

/// Pick a Date: the system calendar; a tap on a day moves the tasks there and closes. A task without a date opens with no
/// day picked, so today is a tap like any other. Remove Due Date when the core offers it.
struct DateSheet: View {
    let items: [TaskItem]
    @Bindable var model: BoardModel
    @State private var menu: TaskMenuModel?
    /// The tasks' own day, picked as the sheet opens; nil for tasks without one.
    @State private var due: DateComponents?
    @State private var ready = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if ready {
                    DayCalendar(picked: due) { day in
                        guard let day else { return dismiss() }
                        Task { await model.postpone(items, to: day); dismiss() }
                    }
                    .tint(.accentColor)
                }
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
            due = menu?.dueDate.flatMap(LocalDay.components)
            ready = true
        }
    }
}

/// The system's calendar of one picked day (`UICalendarView`), which, unlike the graphical date picker, can open with no
/// day picked. `chose` hears the day tapped as the core writes it, or nil when the day already picked was tapped.
private struct DayCalendar: UIViewRepresentable {
    let picked: DateComponents?
    let chose: (String?) -> Void

    func makeUIView(context: Context) -> UICalendarView {
        let view = UICalendarView()
        view.calendar = .current
        view.locale = .current
        view.fontDesign = .default
        let selection = UICalendarSelectionSingleDate(delegate: context.coordinator)
        selection.selectedDate = picked
        view.selectionBehavior = selection
        if let picked { view.visibleDateComponents = picked }
        view.setContentHuggingPriority(.required, for: .vertical)
        return view
    }

    func updateUIView(_ view: UICalendarView, context: Context) {
        context.coordinator.chose = chose
    }

    func makeCoordinator() -> Coordinator { Coordinator(picked: picked, chose: chose) }

    final class Coordinator: NSObject, UICalendarSelectionSingleDateDelegate {
        let picked: DateComponents?
        var chose: (String?) -> Void

        init(picked: DateComponents?, chose: @escaping (String?) -> Void) {
            self.picked = picked
            self.chose = chose
        }

        func dateSelection(_ selection: UICalendarSelectionSingleDate, didSelectDate day: DateComponents?) {
            guard let day, let date = Calendar.current.date(from: day) else { return chose(nil) }
            if let picked, Calendar.current.date(from: picked).map({ Calendar.current.isDate($0, inSameDayAs: date) }) == true { return chose(nil) }
            chose(LocalDay.string(date))
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
        components(text).flatMap { Calendar.current.date(from: $0) }
    }

    static func components(_ text: String) -> DateComponents? {
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return DateComponents(calendar: .current, year: parts[0], month: parts[1], day: parts[2])
    }
}

/// Repeat: what the core's repeat page offers, with system controls and the core's words (`REPEAT_WORDS`). As the
/// plugin's page, it writes once as it closes, however it closes (Done or a swipe down): there is no discard.
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

    /// The draft and its edits, held by reference: the write as the page goes reads them after the view has left.
    @State private var page = RepeatPage()
    private var draft: RepeatDraft? { page.draft }
    @State private var words: RepeatWords?
    /// The page has written (Done, Remove Repeat): its going away writes nothing more.
    @State private var ended = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                if let draft, let words {
                    Section {
                        Picker("Repeat", selection: Binding(get: { draft.kind }, set: { edit(["what": "kind", "to": .string($0)]) })) {
                            ForEach(draft.kinds, id: \.self) { kind in Text(Self.titled(words.kinds[kind] ?? kind)).tag(kind) }
                        }
                        .pickerStyle(.segmented)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                    }
                    Section {
                        Stepper {
                            HStack {
                                Text(words.every)
                                Spacer()
                                Text(verbatim: "\(draft.every)").monospacedDigit()
                            }
                        } onIncrement: {
                            edit(["what": "every", "by": 1])
                        } onDecrement: {
                            if draft.can.fewer { edit(["what": "every", "by": -1]) }
                        }
                        Picker("Unit", selection: Binding(get: { draft.unit }, set: { edit(["what": "unit", "to": .string($0)]) })) {
                            ForEach(draft.units, id: \.self) { unit in Text(Self.titled(words.units[unit] ?? unit)).tag(unit) }
                        }
                        .pickerStyle(.menu)
                    }
                    if draft.detail == "weekdays" {
                        Section("On") {
                            HStack(spacing: 0) {
                                ForEach(Array(words.weekdays.enumerated()), id: \.offset) { day, weekday in
                                    let on = draft.days.contains(day)
                                    Button { edit(["what": "weekday", "day": .number(Double(day))]) } label: {
                                        Text(weekday.letter)
                                            .font(.body.weight(on ? .semibold : .regular))
                                            .foregroundStyle(on ? Color.white : Color.primary)
                                            .frame(width: 38, height: 38)
                                            .background(on ? AnyShapeStyle(.tint) : AnyShapeStyle(Color(.tertiarySystemFill)), in: .circle)
                                    }
                                    .buttonStyle(.plain)
                                    .frame(maxWidth: .infinity)
                                    .accessibilityLabel(weekday.name)
                                    .accessibilityAddTraits(on ? .isSelected : [])
                                }
                            }
                        }
                    } else if draft.detail == "monthDay", let on: String = model.ruleNow("rules.onTheDay", [draft.rule]), !on.isEmpty {
                        // The day a monthly schedule falls on, in the core's words: «On the 5th».
                        Section { Text(on) }
                    }
                    if draft.removable {
                        Section {
                            Button(Self.titled(words.remove), role: .destructive) {
                                ended = true
                                Task { await write(.null); dismiss() }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Repeat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", systemImage: "checkmark") { dismiss() }
                        .buttonStyle(.glassProminent)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task {
            words = try? AppServices.shared.board.repeatWords()
            page.draft = await ask("rules.repeatDraft", [.string(day), own])
        }
        // However the page goes, it writes as it closes, as the plugin's does when its menu closes.
        .onDisappear {
            guard !ended else { return }
            ended = true
            let page = page
            Task { await page.editing?.value; await save(page) }
        }
    }

    /// The core's words in the app's title case: «After done» reads «After Done».
    static func titled(_ words: String) -> String {
        words.split(separator: " ").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }

    /// Each change is made over the draft the one before it left: quick taps add up.
    private func edit(_ change: JSONValue) {
        let before = page.editing, page = page
        page.editing = Task {
            await before?.value
            guard let current = page.draft else { return }
            if let next: RepeatDraft = await ask("rules.editRepeat", [current.json, change]) {
                page.draft = next
                page.touched = true
            }
        }
    }

    /// The page writes once, as it closes: `repeatPage.end` says whether, and what.
    private func save(_ page: RepeatPage) async {
        guard let draft = page.draft else { return }
        let held: JSONValue = page.touched ? ["rule": draft.rule] : .null
        guard let end: [String: JSONValue] = await ask("repeatPage.end", [own, held]), let rule = end["rule"] else { return }
        await write(rule)
    }

    /// The core's answer, or nothing with the reason in the log: an answer the app can't read leaves the page as it was.
    private func ask<T: Decodable & Sendable>(_ method: String, _ arguments: [JSONValue]) async -> T? {
        do {
            return try await model.rule(method, arguments)
        } catch {
            Self.log.error("\(method, privacy: .public) failed: \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    private static let log = Logger(subsystem: "com.kudrmax.taskcalendar", category: "repeat")
}

/// The repeat page's draft, the edits made to it, and the edit still running.
@MainActor
@Observable
final class RepeatPage {
    var draft: RepeatDraft?
    @ObservationIgnored var touched = false
    @ObservationIgnored var editing: Task<Void, Never>?
}

extension View {
    /// «New project…»'s question, as New Section asks: the name, Create or Cancel; `answer` gets the name (nil for Cancel)
    /// and what was asked, as it was when the question came up: the alert clears `asking` before its buttons run.
    func newProjectAlert<Asked>(asking: Binding<Asked?>, answer: @escaping (String?, Asked) -> Void) -> some View {
        modifier(NewProjectAlert(asking: asking, answer: answer))
    }
}

private struct NewProjectAlert<Asked>: ViewModifier {
    @Binding var asking: Asked?
    let answer: (String?, Asked) -> Void
    @State private var name = ""

    func body(content: Content) -> some View {
        content
            .alert("New Project", isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }), presenting: asking) { asked in
                TextField("Name", text: $name)
                Button("Cancel", role: .cancel) { answer(nil, asked) }
                Button("Create") { answer(name, asked) }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            } message: { _ in
                Text("A note of this name becomes the project.")
            }
            .onChange(of: asking != nil) { if asking != nil { name = "" } }
    }
}
