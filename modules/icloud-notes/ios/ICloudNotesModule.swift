import CloudKit
import ExpoModulesCore
import UIKit

private let subscriptionID = "notes"

public class ICloudNotesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ICloudNotes")

    AsyncFunction("available") { (container: String) async throws -> Bool in
      try await CKContainer(identifier: container).accountStatus() == .available
    }

    AsyncFunction("subscribe") { (container: String) async throws in
      await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
      let subscription = CKQuerySubscription(
        recordType: "Note",
        predicate: NSPredicate(value: true),
        subscriptionID: subscriptionID,
        options: [.firesOnRecordCreation])
      let info = CKSubscription.NotificationInfo()
      info.alertBody = "New message"
      info.soundName = "default"
      info.shouldSendMutableContent = true
      info.desiredKeys = ["tag", "sealed"]
      subscription.notificationInfo = info
      _ = try await CKContainer(identifier: container).privateCloudDatabase.save(subscription)
    }

    AsyncFunction("unsubscribe") { (container: String) async throws in
      do {
        _ = try await CKContainer(identifier: container).privateCloudDatabase
          .deleteSubscription(withID: subscriptionID)
      } catch let error as CKError where error.code == .unknownItem {}
    }
  }
}
