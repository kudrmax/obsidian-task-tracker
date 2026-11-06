import Core
import EventKit
import SwiftUI

/// Calendars: when each calendar file was last written, an out-of-date one in orange; Refresh Now; and which calendars
/// the timeline shows, each a system switch.
struct CalendarsView: View {
    /// The main screen's, when opened from «⋯»: it reads the screen again once a calendar is shown or hidden.
    let model: BoardModel?
    @State private var statuses: [SourceStatus] = []
    @State private var calendars: [ShownCalendar] = []
    @State private var refreshing = false
    @State private var access = EKEventStore.authorizationStatus(for: .event)
    @Environment(\.dismiss) private var dismiss

    private let board = AppServices.shared.board

    var body: some View {
        Form {
            Section("Sources") {
                ForEach(statuses, id: \.source) { status in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Self.name(status.source))
                            Text(Self.words(status))
                                .font(.footnote)
                                .foregroundStyle(status.stale ? Color.orange : Color.secondary)
                        }
                        Spacer()
                        if let device = status.detail {
                            Label(device, systemImage: "iphone").font(.footnote).foregroundStyle(.secondary)
                        }
                        if status.stale {
                            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange).accessibilityLabel("Out of date")
                        }
                    }
                }
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
            Section {
                ForEach(calendars) { calendar in
                    Toggle(isOn: Binding(get: { calendar.shown }, set: { shown in Task { await show(calendar, shown) } })) {
                        HStack(spacing: 12) {
                            Circle().fill(calendar.color.map(Color.init(hex:)) ?? .blue).frame(width: 12, height: 12)
                            VStack(alignment: .leading) {
                                Text(calendar.name)
                                Text(calendar.accountName).font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            } header: {
                Text("Shown")
            } footer: {
                Text("The timeline shows the events of these calendars.")
            }
        }
        .navigationTitle("Calendars")
        .toolbar {
            if model != nil {
                ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() } }
            }
        }
        .task { await load() }
    }

    private func load() async {
        let board = board
        let read = try? await Task.detached { () -> (DayEvents, [ShownCalendar]) in
            let files = try board.files()
            let today: String = try board.read("days.today", over: files)
            return (try board.read("calendars.events", [.string(today)], over: files), try board.read("calendars.known", over: files))
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

    static func name(_ source: String) -> String {
        switch source {
        case "google": "Google Calendar"
        case "iphone": "iPhone Calendars"
        case "work": "Work Calendar"
        default: source
        }
    }

    static func words(_ status: SourceStatus) -> String {
        guard let at = status.updatedAtMs else { return "No file yet" }
        let date = Date(timeIntervalSince1970: at / 1000)
        let verb = status.kind == "exported" ? "Exported" : "Updated"
        let when = status.updatedDay == "today"
            ? date.formatted(date: .omitted, time: .shortened)
            : date.formatted(.relative(presentation: .named))
        return "\(verb) \(when)"
    }
}
