import CloudKit
import CryptoKit
import Foundation
import Security

struct Preview {
  var id: String
  var title: String
  var body: String
  var chat: String?
  /// Shown again for a push whose note an earlier push already read.
  var repeated = false

  /// A note the desktop saved in the user's iCloud, sealed with the key of the account it is for.
  static func of(_ note: CKRecord) -> Preview? {
    guard
      let tag = note["tag"] as? String,
      let sealed = (note["sealed"] as? String).flatMap({ Data(base64Encoded: $0) }),
      let key = Shared.read("icloud.\(tag)")?["key"].flatMap({ Data(base64Encoded: $0) }),
      let box = try? AES.GCM.SealedBox(combined: sealed),
      let plaintext = try? AES.GCM.open(box, using: SymmetricKey(data: key)),
      let opened = try? JSONSerialization.jsonObject(with: plaintext) as? [String: String],
      let title = opened["title"], let body = opened["body"]
    else { return nil }
    return Preview(
      id: opened["id"] ?? note.recordID.recordName, title: title, body: body, chat: opened["chat"])
  }
}

/// The zone the desktop leaves notes in. iCloud does not wake a phone for its own changes,
/// so deleting what it read here costs no push.
actor Inbox {
  static let zoneName = "notes"
  static let shared = Inbox()

  private static let abandoned: TimeInterval = 24 * 60 * 60
  private static let recent: TimeInterval = 60
  private var last: Task<Preview?, Never>?
  private var shown: (preview: Preview, at: Date)?

  /// The newest note waiting, after deleting every note read. One push at a time, so two never show the same note;
  /// a push that finds nothing new repeats the last one, which then replaces its earlier notification.
  func take(_ zone: CKRecordZone.ID, in container: String) async -> Preview? {
    let previous = last
    let next = Task { () -> Preview? in
      _ = await previous?.value
      if let preview = await Self.read(zone, CKContainer(identifier: container).privateCloudDatabase) {
        self.shown = (preview, Date())
        return preview
      }
      guard let shown = self.shown, -shown.at.timeIntervalSinceNow < Self.recent else { return nil }
      var again = shown.preview
      again.repeated = true
      return again
    }
    last = next
    return await next.value
  }

  private static func read(_ zone: CKRecordZone.ID, _ database: CKDatabase) async -> Preview? {
    guard let changes = try? await database.recordZoneChanges(inZoneWith: zone, since: nil)
    else { return nil }
    let notes = changes.modificationResultsByID.values
      .compactMap { try? $0.get().record }
      .sorted { ($0.creationDate ?? .distantPast) < ($1.creationDate ?? .distantPast) }
    var newest: Preview?
    var done: [CKRecord.ID] = []
    for note in notes {
      if let preview = Preview.of(note) {
        newest = preview
        done.append(note.recordID)
      } else if let created = note.creationDate, -created.timeIntervalSinceNow > abandoned {
        done.append(note.recordID)
      }
    }
    if !done.isEmpty { _ = try? await database.modifyRecords(saving: [], deleting: done) }
    return newest
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
