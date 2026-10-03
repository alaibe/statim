import ExpoModulesCore

public class TdJsonModule: Module {
  private var clientId: Int?

  public func definition() -> ModuleDefinition {
    Name("TdJson")

    Function("create") { () -> Int in
      guard let td = Library.shared else { throw NotBundledException() }
      _ = td.execute(#"{"@type":"setLogVerbosityLevel","new_verbosity_level":0}"#)
      let id = Int(td.createClientId())
      clientId = id
      return id
    }

    Function("send") { (id: Int, request: String) in
      Library.shared?.send(Int32(id), request)
    }

    AsyncFunction("receive") { (timeout: Double, limit: Int, promise: Promise) in
      Library.receiver.async {
        var batch: [String] = []
        var wait = timeout
        while batch.count < limit, let event = Library.shared?.receive(wait) {
          batch.append(String(cString: event))
          wait = 0
        }
        promise.resolve("[" + batch.joined(separator: ",") + "]")
      }
    }

    Function("destroy") { (id: Int) in
      if clientId == id { clientId = nil }
    }

    // A reload starts a new JS runtime against the same database, which TDLib
    // keeps locked until the old client has closed.
    OnDestroy {
      if let id = clientId { Library.shared?.send(Int32(id), #"{"@type":"close"}"#) }
    }
  }
}

private struct Library {
  let createClientId: @convention(c) () -> Int32
  let send: @convention(c) (Int32, UnsafePointer<CChar>) -> Void
  let receive: @convention(c) (Double) -> UnsafePointer<CChar>?
  let execute: @convention(c) (UnsafePointer<CChar>) -> UnsafePointer<CChar>?

  static let shared: Library? = {
    guard let frameworks = Bundle.main.privateFrameworksPath,
      let handle = dlopen("\(frameworks)/libtdjson.framework/libtdjson", RTLD_NOW | RTLD_LOCAL),
      let createClientId = dlsym(handle, "td_create_client_id"),
      let send = dlsym(handle, "td_send"),
      let receive = dlsym(handle, "td_receive"),
      let execute = dlsym(handle, "td_execute")
    else { return nil }
    return Library(
      createClientId: unsafeBitCast(createClientId, to: (@convention(c) () -> Int32).self),
      send: unsafeBitCast(send, to: (@convention(c) (Int32, UnsafePointer<CChar>) -> Void).self),
      receive: unsafeBitCast(receive, to: (@convention(c) (Double) -> UnsafePointer<CChar>?).self),
      execute: unsafeBitCast(
        execute, to: (@convention(c) (UnsafePointer<CChar>) -> UnsafePointer<CChar>?).self)
    )
  }()

  // TDLib allows one receive at a time per process, across reloads too.
  static let receiver = DispatchQueue(label: "im.statim.tdjson.receive")
}

private final class NotBundledException: Exception {
  override var reason: String {
    "TDLib is not part of this build: `scripts/fetch-tdlib-ios.sh` builds it."
  }
}
