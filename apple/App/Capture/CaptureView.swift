import Core
import SwiftUI
import UIKit

/// A new task: typed, recorded, or both, into one of the four lists. Once added, the screen is empty for the next one.
struct CaptureView: View {
    /// Opened from the plus: the field takes the keyboard as the sheet rises.
    var focused = false
    /// The project of the view the sheet was opened from (`ScreenView.project?.link`); nil on the main screen.
    var project: String?
    /// The Project row's choice and its page (`capture.project`).
    @State private var chosen: String?
    @State private var projectRow: EntryProject?
    @State private var askingProject = false
    /// The lists by their headings' names, read again each time the screen shows: a heading renamed in Obsidian shows here.
    @State private var options: [CaptureList] = []
    @State private var listKey: String?
    @State private var text = ""
    @State private var recorder = VoiceRecorder()
    @State private var failure: String?
    @State private var sending = false
    /// The list the last task went into, told of until the next one is typed.
    @State private var added: CaptureList?
    @FocusState private var typing: Bool
    @Environment(\.scenePhase) private var scene

    var body: some View {
        ScrollView {
            VStack(spacing: Layout.margin) {
                Picker("List", selection: $listKey) {
                    ForEach(options, id: \.key) { option in
                        Text(option.name).tag(Optional(option.key))
                    }
                }
                .pickerStyle(.segmented)

                if let projectRow { projectPicker(projectRow) }

                // The task's field takes the page down to the recording's bar, as a note does: a tap anywhere on it types.
                TextField("New task", text: $text, axis: .vertical)
                    .focused($typing)
                    .background { if focused { FocusOnArrival() } }
                    .submitLabel(.done)
                    .padding(Layout.margin)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .card()
                    // «Added to …» stands in the empty field's own bottom, fading in and out: the field keeps its height.
                    .overlay(alignment: .bottomLeading) {
                        if let added {
                            Label("Added to \(added.name)", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                                .padding(Layout.margin)
                                .allowsHitTesting(false)
                                .transition(.opacity)
                        }
                    }
                    .contentShape(.rect)
                    .onTapGesture { typing = true }

                if let failure {
                    Label(failure, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
                if let problem = recorder.problem {
                    Label(problem, systemImage: "mic.slash.fill")
                        .foregroundStyle(.red)
                }
            }
            // No margin on top: a `Form` starts its first section right under the title.
            .padding([.horizontal, .bottom], Layout.margin)
            .containerRelativeFrame(.vertical)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenGround()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            RecorderBar(recorder: recorder)
                .padding(.horizontal, Layout.margin - Layout.glassButtonInset)
                .padding(.bottom, Layout.margin)
        }
        .toolbar {
            if canSend {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Clear", systemImage: "xmark") { clear() }
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Add", systemImage: "checkmark") { Task { await send() } }
                    .disabled(!canSend || sending || list == nil)
            }
        }
        .onChange(of: text) { if !text.isEmpty, added != nil { withAnimation(.smooth) { added = nil } } }
        .task {
            readLists()
            chosen = project
            await readProject()
        }
        .newProjectAlert(asking: Binding(get: { askingProject ? true : nil }, set: { askingProject = $0 ?? false })) { name, _ in
            guard let name else { return }
            Task { await newProject(name) }
        }
        .onChange(of: scene) { if scene == .active { readLists() } }
        .sensoryFeedback(.success, trigger: added) { _, new in new != nil }
        .tabScreen("New Task")
    }

    /// The Project row under List (spec point 3): «Project» and the chosen one's name, a stock menu with the Project page.
    private func projectPicker(_ row: EntryProject) -> some View {
        HStack {
            Label("Project", systemImage: "folder")
            Spacer(minLength: 8)
            Menu {
                MenuNodes(nodes: ProjectPage.nodes(row.page, pick: { link in
                    chosen = link
                    Task { await readProject() }
                }, new: { askingProject = true }), palette: { _ in nil })
            } label: {
                HStack(spacing: 4) {
                    Text(row.page.value).lineLimit(1)
                    Image(systemName: "chevron.up.chevron.down").font(.footnote.weight(.semibold))
                }
                .foregroundStyle(row.lit ? AnyShapeStyle(.tint) : AnyShapeStyle(Color(.secondaryLabel)))
            }
            .menuOrder(.fixed)
            .accessibilityLabel("Project")
            .accessibilityValue(row.page.value)
        }
        .padding(.horizontal, Layout.margin)
        .frame(minHeight: 44)
        .card()
    }

    private func readProject() async {
        let chosen = chosen
        projectRow = try? await Task.detached { try AppServices.shared.board.captureProject(chosen) }.value
    }

    /// «New project…»: the note written, the project chosen.
    private func newProject(_ name: String) async {
        do {
            guard let link = try await Task.detached(operation: { try AppServices.shared.board.newProject(name) }).value else { return }
            chosen = link
        } catch {
            failure = error.localizedDescription
        }
        await readProject()
    }

    private var list: CaptureList? {
        options.first { $0.key == listKey } ?? options.first
    }

    private func readLists() {
        options = AppServices.shared.captureLists()
        if !options.contains(where: { $0.key == listKey }) { listKey = options.first?.key }
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || recorder.state != .idle
    }

    private func clear() {
        recorder.discard()
        text = ""
        failure = nil
        added = nil
    }

    private func send() async {
        sending = true
        defer { sending = false }
        let recording = recorder.take()
        guard let target = list else { return }
        let typed = text
        let tag = AppSettings.recordingTag
        let project = chosen
        let outcome = await Task.detached { AppServices.shared.capture(list: target, text: typed, recording: recording, tag: tag, project: project) }.value
        switch outcome {
        case .saved:
            withAnimation(.smooth) {
                clear()
                added = target
            }
        case .blank:
            withAnimation(.smooth) { failure = nil }
        case .failed(let reason):
            withAnimation(.smooth) { failure = reason }
        }
    }
}

/// The text field beside it takes the keyboard the moment the screen joins the window, before the sheet slides up, so
/// the keyboard rises together with the sheet as in Notes and Reminders. A focus asked from SwiftUI lands only once the
/// presentation has ended, and the keyboard then comes up after it.
private struct FocusOnArrival: UIViewRepresentable {
    func makeUIView(context: Context) -> Probe { Probe() }
    func updateUIView(_ view: Probe, context: Context) {}

    final class Probe: UIView {
        private var done = false

        override func didMoveToWindow() {
            super.didMoveToWindow()
            focus()
        }

        /// The field may be laid out after the probe joins the window: asked again on each layout until it takes it.
        override func layoutSubviews() {
            super.layoutSubviews()
            focus()
        }

        private func focus() {
            guard window != nil, !done else { return }
            var scope = superview
            for _ in 0..<4 {
                if let field = scope.flatMap(Self.field(in:)) {
                    done = field.becomeFirstResponder()
                    return
                }
                scope = scope?.superview
            }
        }

        private static func field(in view: UIView) -> UIView? {
            if view is UITextView || view is UITextField { return view }
            for sub in view.subviews { if let found = field(in: sub) { return found } }
            return nil
        }
    }
}
