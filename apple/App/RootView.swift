import SwiftUI

/// The app's tabs in the system tab bar: a new task, the settings.
struct RootView: View {
    @State private var router = CaptureRouter.shared

    var body: some View {
        TabView(selection: $router.tab) {
            Tab("New Task", systemImage: "square.and.pencil", value: AppTab.newTask) {
                CaptureView()
            }
            Tab("Settings", systemImage: "gear", value: AppTab.settings) {
                SettingsView()
            }
        }
    }
}
