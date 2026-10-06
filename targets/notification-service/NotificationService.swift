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
      if let preview = await Inbox.shared.take(zone, in: container) {
        content.title = preview.title
        content.body = preview.body
        if let chat = preview.chat {
          content.threadIdentifier = chat
          content.userInfo["body"] = ["chatId": chat]
        }
      } else {
        // An earlier push already showed what this one was for.
        content.sound = nil
        content.interruptionLevel = .passive
      }
      self.finish()
    }
  }

  override func serviceExtensionTimeWillExpire() {
    Task { @MainActor in self.finish() }
  }

  @MainActor private func finish() {
    deliver?()
    deliver = nil
  }
}
