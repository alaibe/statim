import CloudKit
import ExpoModulesCore
import UIKit

private let subscriptionID = "notes"
private let zoneID = CKRecordZone.ID(zoneName: "notes")

public class ICloudNotesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ICloudNotes")

    AsyncFunction("available") { (container: String) async throws -> Bool in
      try await CKContainer(identifier: container).accountStatus() == .available
    }

    // Production iCloud refuses query subscriptions, so the phone watches a zone of its own.
    AsyncFunction("subscribe") { (container: String) async throws in
      await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
      let database = CKContainer(identifier: container).privateCloudDatabase
      _ = try await database.save(CKRecordZone(zoneID: zoneID))
      let subscription = CKRecordZoneSubscription(zoneID: zoneID, subscriptionID: subscriptionID)
      subscription.recordType = "Note"
      let info = CKSubscription.NotificationInfo()
      info.alertBody = "New message"
      info.soundName = "default"
      info.shouldSendMutableContent = true
      subscription.notificationInfo = info
      _ = try await database.save(subscription)
    }

    AsyncFunction("unsubscribe") { (container: String) async throws in
      let database = CKContainer(identifier: container).privateCloudDatabase
      do {
        _ = try await database.deleteSubscription(withID: subscriptionID)
      } catch let error as CKError where error.code == .unknownItem {}
      do {
        _ = try await database.deleteRecordZone(withID: zoneID)
      } catch let error as CKError where error.code == .zoneNotFound {}
    }
  }
}
