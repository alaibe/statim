import Foundation

// Status codes shared with src/ai.rs.
private let translated: Int32 = 0
private let languageMissing: Int32 = 1
private let failed: Int32 = 2

/// Blocks until Apple Translation answers; call it off the main thread.
/// `out` receives the translation, or an error message, as a malloc'd string.
@_cdecl("statim_translate")
public func statimTranslate(
  _ text: UnsafePointer<CChar>,
  _ target: UnsafePointer<CChar>,
  _ out: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> Int32 {
  guard #available(macOS 26.0, *) else {
    out.pointee = strdup("Translating on this Mac needs macOS 26 or later.")
    return failed
  }
  let input = String(cString: text)
  let language = String(cString: target)
  let done = DispatchSemaphore(value: 0)
  let box = ResultBox()
  Task.detached {
    do {
      box.value = (translated, try await AppleTranslation.translate(input, to: language))
    } catch let failure as TranslationFailure {
      box.value = (failure.code == "ERR_LANGUAGE_MISSING" ? languageMissing : failed, failure.message)
    } catch {
      box.value = (failed, error.localizedDescription)
    }
    done.signal()
  }
  done.wait()
  out.pointee = strdup(box.value.1)
  return box.value.0
}

@_cdecl("statim_free")
public func statimFree(_ pointer: UnsafeMutablePointer<CChar>?) {
  free(pointer)
}

/// Written once by the task, read after the semaphore says it is done.
private final class ResultBox: @unchecked Sendable {
  var value: (Int32, String) = (failed, "")
}
