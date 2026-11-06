import SwiftUI

/// The app's tabs in the system tab bar: a new task, the settings.
struct RootView: View {
    @State private var router = CaptureRouter.shared
    @State private var recorder = VoiceRecorder()

    var body: some View {
        TabView(selection: $router.tab) {
            Tab("New Task", systemImage: "square.and.pencil", value: AppTab.newTask) {
                CaptureView(recorder: recorder)
            }
            Tab("Settings", systemImage: "gear", value: AppTab.settings) {
                SettingsView()
            }
        }
        .tabViewBottomAccessory {
            RecorderAccessory(recorder: recorder)
        }
    }
}
