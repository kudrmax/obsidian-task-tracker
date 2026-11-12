import Core
import SwiftUI
import UIKit

/// The funnel's view on this device: the filter, the mode, the panel and the place, each changed through the core
/// (`docs/door.md`, «Projects as one view with the funnel», «The view rework»). A change of the view alone (the panel,
/// the mode) never waits on the screen's read: the core's new view is drawn over the lists already read. A change of the
/// filter draws its view at once too, the lists following once they are read for it. Calls run one after another in the
/// order they were made, so quick picks end on the last one, and the place is written in the order it moved.
@MainActor
@Observable
final class FunnelState {
    @ObservationIgnored private let board = AppServices.shared.board
    @ObservationIgnored weak var model: BoardModel?
    /// The view calls, one after another.
    @ObservationIgnored private var calls: Task<Void, Never>?
    /// The place's writes, one after another.
    @ObservationIgnored private var placeWrites: Task<Void, Never>?

    /// The view as drawn now, decoded; before the first read, the one the device keeps.
    var presentation: FunnelPresentation? { model?.snapshot?.presentation }

    /// The projects button: the panel opened or closed.
    func togglePanel() async {
        let open = !(presentation?.panelShown ?? false)
        await call { try $0.setProjectsPanel(open) }
    }

    /// A tap on a row of the panel: chosen (on the phone the panel closes), or, chosen already, folded.
    func pick(_ node: String) async {
        UISelectionFeedbackGenerator().selectionChanged()
        await call { try $0.pickProjectNode(node) }
    }

    /// The cross beside the filter's title: every task again.
    func clear() async {
        await call { try $0.clearProjectFilter() }
    }

    /// A mode picked in the view button's menu: the screen's one mode, the filter kept.
    func setMode(_ mode: ViewMode) async {
        guard mode != presentation?.chosen else { return }
        await call { try $0.setViewMode(mode) }
    }

    /// The view read again after the core changed it by itself (a carry's pause brought the panel out or opened a row):
    /// drawn over the lists as they are, the lists read only where the filter changed.
    func refresh() async {
        await call { _ in }
    }

    /// A project chosen from elsewhere (a card's folder, a page's project line), the branches above it opened.
    func select(_ node: String) async {
        await call { try $0.selectProjectNode(node) }
    }

    /// Where the ribbon stands, kept by the core; written in the order the ribbon moved.
    func writePlace(_ key: String) {
        let board = board
        let before = placeWrites
        placeWrites = Task {
            await before?.value
            try? await Task.detached { try board.setFunnelPlace(.string(key)) }.value
        }
    }

    /// A call that changes only this device's view, after the ones before it; then the core's view drawn over the lists
    /// as they are, and, where the filter changed, the lists read for it.
    private func call(_ change: @escaping @Sendable (TaskBoard) throws -> Void) async {
        let board = board
        let before = calls
        let mine = Task { [weak self] in
            await before?.value
            let view: Result<FunnelView, Error> = await Task.detached {
                Result {
                    try change(board)
                    return try board.funnelView()
                }
            }.value
            guard let self, let model = self.model else { return }
            switch view {
            case .success(let view):
                // By project's list is read before the view is drawn, so the two show in one drawing.
                await model.projects.prefetch(view)
                await model.adopt(view)
            case .failure(let error): model.problem(error)
            }
        }
        calls = mine
        await mine.value
    }
}
