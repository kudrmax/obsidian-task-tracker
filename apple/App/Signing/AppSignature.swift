import Foundation

/// When the installed app's signature runs out: the `ExpirationDate` of the provisioning profile Xcode puts into the
/// app. None in the simulator; there `-SignatureHoursLeft <hours>` stands in for it.
enum AppSignature {
    static let expiration: Date? = override ?? profileExpiration()

    private static var override: Date? {
        let hours = UserDefaults.standard.double(forKey: "SignatureHoursLeft")
        return hours == 0 ? nil : Date().addingTimeInterval(hours * 3600)
    }

    private static func profileExpiration() -> Date? {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let text = String(data: data, encoding: .isoLatin1),
              let start = text.range(of: "<?xml"), let end = text.range(of: "</plist>"),
              let plist = text[start.lowerBound..<end.upperBound].data(using: .isoLatin1),
              let profile = try? PropertyListSerialization.propertyList(from: plist, format: nil) as? [String: Any]
        else { return nil }
        return profile["ExpirationDate"] as? Date
    }
}
