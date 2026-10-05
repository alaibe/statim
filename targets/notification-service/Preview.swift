import CloudKit
import CryptoKit
import Foundation
import Security

struct Preview: Equatable {
  var title: String
  var body: String
  var chat: String? = nil

  static func of(_ info: [AnyHashable: Any]) async -> Preview? {
    if info["ck"] != nil { return icloud(info) }
    guard let account = info["statim_account"] as? String else { return nil }
    if let sealed = info["telegram"] as? [String: Any] {
      return telegram(sealed, keys: Shared.read("push.telegram.\(account)"))
    }
    if let room = info["room_id"] as? String, let event = info["event_id"] as? String {
      return await matrix(room: room, event: event, session: Shared.read("push.matrix.\(account)"))
    }
    return nil
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

// MARK: - iCloud

extension Preview {
  /// A note the desktop saved in the user's iCloud, sealed with the key of the account it is for.
  static func icloud(_ info: [AnyHashable: Any]) -> Preview? {
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
    return Preview(title: title, body: body, chat: note["chat"].flatMap { $0.isEmpty ? nil : $0 })
  }
}

// MARK: - Matrix

extension Preview {
  /// The push carries ids only; the event comes from the homeserver with the app's own session.
  static func matrix(room: String, event: String, session: [String: String]?) async -> Preview? {
    guard let session, let homeserver = session["homeserverUrl"], let token = session["accessToken"]
    else { return nil }
    let get = { (path: String) in await MatrixGet.json(homeserver, path, token: token) }
    let roomPath = "/_matrix/client/v3/rooms/\(escape(room))"
    guard let found = await get("\(roomPath)/event/\(escape(event))"),
      let sender = found["sender"] as? String,
      let text = describe(found)
    else { return nil }
    let member = await get("\(roomPath)/state/m.room.member/\(escape(sender))")
    let senderName = member?["displayname"] as? String ?? sender
    let roomName = await get("\(roomPath)/state/m.room.name")?["name"] as? String
    if let roomName, !roomName.isEmpty, roomName != senderName {
      return Preview(title: roomName, body: "\(senderName): \(text)")
    }
    return Preview(title: senderName, body: text)
  }

  static func describe(_ event: [String: Any]) -> String? {
    let content = event["content"] as? [String: Any] ?? [:]
    switch event["type"] as? String {
    case "m.room.message":
      switch content["msgtype"] as? String {
      case "m.image": return "\u{1F4F7} Photo"
      case "m.video": return "\u{1F3AC} Video"
      case "m.audio": return "\u{1F3A4} Voice message"
      case "m.file": return "\u{1F4CE} \(content["body"] as? String ?? "File")"
      default: return content["body"] as? String
      }
    case "m.sticker": return "Sticker"
    case "m.room.encrypted": return "New message"
    default: return nil
    }
  }

  private static func escape(_ segment: String) -> String {
    segment.addingPercentEncoding(
      withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~"))) ?? segment
  }
}

enum MatrixGet {
  static func json(_ homeserver: String, _ path: String, token: String) async -> [String: Any]? {
    guard let url = URL(string: homeserver.trimmingCharacters(in: ["/"]) + path) else { return nil }
    var request = URLRequest(url: url, timeoutInterval: 10)
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    guard let (data, response) = try? await URLSession.shared.data(for: request),
      (response as? HTTPURLResponse)?.statusCode == 200
    else { return nil }
    return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
  }
}

// MARK: - Telegram

extension Preview {
  /// Telegram's web push, encrypted to the keys the app registered (RFC 8291).
  static func telegram(_ sealed: [String: Any], keys: [String: String]?) -> Preview? {
    guard let keys,
      let body = (sealed["body"] as? String).flatMap({ Data(base64Encoded: $0) }),
      let secret = Base64URL.decode(keys["privateKey"]),
      let auth = Base64URL.decode(keys["auth"]),
      let privateKey = try? P256.KeyAgreement.PrivateKey(rawRepresentation: secret),
      let plaintext = try? WebPush.open(body, privateKey: privateKey, auth: auth),
      let message = try? JSONSerialization.jsonObject(with: plaintext) as? [String: Any]
    else { return nil }
    if let title = message["title"] as? String, let text = message["description"] as? String {
      return Preview(title: title, body: text)
    }
    if let args = message["loc_args"] as? [String], let first = args.first {
      return Preview(title: first, body: args.count > 1 ? args[args.count - 1] : "New message")
    }
    return nil
  }
}

enum WebPush {
  enum Failure: Error { case malformed }

  /// One aes128gcm record, as push services send it.
  static func open(_ body: Data, privateKey: P256.KeyAgreement.PrivateKey, auth: Data) throws -> Data {
    let bytes = [UInt8](body)
    guard bytes.count > 21 else { throw Failure.malformed }
    let salt = Data(bytes[0..<16])
    let idLength = Int(bytes[20])
    guard bytes.count > 21 + idLength + 16 else { throw Failure.malformed }
    let senderKey = Data(bytes[21..<(21 + idLength)])
    let record = Data(bytes[(21 + idLength)...])

    let shared = try privateKey.sharedSecretFromKeyAgreement(
      with: P256.KeyAgreement.PublicKey(x963Representation: senderKey))
    let keyInfo = Data("WebPush: info\0".utf8) + privateKey.publicKey.x963Representation + senderKey
    let ikm = shared.hkdfDerivedSymmetricKey(
      using: SHA256.self, salt: auth, sharedInfo: keyInfo, outputByteCount: 32)
    let cek = HKDF<SHA256>.deriveKey(
      inputKeyMaterial: ikm, salt: salt, info: Data("Content-Encoding: aes128gcm\0".utf8),
      outputByteCount: 16)
    let nonce = HKDF<SHA256>.deriveKey(
      inputKeyMaterial: ikm, salt: salt, info: Data("Content-Encoding: nonce\0".utf8),
      outputByteCount: 12)

    let box = try AES.GCM.SealedBox(
      nonce: AES.GCM.Nonce(data: nonce.withUnsafeBytes { Data($0) }),
      ciphertext: record.dropLast(16),
      tag: record.suffix(16))
    let padded = try AES.GCM.open(box, using: cek)
    guard let end = padded.lastIndex(where: { $0 != 0 }), padded[end] == 2 else {
      throw Failure.malformed
    }
    return padded[padded.startIndex..<end]
  }
}

enum Base64URL {
  static func decode(_ text: String?) -> Data? {
    guard var text else { return nil }
    text = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    text += String(repeating: "=", count: (4 - text.count % 4) % 4)
    return Data(base64Encoded: text)
  }
}
