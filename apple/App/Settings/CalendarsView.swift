import Core
import EventKit
import SwiftUI

/// Calendars: when each calendar file was last written, one the timeline relies on in orange once out of date and red
/// once its refresh failed too, the spare ones apart and grey; Refresh Now; and which calendars the timeline shows, each
/// a system switch.
struct CalendarsView: View {
    /// The main screen's, when opened from «⋯»: it reads the screen again once a calendar is shown or hidden.
    let model: BoardModel?
    @State private var statuses: [SourceStatus] = []
    @State private var calendars: [ShownCalendar] = []
    @State private var refreshing = false
    @State private var access = EKEventStore.authorizationStatus(for: .event)
    @State private var plugin = PluginSettings()
    @Environment(\.dismiss) private var dismiss

    private let board = AppServices.shared.board

    var body: some View {
        Form {
            Section("Sources") {
                // Each calendar file's row as the core words it (`SourceStatus.words`) and codes it (`tone`), the same
                // as the plugin's window, in the core's order: the files the timeline takes from here, the spare below.
                ForEach(statuses.filter { $0.tone != .spare }, id: \.source) { SourceRow(status: $0) }
                Button {
                    Task { await refresh() }
                } label: {
                    if refreshing { ProgressView() } else { Text("Refresh Now") }
                }
                PermissionRow(title: "iPhone Calendars Access", allowed: access == .fullAccess, undecided: access == .notDetermined) {
                    await PhoneCalendarExport.requestAccess()
                    access = EKEventStore.authorizationStatus(for: .event)
                    await refresh()
                }
            }
            let spare = statuses.filter { $0.tone == .spare }
            if !spare.isEmpty {
                Section {
                    ForEach(spare, id: \.source) { SourceRow(status: $0) }
                } header: {
                    Text("Not in use")
                } footer: {
                    Text("The timeline takes a calendar from these only when the files above go out of date.")
                }
            }
            // Every calendar under its account, as the plugin's settings list them.
            ForEach(Array(accounts.enumerated()), id: \.offset) { index, account in
                Section {
                    ForEach(account.calendars) { calendar in
                        Toggle(isOn: Binding(get: { calendar.shown }, set: { shown in Task { await show(calendar, shown) } })) {
                            HStack(spacing: 12) {
                                Circle().fill(calendar.color.map(Color.init(hex:)) ?? .blue).frame(width: 12, height: 12)
                                Text(calendar.name)
                            }
                        }
                        .tint(Color(.systemGreen))
                    }
                } header: {
                    Text(account.name)
                } footer: {
                    if index == accounts.count - 1 { Text("The timeline shows the events of the calendars switched on.") }
                }
            }
            if let form = plugin.form {
                // Google Calendar as the plugin's settings set it up: the plugin fetches it and writes the file the app
                // reads, so its sign-in and secret stay in Obsidian; the client and the interval are shared settings.
                Section {
                    LabeledContent("Account", value: form.googleLoggedIn ? "Logged In" : "Not Logged In")
                    TextRow(title: "Client ID", value: form.googleClientId) { id in
                        await plugin.write("settings.setGoogleClientId", [.string(id)])
                    }
                    CountRow(title: "Refresh Interval", unit: "s", value: form.refreshSeconds) { text in
                        await plugin.write("settings.setCount", ["refreshSeconds", .string(text)])
                    }
                } header: {
                    Text("Google Calendar")
                } footer: {
                    Text("Obsidian fetches Google Calendar and syncs it here: log in and paste the client secret in its settings. Seconds between fetches while Obsidian is open; 0 turns the timer off.")
                }
                Section {
                    TextRow(title: "File Path", value: form.workCalendarFile) { path in
                        await plugin.write("settings.setWorkCalendarFile", [.string(path)])
                    }
                } header: {
                    Text("Work Calendar")
                } footer: {
                    Text("The work calendar's file in the vault, as Obsidian's export writes it. This iPhone's own calendars need no script: the app exports them itself.")
                }
            }
        }
        .navigationTitle("Calendars")
        .toolbar {
            if model != nil {
                ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() }.tint(.primary) }
            }
        }
        .task {
            await load()
            await plugin.load()
        }
    }

    /// The calendars by account, in the order the core lists them.
    private var accounts: [(name: String, calendars: [ShownCalendar])] {
        var grouped: [(name: String, calendars: [ShownCalendar])] = []
        for calendar in calendars {
            if grouped.last?.name == calendar.accountName { grouped[grouped.count - 1].calendars.append(calendar) } else { grouped.append((calendar.accountName, [calendar])) }
        }
        return grouped
    }

    private func load() async {
        let board = board
        // The day the main screen shows, so the rows tell what its timeline relies on, as the badge on «⋯» does.
        let open = model?.snapshot?.day
        let read = try? await Task.detached { () -> (DayEvents, [ShownCalendar]) in
            let files = try board.files()
            let day: String = try open ?? board.read("days.today", over: files)
            return (try board.read("calendars.events", [.string(day)], over: files), try board.read("calendars.known", over: files))
        }.value
        statuses = read?.0.statuses ?? []
        calendars = read?.1 ?? []
    }

    private func refresh() async {
        refreshing = true
        await AppServices.shared.refresh()
        await load()
        await model?.reload()
        refreshing = false
    }

    private func show(_ calendar: ShownCalendar, _ shown: Bool) async {
        let board = board
        try? await Task.detached {
            try board.writeSettings("calendars.setShown", [.string(calendar.account), .string(calendar.title), .bool(shown)])
        }.value
        await load()
        await model?.reload()
    }
}

/// A calendar file's row: its name, how it was updated or its problem, and the time, coloured by its tone.
private struct SourceRow: View {
    let status: SourceStatus

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(status.words.name)
                    .foregroundStyle(status.tone == .spare ? Color.secondary : Color.primary)
                Text(status.words.sub)
                    .font(.footnote)
                    .foregroundStyle(status.tone == .broken ? Color.red : Color.secondary)
            }
            Spacer()
            if !status.words.time.isEmpty {
                Text(status.words.time)
                    .font(.footnote)
                    .monospacedDigit()
                    .foregroundStyle(alerted ? Color.orange : Color.secondary)
            }
            if alerted {
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundStyle(status.tone == .broken ? Color.red : Color.orange)
                    .accessibilityLabel(status.tone == .broken ? "Refresh failed" : "Out of date")
            }
        }
    }

    private var alerted: Bool { status.tone == .old || status.tone == .broken }
}
