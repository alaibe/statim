import UserNotifications

/// Turns the "New message" of a push into who wrote and what, from what the app shared.
class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var deliver: ((UNNotificationContent) -> Void)?
  private var original: UNNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    lock.withLock {
      deliver = contentHandler
      original = request.content
    }
    let info = request.content.userInfo
    Task {
      let content = request.content.mutableCopy() as! UNMutableNotificationContent
      if let preview = await Preview.of(info) {
        content.title = preview.title
        content.body = preview.body
        if let chat = preview.chat {
          content.threadIdentifier = chat
          content.userInfo["body"] = ["chatId": chat]
        }
      }
      finish(with: content)
    }
  }

  override func serviceExtensionTimeWillExpire() {
    if let original = lock.withLock({ original }) { finish(with: original) }
  }

  private func finish(with content: UNNotificationContent) {
    let handler = lock.withLock { () -> ((UNNotificationContent) -> Void)? in
      defer { deliver = nil }
      return deliver
    }
    handler?(content)
  }
}
