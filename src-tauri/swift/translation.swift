import Foundation
import NaturalLanguage
import Translation

// Status codes shared with src/ai.rs.
private let translated: Int32 = 0
private let languageMissing: Int32 = 1
private let languageUnsupported: Int32 = 2
private let failed: Int32 = 3

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
    return languageUnsupported
  }
  let input = String(cString: text)
  let destination = Locale.Language(identifier: String(cString: target))
  let done = DispatchSemaphore(value: 0)
  let box = ResultBox()
  Task.detached {
    box.value = await translate(input, to: destination)
    done.signal()
  }
  done.wait()
  out.pointee = strdup(box.value.1)
  return box.value.0
}

/// Written once by the task, read after the semaphore says it is done.
private final class ResultBox: @unchecked Sendable {
  var value: (Int32, String) = (failed, "")
}

@_cdecl("statim_free")
public func statimFree(_ pointer: UnsafeMutablePointer<CChar>?) {
  free(pointer)
}

@available(macOS 26.0, *)
private func translate(_ text: String, to destination: Locale.Language) async -> (Int32, String) {
  guard let detected = NLLanguageRecognizer.dominantLanguage(for: text) else {
    return (languageUnsupported, "Could not tell which language this is.")
  }
  let source = Locale.Language(identifier: detected.rawValue)
  if source.languageCode == destination.languageCode && source.script == destination.script {
    return (translated, text)
  }
  switch await LanguageAvailability().status(from: source, to: destination) {
  case .installed:
    do {
      let session = TranslationSession(installedSource: source, target: destination)
      var lines: [String] = []
      for line in text.components(separatedBy: "\n") {
        let blank = line.trimmingCharacters(in: .whitespaces).isEmpty
        lines.append(blank ? line : try await session.translate(line).targetText)
      }
      return (translated, lines.joined(separator: "\n"))
    } catch {
      return (failed, error.localizedDescription)
    }
  case .supported:
    return (languageMissing, "The language is not downloaded on this Mac.")
  default:
    return (languageUnsupported, "Apple Translation does not support this pair.")
  }
}
