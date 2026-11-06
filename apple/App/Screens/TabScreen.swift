import SwiftUI

extension View {
    /// The screen of one of the app's tabs, drawn as every tab is: the system navigation bar with the large title over
    /// this view, a `Form` on every tab. A new tab uses it too, so all the tabs read as one app.
    func tabScreen(_ title: LocalizedStringKey) -> some View {
        NavigationStack {
            navigationTitle(title)
                .navigationBarTitleDisplayMode(.large)
        }
    }
}
