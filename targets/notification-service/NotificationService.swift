import UserNotifications

/// Turns the "New message" of an iCloud push into who wrote and what.
class NotificationService: UNNotificationServiceExtension {
  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    let content = request.content.mutableCopy() as! UNMutableNotificationContent
    if let preview = Preview.of(request.content.userInfo) {
      content.title = preview.title
      content.body = preview.body
      if let chat = preview.chat {
        content.threadIdentifier = chat
        content.userInfo["body"] = ["chatId": chat]
      }
    }
    contentHandler(content)
  }
}
