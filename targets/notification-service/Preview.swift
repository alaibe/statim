import CloudKit
import CryptoKit
import Foundation
import Security

struct Preview {
  var title: String
  var body: String
  var chat: String? = nil

  /// A note the desktop saved in the user's iCloud, sealed with the key of the account it is for.
  static func of(_ info: [AnyHashable: Any]) -> Preview? {
    guard
      let notification = CKNotification(fromRemoteNotificationDictionary: info)
        as? CKQueryNotification,
      let tag = notification.recordFields?["tag"] as? String,
      let sealed = (notification.recordFields?["sealed"] as? String)
        .flatMap({ Data(base64Encoded: $0) }),
      let key = Shared.read("icloud.\(tag)")?["key"].flatMap({ Data(base64Encoded: $0) }),
      let box = try? AES.GCM.SealedBox(combined: sealed),
      let plaintext = try? AES.GCM.open(box, using: SymmetricKey(data: key)),
      let note = try? JSONSerialization.jsonObject(with: plaintext) as? [String: String],
      let title = note["title"], let body = note["body"]
    else { return nil }
    return Preview(title: title, body: body, chat: note["chat"])
  }
}

/// What the app wrote with expo-secure-store into the keychain group it shares with this extension.
enum Shared {
  static func read(_ key: String) -> [String: String]? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: Data(key.utf8),
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return try? JSONSerialization.jsonObject(with: data) as? [String: String]
  }
}
