import Core
import SwiftUI

/// The top of Settings: how long until the app stops opening and has to be installed from the Mac again.
struct SigningPlate: View {
    let expiration: Date

    var body: some View {
        Section {
            TimelineView(.periodic(from: .now, by: 60)) { context in
                let countdown = SigningExpiry.countdown(expiration: expiration, now: context.date)
                HStack(spacing: 14) {
                    Image(systemName: "signature")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(color(countdown.urgency), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title(countdown.left))
                            .font(.headline)
                            .foregroundStyle(countdown.urgency == .calm ? Color.primary : color(countdown.urgency))
                        Text("Signature ends \(SigningText.end(expiration))")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 2)
            }
        } footer: {
            Text("Install the app from the Mac again before then.")
        }
    }

    private func title(_ left: SigningCountdown.Left) -> String {
        left == .expired ? "Signature Expired" : "\(SigningText.left(left)) left"
    }

    private func color(_ urgency: SigningCountdown.Urgency) -> Color {
        switch urgency {
        case .calm: .green
        case .soon: .orange
        case .urgent, .expired: .red
        }
    }
}
