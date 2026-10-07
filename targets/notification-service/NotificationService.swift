import CloudKit
import UserNotifications

/// Turns the "New message" of an iCloud push into who wrote and what.
class NotificationService: UNNotificationServiceExtension {
  private var deliver: (() -> Void)?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    let content = request.content.mutableCopy() as! UNMutableNotificationContent
    guard
      let notification = CKNotification(fromRemoteNotificationDictionary: request.content.userInfo)
        as? CKRecordZoneNotification,
      let zone = notification.recordZoneID, zone.zoneName == Inbox.zoneName,
      let container = notification.containerIdentifier
    else { return contentHandler(content) }
    deliver = { contentHandler(content) }
    Task { @MainActor in
      let preview = await Inbox.shared.take(zone, in: container)
      if let preview {
        content.title = preview.title
        content.body = preview.body
        if let chat = preview.chat { content.threadIdentifier = chat }
        content.userInfo["body"] = ["chatId": preview.chat, "id": preview.id].compactMapValues { $0 }
        if let id = preview.id { await Self.dismiss(id) }
      }
      if preview == nil || preview?.repeated == true {
        content.sound = nil
        content.interruptionLevel = .passive
      }
      self.finish()
    }
  }

  /// The app notifies for messages it sees itself, under the same id, and an earlier push may have shown this one.
  private static func dismiss(_ id: String) async {
    let center = UNUserNotificationCenter.current()
    let same = await center.deliveredNotifications().filter {
      $0.request.identifier == id
        || ($0.request.content.userInfo["body"] as? [String: Any])?["id"] as? String == id
    }
    center.removeDeliveredNotifications(withIdentifiers: same.map(\.request.identifier))
  }

  override func serviceExtensionTimeWillExpire() {
    Task { @MainActor in self.finish() }
  }

  @MainActor private func finish() {
    deliver?()
    deliver = nil
  }
}
